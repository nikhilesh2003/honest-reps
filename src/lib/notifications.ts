"use client";

import { AppStatePayload } from "./client-types";
import { createSupabaseBrowserClient } from "./supabase/client";

export interface InAppNotificationItem {
  id: string;
  title: string;
  body: string;
  category: "admin" | "calibration" | "friend" | "leaderboard" | "streak" | "daily";
  createdAt: string;
  read: boolean;
  url?: string;
}

const INBOX_KEY = "hr_notification_inbox_v1";
const LAST_DEVICE_NOTIF_KEY = "hr_last_device_notif_at_v1";
const DEVICE_BURST_COOLDOWN_MS = 4000;

let evaluationInFlight: Promise<void> | null = null;

export function getInAppNotifications(): InAppNotificationItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INBOX_KEY);
    return raw ? (JSON.parse(raw) as InAppNotificationItem[]) : [];
  } catch {
    return [];
  }
}

export function markAllInAppNotificationsRead(): InAppNotificationItem[] {
  if (typeof window === "undefined") return [];
  const items = getInAppNotifications().map((n) => ({ ...n, read: true }));
  try {
    localStorage.setItem(INBOX_KEY, JSON.stringify(items));
  } catch {}
  return items;
}

export function clearInAppNotifications(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INBOX_KEY, "[]");
  } catch {}
}

export function pushInAppNotification(
  item: Omit<InAppNotificationItem, "createdAt" | "read">
): InAppNotificationItem {
  const list = getInAppNotifications();
  const existing = list.find((n) => n.id === item.id);
  if (existing) return existing;

  const created: InAppNotificationItem = {
    ...item,
    createdAt: new Date().toISOString(),
    read: false,
  };
  const next = [created, ...list].slice(0, 30);
  try {
    localStorage.setItem(INBOX_KEY, JSON.stringify(next));
  } catch {}
  return created;
}

async function resolveServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return undefined;
  }
  const sw = navigator.serviceWorker;
  try {
    if (typeof sw.getRegistration === "function") {
      const existing = await Promise.race([
        sw.getRegistration(),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1000)),
      ]);
      if (existing) return existing;
    }
    if (typeof sw.register === "function") {
      const registered = await Promise.race([
        sw.register("/sw.js").catch(() => undefined),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1200)),
      ]);
      if (registered) return registered;
    }
    if (sw.ready) {
      const readyReg = await Promise.race([
        sw.ready.catch(() => undefined),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1000)),
      ]);
      if (readyReg) return readyReg;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    const sb = createSupabaseBrowserClient();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function dispatchServerPush(payload: Record<string, unknown>): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const token = await getSupabaseAccessToken();
    if (!token) return false;
    const res = await fetch("/api/push.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureWebPushSubscribed(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  if (!vapidPublicKey) return false;

  try {
    const reg = await resolveServiceWorkerRegistration();
    if (!reg || !reg.pushManager) return false;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const appServerKey = urlBase64ToUint8Array(vapidPublicKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });
    }

    const json = sub.toJSON();
    const endpoint = json.endpoint || sub.endpoint;
    const p256dh = json.keys?.p256dh || "";
    const authKey = json.keys?.auth || "";
    if (!endpoint || !p256dh || !authKey) return false;

    // Direct Supabase push_subscriptions sync backup
    try {
      const sb = createSupabaseBrowserClient();
      if (sb) {
        const { data: userData } = await sb.auth.getUser();
        if (userData?.user?.id) {
          await sb.from("push_subscriptions").upsert(
            {
              user_id: userData.user.id,
              device_endpoint: endpoint,
              p256dh,
              auth_key: authKey,
            },
            { onConflict: "device_endpoint" }
          );
        }
      }
    } catch {
      // Non-blocking
    }

    return await dispatchServerPush({
      action: "subscribe",
      endpoint,
      p256dh,
      authKey,
    });
  } catch {
    return false;
  }
}

export async function unsubscribeWebPush(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await resolveServiceWorkerRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await dispatchServerPush({ action: "unsubscribe", endpoint });
    }
  } catch {
    // Non-blocking
  }
}

export async function showLocalNotification(
  title: string,
  body: string,
  tag = "honest-reps",
  url = "/"
): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  const fullOptions: NotificationOptions & Record<string, unknown> = {
    body,
    icon: "/icon-192x192.png",
    badge: "/favicon-96x96.png",
    tag,
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    silent: false,
    timestamp: Date.now(),
    data: { url },
  };

  const basicOptions: NotificationOptions = {
    body,
    icon: "/icon-192x192.png",
    badge: "/favicon-96x96.png",
    tag,
    data: { url },
  };

  try {
    const reg = await resolveServiceWorkerRegistration();
    if (reg && typeof reg.showNotification === "function") {
      try {
        await reg.showNotification(title, fullOptions);
        return true;
      } catch {
        try {
          await reg.showNotification(title, basicOptions);
          return true;
        } catch {
          // Fall through to SW message or window Notification
        }
      }
    }

    if (reg?.active && typeof reg.active.postMessage === "function") {
      try {
        reg.active.postMessage({
          type: "SHOW_NOTIFICATION",
          title,
          body,
          tag,
          url,
        });
      } catch {
        // Continue to window Notification fallback
      }
    }
  } catch {
    // Fall through to window Notification constructor
  }

  try {
    new Notification(title, {
      body,
      icon: "/icon-192x192.png",
      badge: "/favicon-96x96.png",
      tag,
      data: { url },
    });
    return true;
  } catch {
    return false;
  }
}

export async function requestAppNotificationPermission(): Promise<
  "granted" | "denied" | "default" | "unsupported"
> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") {
    void ensureWebPushSubscribed();
    return "granted";
  }
  try {
    const res = await Notification.requestPermission();
    if (res === "granted") {
      void ensureWebPushSubscribed();
    }
    return res;
  } catch {
    return "denied";
  }
}

export async function syncServiceWorkerConfig(state: AppStatePayload): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await resolveServiceWorkerRegistration();
    const target = reg?.active || navigator.serviceWorker.controller;
    if (!target || typeof target.postMessage !== "function") return;

    const deviceDeliveredKey = `hr_notif_device_ann_${state.profile.userId}`;
    let deliveredIds: string[] = [];
    try {
      deliveredIds = JSON.parse(localStorage.getItem(deviceDeliveredKey) || "[]");
    } catch {
      deliveredIds = [];
    }

    target.postMessage({
      type: "CONFIG_SW_SYNC",
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
      userId: state.profile.userId,
      username: state.profile.username,
      isCalibrating:
        state.todaySummary.status === "Calibrating" || state.monthStats.isMonthCalibrating,
      isInactiveToday: state.todaySummary.itemCount === 0 && !state.todaySummary.isRest,
      hasActiveStreak: state.monthStats.currentStreak > 0,
      gymStartedAt: state.profile.inGym ? state.profile.gymStartedAt ?? null : null,
      deliveredIds,
    });
  } catch {
    // Ignore in environments without active SW
  }
}

function getLocalHHMM(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function isInQuietHours(nowHHMM: string, start: string, end: string): boolean {
  if (!start || !end || start === end) return false;
  if (start < end) {
    return nowHHMM >= start && nowHHMM < end;
  }
  return nowHHMM >= start || nowHHMM < end;
}

export function matchesNotificationTarget(
  target: string | undefined,
  state: AppStatePayload
): boolean {
  const t = (target || "all").trim().toLowerCase();
  if (t === "all") return true;
  if (t === "calibrating") {
    return (
      state.todaySummary.status === "Calibrating" ||
      state.monthStats.isMonthCalibrating
    );
  }
  if (t === "inactive_2d") {
    return state.todaySummary.itemCount === 0 && !state.todaySummary.isRest;
  }
  if (t === "active_streak") {
    return state.monthStats.currentStreak > 0;
  }
  const uname = state.profile.username.toLowerCase();
  return t.replace(/^@/, "") === uname;
}

export async function evaluateAndTriggerReminders(
  state: AppStatePayload,
  onInAppNotify?: (title: string, body: string) => void
): Promise<void> {
  if (typeof window === "undefined") return;
  if (evaluationInFlight) {
    await evaluationInFlight;
    return;
  }

  const run = async () => {
    const settings = state.notificationSettings;
    const nowHHMM = getLocalHHMM();
    const inQuiet = isInQuietHours(nowHHMM, settings.quietHoursStart, settings.quietHoursEnd);
    const todayIso = state.realTodayIso;

    // Anti-burst: cap to at most 1 device popup per cycle and enforce a 4s minimum cooldown
    let devicePopupsThisRun = 0;
    const canFireDevicePopup = () => {
      if (devicePopupsThisRun >= 1) return false;
      try {
        const lastAt = Number(localStorage.getItem(LAST_DEVICE_NOTIF_KEY) || "0");
        if (lastAt > 0 && Date.now() - lastAt < DEVICE_BURST_COOLDOWN_MS) {
          return false;
        }
      } catch {}
      return true;
    };

    const deliverAlert = async (params: {
      id: string;
      title: string;
      body: string;
      category: InAppNotificationItem["category"];
      tag: string;
      url?: string;
      bypassQuietHours?: boolean;
      skipInApp?: boolean;
      allowDevicePopup?: boolean;
    }): Promise<boolean> => {
      if (!params.skipInApp) {
        pushInAppNotification({
          id: params.id,
          title: params.title,
          body: params.body,
          category: params.category,
          url: params.url,
        });
        if (onInAppNotify && params.allowDevicePopup !== false) {
          onInAppNotify(params.title, params.body);
        }
      }

      // CRITICAL FOR MOBILE / IPHONE:
      // If the app is currently in the foreground (open in browser/PWA),
      // the user has already received the in-app inbox and toast notification.
      // Do NOT trigger an OS system notification popup banner on top of the active open app.
      const isForeground =
        typeof document !== "undefined" && document.visibilityState === "visible";
      if (isForeground) {
        return false;
      }

      if (params.allowDevicePopup === false) return false;
      if ((!inQuiet || params.bypassQuietHours) && canFireDevicePopup()) {
        const shown = await showLocalNotification(
          `Honest Reps · ${params.title}`,
          params.body,
          params.tag,
          params.url || "/"
        );
        if (shown) {
          devicePopupsThisRun++;
          try {
            localStorage.setItem(LAST_DEVICE_NOTIF_KEY, String(Date.now()));
          } catch {}
        }
        return shown;
      }
      return false;
    };

    // 1. Admin custom & targeted notifications (delivered without bursting older backlog)
    if (state.announcements && state.announcements.length > 0) {
      const seenAnnKey = `hr_notif_seen_ann_${state.profile.userId}`;
      const deviceAnnKey = `hr_notif_device_ann_${state.profile.userId}`;
      let seenAnn: string[] = [];
      let deviceAnn: string[] = [];
      try {
        seenAnn = JSON.parse(localStorage.getItem(seenAnnKey) || "[]");
      } catch {
        seenAnn = [];
      }
      try {
        deviceAnn = JSON.parse(localStorage.getItem(deviceAnnKey) || "[]");
      } catch {
        deviceAnn = [];
      }
      const seenAnnSet = new Set(seenAnn);
      const deviceAnnSet = new Set(deviceAnn);

      const matchingAnnouncements = state.announcements.filter((a) =>
        matchesNotificationTarget(a.target, state)
      );

      let seenChanged = false;
      let deviceChanged = false;
      let triggeredOneAnn = false;

      for (const ann of matchingAnnouncements) {
        const alreadyInApp = seenAnnSet.has(ann.id);
        const alreadyOnDevice = deviceAnnSet.has(ann.id);
        if (alreadyInApp && alreadyOnDevice) continue;

        if (!alreadyInApp) {
          seenAnnSet.add(ann.id);
          seenChanged = true;
        }

        // Only pop up the single newest announcement on device; older backlog enters inbox quietly
        const shouldPop = !triggeredOneAnn && !alreadyOnDevice;
        const deviceShown = await deliverAlert({
          id: `ann_${ann.id}`,
          title: ann.title,
          body: ann.body,
          category: "admin",
          tag: `admin-ann-${ann.id}`,
          url: "/",
          bypassQuietHours: true,
          skipInApp: alreadyInApp,
          allowDevicePopup: shouldPop,
        });

        if (shouldPop) {
          triggeredOneAnn = true;
          if (deviceShown) {
            deviceAnnSet.add(ann.id);
            deviceChanged = true;
          }
        } else if (!alreadyOnDevice && Notification.permission === "granted") {
          // Suppress historical burst while keeping permission=default pending behavior intact
          deviceAnnSet.add(ann.id);
          deviceChanged = true;
        }
      }

      if (seenChanged) {
        try {
          localStorage.setItem(seenAnnKey, JSON.stringify(Array.from(seenAnnSet)));
        } catch {}
      }
      if (deviceChanged) {
        try {
          localStorage.setItem(deviceAnnKey, JSON.stringify(Array.from(deviceAnnSet)));
        } catch {}
      }
    }

    void syncServiceWorkerConfig(state);

    // 2. Friend requests & connected friends (clicking opens Friends tab '/?tab=friends')
    if (settings.friendRequestsEnabled) {
      if (state.incomingRequests.length > 0) {
        const seenKey = `hr_notif_seen_reqs_${state.profile.userId}`;
        let seen: string[] = [];
        try {
          seen = JSON.parse(localStorage.getItem(seenKey) || "[]");
        } catch {
          seen = [];
        }
        const seenSet = new Set(seen);
        const unseen = state.incomingRequests.filter((r) => !seenSet.has(r.friendshipId));
        if (unseen.length > 0) {
          localStorage.setItem(
            seenKey,
            JSON.stringify(state.incomingRequests.map((r) => r.friendshipId))
          );
          const first = unseen[0];
          await deliverAlert({
            id: `freq_${first.friendshipId}`,
            title: "New Friend Request",
            body:
              unseen.length === 1
                ? `${first.name} (@${first.username}) sent you a friend request.`
                : `${unseen.length} new friend requests waiting in Friends.`,
            category: "friend",
            tag: `friend-request-${first.friendshipId}`,
            url: "/?tab=friends",
            bypassQuietHours: true,
          });
        }
      }

      const friendMembers = state.leaderboard.filter((m) => !m.isMe);
      const seenFriendsKey = `hr_notif_seen_friends_${state.profile.userId}`;
      let prevFriends: string[] = [];
      try {
        prevFriends = JSON.parse(localStorage.getItem(seenFriendsKey) || "[]");
      } catch {
        prevFriends = [];
      }
      const prevSet = new Set(prevFriends);
      const newlyConnected = friendMembers.filter((m) => !prevSet.has(m.userId));
      if (newlyConnected.length > 0) {
        localStorage.setItem(
          seenFriendsKey,
          JSON.stringify(friendMembers.map((m) => m.userId))
        );
        const f = newlyConnected[0];
        await deliverAlert({
          id: `fconn_${f.userId}`,
          title: "Friend Connected",
          body: `@${f.username} is connected on your Effort Leaderboard.`,
          category: "friend",
          tag: `friend-connected-${f.userId}`,
          url: "/?tab=friends",
          bypassQuietHours: true,
        });
      }
    }

    // 3. Calibration milestone notification
    if (settings.summariesEnabled) {
      const calStageKey = `hr_notif_cal_stage_${state.profile.userId}`;
      const prevStage = localStorage.getItem(calStageKey);
      const currentStage =
        state.todaySummary.status === "Scored" ||
        (state.monthStats.monthEffort !== null && !state.monthStats.isMonthCalibrating)
          ? "scored"
          : (state.todaySummary.status === "Calibrating" &&
              state.todaySummary.effortScore !== null) ||
            (state.monthStats.isMonthCalibrating && state.monthStats.monthEffort !== null)
          ? "est_active"
          : prevStage || "none";

      if (currentStage === "est_active" && prevStage !== "est_active" && prevStage !== "scored") {
        const estScore =
          state.todaySummary.effortScore ?? state.monthStats.monthEffort ?? 80;
        localStorage.setItem(calStageKey, "est_active");
        await deliverAlert({
          id: `cal_est_${state.profile.userId}`,
          title: "Est. Effort Active",
          body: `Your estimated effort is ${estScore}/100. Log 2 more sessions to unlock your personal 50 = usual baseline.`,
          category: "calibration",
          tag: "calibration-est",
          bypassQuietHours: true,
        });
      } else if (currentStage === "scored" && prevStage !== "scored") {
        localStorage.setItem(calStageKey, "scored");
        await deliverAlert({
          id: `cal_scored_${state.profile.userId}`,
          title: "Baseline Calibrated",
          body: "Personal 50 = usual baseline unlocked. Every workout is now scored against your own history.",
          category: "calibration",
          tag: "calibration-scored",
          bypassQuietHours: true,
        });
      }

      // 4. Leaderboard rank notification
      const ranked = [...state.leaderboard]
        .filter((e) => e.monthEffort !== null)
        .sort((a, b) => (b.monthEffort ?? 0) - (a.monthEffort ?? 0));
      if (ranked.length >= 2) {
        const myIdx = ranked.findIndex((e) => e.isMe);
        if (myIdx >= 0) {
          const myRank = myIdx + 1;
          const me = ranked[myIdx];
          const rankKey = `hr_notif_lb_rank_${state.profile.userId}_${state.monthStats.monthPrefix}`;
          const prevRank = Number(localStorage.getItem(rankKey) || "0");
          if (prevRank !== myRank) {
            localStorage.setItem(rankKey, String(myRank));
            await deliverAlert({
              id: `lb_rank_${state.monthStats.monthPrefix}_${myRank}_${me.monthEffort}`,
              title: "Leaderboard Update",
              body:
                myRank === 1
                  ? `You are #1 on this month's Effort Leaderboard (${me.monthEffort} pts).`
                  : `You are #${myRank} on this month's Effort Leaderboard (${me.monthEffort} pts).`,
              category: "leaderboard",
              tag: `leaderboard-rank-${state.monthStats.monthPrefix}-${myRank}`,
              url: "/?tab=leaderboard",
              bypassQuietHours: true,
            });
          }
        }
      }
    }

    // 5. 3-Day Streak Grace / Daily Training Prompt
    if (
      settings.dailyPromptEnabled &&
      nowHHMM >= settings.dailyPromptTime &&
      state.todaySummary.itemCount === 0 &&
      !state.todaySummary.isRest
    ) {
      const key = `hr_notif_daily_${state.profile.userId}_${todayIso}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        await deliverAlert({
          id: `daily_${todayIso}`,
          title:
            state.monthStats.currentStreak > 0
              ? "3-Day Streak Protection Active"
              : "Daily Check-in",
          body:
            state.monthStats.currentStreak > 0
              ? `Your ${state.monthStats.currentStreak}d streak stays unbroken for 3 days. Ready to log today's session?`
              : "Ready to log today's workout or mark Rest.",
          category: state.monthStats.currentStreak > 0 ? "streak" : "daily",
          tag: `daily-prompt-${todayIso}`,
        });
      }
    }
  };

  evaluationInFlight = run().finally(() => {
    evaluationInFlight = null;
  });
  await evaluationInFlight;
}

export const GYM_REMINDER_MILESTONES_MIN = [60, 90, 120] as const;

export async function evaluateGymSessionReminders(
  state: AppStatePayload,
  onAutoTurnOff: () => Promise<void> | void,
  onInAppNotify?: (title: string, body: string) => void,
  nowMs = Date.now()
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!state.profile.inGym || !state.profile.gymStartedAt) return;

  const startMs = Date.parse(state.profile.gymStartedAt);
  if (Number.isNaN(startMs)) return;

  const elapsedMin = Math.floor((nowMs - startMs) / 60_000);
  if (elapsedMin < 60) return;

  const storageKey = `hr_gym_milestones_${state.profile.userId}_${state.profile.gymStartedAt}`;
  let sent: string[] = [];
  try {
    sent = JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    sent = [];
  }
  const sentSet = new Set(sent);

  const notifyGym = async (
    milestoneKey: string,
    title: string,
    body: string
  ) => {
    sentSet.add(milestoneKey);
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(sentSet)));
    } catch {}

    pushInAppNotification({
      id: `gym_${state.profile.gymStartedAt}_${milestoneKey}`,
      title,
      body,
      category: "daily",
      url: "/?tab=home",
    });
    if (onInAppNotify) {
      onInAppNotify(title, body);
    }
    const isForeground =
      typeof document !== "undefined" && document.visibilityState === "visible";
    if (!isForeground) {
      await showLocalNotification(
        `Honest Reps · ${title}`,
        body,
        `gym-checkin-${state.profile.gymStartedAt}-${milestoneKey}`,
        "/?tab=home"
      );
    }
  };

  if (elapsedMin >= 120) {
    if (!sentSet.has("2h")) {
      await notifyGym(
        "2h",
        "In the Gym turned off",
        "2 hours reached — your In the Gym status was automatically turned off."
      );
    }
    await onAutoTurnOff();
    return;
  }

  if (elapsedMin >= 90 && !sentSet.has("1h30")) {
    await notifyGym(
      "1h30",
      "Still in the gym?",
      "It has been 1 hr 30 min since you turned on In the Gym. Turn it off if you're done, or it will auto-off at 2 hr."
    );
    return;
  }

  if (elapsedMin >= 60 && !sentSet.has("1h")) {
    await notifyGym(
      "1h",
      "Still in the gym?",
      "You've been In the Gym for 1 hr. Turn it off on Home when you finish."
    );
  }
}
