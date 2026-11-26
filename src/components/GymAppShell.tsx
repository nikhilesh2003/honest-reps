"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  ListChecks,
  Users,
  Trophy,
  BarChart3,
  User,
  Bell,
  X,
  MapPin,
  WifiOff,
} from "lucide-react";
import { AppStatePayload } from "@/lib/client-types";
import {
  apiGetState,
  apiJoinPublicGym,
  apiRegisterOrUpdatePublicGym,
  apiSetInGym,
  apiSignOut,
  apiSyncFriendsNow,
  apiUpdateNotifications,
  isProfileInGym,
} from "@/lib/client-engine";
import {
  clearInAppNotifications,
  ensureWebPushSubscribed,
  evaluateAndTriggerReminders,
  evaluateGymSessionReminders,
  getInAppNotifications,
  InAppNotificationItem,
  markAllInAppNotificationsRead,
  pushInAppNotification,
  requestAppNotificationPermission,
  showLocalNotification,
} from "@/lib/notifications";
import {
  dismissNearbyGym,
  evaluateGymGeofence,
  evaluatePublicGymsArrival,
  fetchNearbyOsmGym,
  getSavedGymLocation,
  GymLocationConfig,
  isGymGeoSuppressed,
  joinPublicGym,
  OsmNearbyGym,
  PublicGym,
  registerOrUpdatePublicGym,
  setGymGeoSuppressed,
} from "@/lib/gym-location";
import { triggerHaptic } from "@/lib/haptics";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CardioLog, ExerciseLog } from "@/lib/types";
import { Toast, ToastMessage } from "./ui/Toast";
import { BottomSheet } from "./ui/BottomSheet";
import { RestTimerPill, RestTimerState } from "./ui/RestTimerPill";
import { HomeTab } from "./tabs/HomeTab";
import { LogsTab } from "./tabs/LogsTab";
import { FriendsTab } from "./tabs/FriendsTab";
import { LeaderboardTab } from "./tabs/LeaderboardTab";
import { AnalyticsTab } from "./tabs/AnalyticsTab";
import { ProfileTab } from "./tabs/ProfileTab";
import { DailyCheckinSheet } from "./modals/DailyCheckinSheet";
import { LogStrengthSheet } from "./modals/LogStrengthSheet";
import { LogCardioSheet } from "./modals/LogCardioSheet";
import { GymLocationSheet } from "./modals/GymLocationSheet";

type TabId = "home" | "logs" | "friends" | "leaderboard" | "analytics" | "profile";

export interface ShowToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

export function GymAppShell() {
  const router = useRouter();
  const [state, setState] = useState<AppStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [dayShift, setDayShift] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  // Rest Timer State
  const [restDefaultSec, setRestDefaultSec] = useState<number>(() => {
    if (typeof window === "undefined") return 90;
    const stored = Number(window.localStorage.getItem("hr_rest_default_sec") || 90);
    return [60, 90, 120, 180].includes(stored) ? stored : 90;
  });
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);

  // Modals
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [gymLocationOpen, setGymLocationOpen] = useState(false);
  const [gymLocation, setGymLocation] = useState<GymLocationConfig | null>(null);
  const [geoStatus, setGeoStatus] = useState<
    "idle" | "watching" | "denied" | "unavailable" | "error"
  >("idle");
  const [nearbyGymPrompt, setNearbyGymPrompt] = useState<{
    gym: PublicGym;
    distanceMeters: number;
  } | null>(null);
  const [osmGymPrompt, setOsmGymPrompt] = useState<OsmNearbyGym | null>(null);
  const [noNearbyGymPrompt, setNoNearbyGymPrompt] = useState(false);
  const geoActivatingRef = useRef(false);
  const stateRef = useRef<AppStatePayload | null>(null);
  const [strengthOpen, setStrengthOpen] = useState(false);
  const [strengthBackfill, setStrengthBackfill] = useState(false);
  const [strengthPreselect, setStrengthPreselect] = useState<string | undefined>(undefined);
  const [editingStrength, setEditingStrength] = useState<ExerciseLog | null>(null);
  const [cardioOpen, setCardioOpen] = useState(false);
  const [cardioBackfill, setCardioBackfill] = useState(false);
  const [editingCardio, setEditingCardio] = useState<CardioLog | null>(null);
  const [notifInboxOpen, setNotifInboxOpen] = useState(false);
  const [inboxItems, setInboxItems] = useState<InAppNotificationItem[]>([]);
  const [notifPerm, setNotifPerm] = useState<"granted" | "denied" | "default" | "unsupported">(
    "default"
  );
  const [permBannerDismissed, setPermBannerDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("hr_perm_banner_dismissed") === "1";
    } catch {
      return false;
    }
  });

  // Track online/offline state for basement gym clarity
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOffline(!navigator.onLine);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const switchTab = useCallback((nextTab: TabId, pushHistory = true) => {
    setActiveTab(nextTab);
    if (typeof window !== "undefined" && pushHistory) {
      const nextUrl = nextTab === "home" ? "/" : `/?tab=${nextTab}`;
      if (window.location.pathname + window.location.search !== nextUrl) {
        window.history.pushState({ tab: nextTab }, "", nextUrl);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab") as TabId | null;
    if (
      tabParam &&
      ["home", "logs", "friends", "leaderboard", "analytics", "profile"].includes(tabParam)
    ) {
      setActiveTab(tabParam);
    }
    if ("Notification" in window) {
      setNotifPerm(Notification.permission);
      if (Notification.permission === "granted") {
        void ensureWebPushSubscribed();
      }
    } else {
      setNotifPerm("unsupported");
    }

    const onPopState = () => {
      // Close any open modal first before switching tabs
      if (strengthOpen) {
        setStrengthOpen(false);
        setEditingStrength(null);
        return;
      }
      if (cardioOpen) {
        setCardioOpen(false);
        setEditingCardio(null);
        return;
      }
      if (checkinOpen) {
        setCheckinOpen(false);
        return;
      }
      if (gymLocationOpen) {
        setGymLocationOpen(false);
        return;
      }
      if (notifInboxOpen) {
        setNotifInboxOpen(false);
        return;
      }
      const p = new URLSearchParams(window.location.search);
      const t = (p.get("tab") as TabId | null) || "home";
      if (["home", "logs", "friends", "leaderboard", "analytics", "profile"].includes(t)) {
        setActiveTab(t);
      } else {
        setActiveTab("home");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [strengthOpen, cardioOpen, checkinOpen, gymLocationOpen, notifInboxOpen]);

  const showToast = useCallback(
    (
      text: string,
      tone: "success" | "error" | "info" = "success",
      options?: ShowToastOptions
    ) => {
      const id = Date.now();
      setToast({
        id,
        text,
        tone,
        actionLabel: options?.actionLabel,
        onAction: options?.onAction,
      });
      const duration = options?.durationMs ?? (options?.actionLabel ? 5500 : 2800);
      setTimeout(() => {
        setToast((curr) => (curr && curr.id === id ? null : curr));
      }, duration);
    },
    []
  );

  const handleStartRestTimer = useCallback(
    (label?: string, customSeconds?: number) => {
      const dur = customSeconds ?? restDefaultSec;
      const now = Date.now();
      setRestTimer({
        active: true,
        durationSeconds: dur,
        targetEndMs: now + dur * 1000,
        label,
      });
    },
    [restDefaultSec]
  );

  const handleAdjustRestSeconds = useCallback((deltaSeconds: number) => {
    setRestTimer((curr) => {
      if (!curr || !curr.active) return curr;
      const now = Date.now();
      const baseMs = Math.max(now, curr.targetEndMs);
      const nextTarget = Math.max(now + 1000, baseMs + deltaSeconds * 1000);
      const nextDur = Math.max(15, curr.durationSeconds + deltaSeconds);
      return {
        ...curr,
        durationSeconds: nextDur,
        targetEndMs: nextTarget,
      };
    });
  }, []);

  const handleSelectRestPreset = useCallback((seconds: number) => {
    setRestDefaultSec(seconds);
    try {
      window.localStorage.setItem("hr_rest_default_sec", String(seconds));
    } catch {}
    setRestTimer((curr) =>
      curr && curr.active
        ? {
            ...curr,
            durationSeconds: seconds,
            targetEndMs: Date.now() + seconds * 1000,
          }
        : curr
    );
  }, []);

  const fetchState = useCallback(
    async (shift = dayShift) => {
      try {
        const data = await apiGetState(shift);
        if (!data.authenticated) {
          router.replace("/signin/");
          return;
        }
        if (!data.suspended && !data.profile.onboardingComplete) {
          router.replace("/onboarding/");
          return;
        }
        setState(data);
      } finally {
        setLoading(false);
      }
    },
    [dayShift, router]
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const currentUserId = state?.profile.userId ?? null;

  useEffect(() => {
    if (!currentUserId) return;
    setGymLocation(getSavedGymLocation(currentUserId));
  }, [currentUserId]);

  // Screen Wake Lock while "In the Gym" or Rest Timer is active so screen stays awake between sets
  const inGymForWakeLock = state ? isProfileInGym(state.profile) : false;
  useEffect(() => {
    const shouldKeepAwake = inGymForWakeLock || Boolean(restTimer?.active);
    if (!shouldKeepAwake || typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        if (cancelled || document.visibilityState !== "visible") return;
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Ignore on unsupported devices or low-power mode
      }
    };

    void acquire();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      if (sentinel) {
        void sentinel.release().catch(() => {});
      }
    };
  }, [inGymForWakeLock, restTimer?.active]);

  // Only watch continuous GPS when user has explicitly enabled a saved gym location (no idle battery drain or launch permission ambush)
  useEffect(() => {
    if (!currentUserId || !gymLocation?.enabled) {
      setGeoStatus("idle");
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus("unavailable");
      return;
    }

    setGeoStatus("watching");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const currState = stateRef.current;
        if (!currState || currState.suspended) return;

        const currInGym = isProfileInGym(currState.profile);
        const suppressed = isGymGeoSuppressed(currentUserId);
        const res = evaluateGymGeofence({
          gym: gymLocation,
          currentLat: pos.coords.latitude,
          currentLng: pos.coords.longitude,
          currentlyInGym: currInGym,
          suppressedUntilLeft: suppressed,
        });

        setGeoStatus("watching");

        if (res.action === "clear_suppression") {
          setGymGeoSuppressed(currentUserId, false);
        } else if (res.action === "activate" && !geoActivatingRef.current) {
          geoActivatingRef.current = true;
          void (async () => {
            try {
              await apiSetInGym(true);
              triggerHaptic("success");
              showToast(`Arrived at ${gymLocation.name} · In the Gym is ON`);
              void showLocalNotification(
                "In the Gym · Auto-Activated",
                `Welcome to ${gymLocation.name}. Pick today's muscle groups.`,
                "gym-geo-arrived"
              );
              await fetchState(dayShift);
              const needsMusclePick =
                !currState.todaySession ||
                currState.todaySession.isRest ||
                currState.todaySession.muscleGroups.length === 0;
              if (needsMusclePick) {
                setCheckinOpen(true);
              }
            } catch {
              // ignore transient network errors
            } finally {
              geoActivatingRef.current = false;
            }
          })();
        }

        const publicArrival = evaluatePublicGymsArrival({
          currentLat: pos.coords.latitude,
          currentLng: pos.coords.longitude,
          currentGymId: gymLocation?.gymId,
          userId: currentUserId,
        });

        if (publicArrival) {
          setNearbyGymPrompt(publicArrival);
        } else {
          setNearbyGymPrompt(null);
        }
      },
      (err) => {
        if (err.code === 1) {
          setGeoStatus("denied");
        } else {
          setGeoStatus("error");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 20000,
        timeout: 15000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [currentUserId, gymLocation, dayShift, fetchState, showToast]);

  useEffect(() => {
    fetchState(dayShift);
  }, [dayShift, fetchState]);

  useEffect(() => {
    if (!state) return;
    const currentUserId = state.profile.userId;
    const notifyHandler = (title: string, body: string) => {
      setInboxItems(getInAppNotifications());
      showToast(`${title} · ${body}`);
    };
    setInboxItems(getInAppNotifications());
    const handleGymAutoOff = async () => {
      if (getSavedGymLocation(currentUserId)?.enabled) {
        setGymGeoSuppressed(currentUserId, true);
      }
      await apiSetInGym(false);
      await fetchState(dayShift);
    };
    evaluateAndTriggerReminders(state, notifyHandler).catch(() => {});
    evaluateGymSessionReminders(state, handleGymAutoOff, notifyHandler).catch(() => {});

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedSyncAndEvaluate = (incomingAnn?: {
      id: string;
      title: string;
      body: string;
      target?: string;
      sentBy: string;
      sentAt: string;
    }) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void syncAndEvaluate(incomingAnn);
      }, 350);
    };

    const syncAndEvaluate = async (incomingAnn?: {
      id: string;
      title: string;
      body: string;
      target?: string;
      sentBy: string;
      sentAt: string;
    }) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      await apiSyncFriendsNow().catch(() => {});
      const latest = await apiGetState(dayShift, { forceRemoteSync: true }).catch(() => null);
      if (latest && latest.authenticated) {
        if (
          incomingAnn &&
          incomingAnn.id &&
          !latest.announcements.some((a) => a.id === incomingAnn.id)
        ) {
          latest.announcements = [incomingAnn, ...latest.announcements];
        }
        setState(latest);
        await evaluateAndTriggerReminders(latest, notifyHandler).catch(() => {});
        await evaluateGymSessionReminders(latest, handleGymAutoOff, notifyHandler).catch(() => {});
        setInboxItems(getInAppNotifications());
      }
    };

    const gymTimers: number[] = [];
    if (state.profile.inGym && state.profile.gymStartedAt) {
      const startMs = Date.parse(state.profile.gymStartedAt);
      if (!Number.isNaN(startMs)) {
        for (const mins of [60, 90, 120]) {
          const delay = startMs + mins * 60_000 - Date.now() + 200;
          if (delay > 0) {
            gymTimers.push(
              window.setTimeout(() => {
                void evaluateGymSessionReminders(state, handleGymAutoOff, notifyHandler);
              }, delay)
            );
          }
        }
      }
    }

    const timer = window.setInterval(() => {
      void syncAndEvaluate();
    }, 12000);

    const onVisibilityOrFocus = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        if (typeof window !== "undefined" && "Notification" in window) {
          setNotifPerm(Notification.permission);
        }
        void syncAndEvaluate();
      }
    };
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "NAVIGATE_TAB" && typeof event.data.url === "string") {
        try {
          const u = new URL(event.data.url, window.location.origin);
          const tabParam = u.searchParams.get("tab") as TabId | null;
          if (
            tabParam &&
            ["home", "logs", "friends", "leaderboard", "analytics", "profile"].includes(tabParam)
          ) {
            switchTab(tabParam);
            setNotifInboxOpen(false);
          }
        } catch {}
        return;
      }
      if (event.data?.type === "SW_GYM_AUTO_OFF") {
        void apiSetInGym(false).then(() => fetchState(dayShift));
        return;
      }
      if (event.data?.type === "SW_PUSH_DELIVERED" && event.data.payload) {
        const p = event.data.payload as {
          title?: string;
          body?: string;
          url?: string;
          announcementId?: string;
          notifId?: string;
        };
        if (p.announcementId) {
          const seenKey = `hr_notif_seen_ann_${currentUserId}`;
          const devKey = `hr_notif_device_ann_${currentUserId}`;
          try {
            const seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) || "[]"));
            const dev = new Set<string>(JSON.parse(localStorage.getItem(devKey) || "[]"));
            seen.add(p.announcementId);
            dev.add(p.announcementId);
            localStorage.setItem(seenKey, JSON.stringify(Array.from(seen)));
            localStorage.setItem(devKey, JSON.stringify(Array.from(dev)));
          } catch {}
        }
        if (p.notifId && p.notifId.startsWith("freq_")) {
          const fId = p.notifId.replace(/^freq_/, "");
          const seenKey = `hr_notif_seen_reqs_${currentUserId}`;
          try {
            const seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) || "[]"));
            seen.add(fId);
            localStorage.setItem(seenKey, JSON.stringify(Array.from(seen)));
          } catch {}
        }
        if (p.title && p.body) {
          pushInAppNotification({
            id: p.announcementId ? `ann_${p.announcementId}` : p.notifId || `push_${Date.now()}`,
            title: p.title.replace(/^Honest Reps · /, ""),
            body: p.body,
            category: p.url?.includes("tab=friends") ? "friend" : "admin",
            url: p.url,
          });
          setInboxItems(getInAppNotifications());
        }
        return;
      }
      if (event.data?.type === "SW_ANNOUNCEMENT_DELIVERED" && event.data.announcement) {
        const ann = event.data.announcement as {
          id: string;
          title: string;
          body: string;
        };
        const seenKey = `hr_notif_seen_ann_${currentUserId}`;
        const devKey = `hr_notif_device_ann_${currentUserId}`;
        try {
          const seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) || "[]"));
          const dev = new Set<string>(JSON.parse(localStorage.getItem(devKey) || "[]"));
          seen.add(ann.id);
          dev.add(ann.id);
          localStorage.setItem(seenKey, JSON.stringify(Array.from(seen)));
          localStorage.setItem(devKey, JSON.stringify(Array.from(dev)));
        } catch {}
        pushInAppNotification({
          id: `ann_${ann.id}`,
          title: ann.title,
          body: ann.body,
          category: "admin",
        });
        setInboxItems(getInAppNotifications());
        showToast(`${ann.title} · ${ann.body}`);
      }
    };
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSwMessage);
    }

    const sb = createSupabaseBrowserClient();
    const channel = sb
      ? sb
          .channel("hr_realtime_feed")
          .on("broadcast", { event: "admin_announcement" }, (msg) => {
            const payload = msg?.payload as
              | {
                  id: string;
                  title: string;
                  body: string;
                  target?: string;
                  sentBy: string;
                  sentAt: string;
                }
              | undefined;
            debouncedSyncAndEvaluate(payload);
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => {
            debouncedSyncAndEvaluate();
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
            debouncedSyncAndEvaluate();
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "exercise_logs" }, () => {
            debouncedSyncAndEvaluate();
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "exercise_sets" }, () => {
            debouncedSyncAndEvaluate();
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "cardio_logs" }, () => {
            debouncedSyncAndEvaluate();
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "effort_scores" }, () => {
            debouncedSyncAndEvaluate();
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
            debouncedSyncAndEvaluate();
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "weight_logs" }, () => {
            debouncedSyncAndEvaluate();
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => {
            debouncedSyncAndEvaluate();
          })
          .subscribe()
      : null;

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.clearInterval(timer);
      for (const tid of gymTimers) window.clearTimeout(tid);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
      if (sb && channel) {
        void sb.removeChannel(channel);
      }
    };
  }, [
    state?.profile.userId,
    state?.profile.inGym,
    state?.profile.gymStartedAt,
    dayShift,
    showToast,
    fetchState,
    switchTab,
  ]);

  const handleSignOut = async () => {
    await apiSignOut();
    router.replace("/signin/");
  };

  if (loading || !state) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-6">
        <div className="bg-black px-5 py-3 rounded-2xl">
          <img
            src="/icons/logo-wordmark.png"
            alt="honestreps.com"
            className="h-12 w-auto object-contain animate-pulse"
          />
        </div>
      </div>
    );
  }

  if (state.suspended) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="apple-card p-6 max-w-sm w-full text-center space-y-4">
          <img
            src="/icons/logo-icon.png"
            alt="Honest Reps"
            className="w-12 h-12 mx-auto object-contain"
          />
          <h1 className="text-[20px] font-semibold text-white">Account Suspended</h1>
          <p className="text-[13px] text-[#86868b]">
            Your access has been suspended by an administrator.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full h-11 rounded-2xl bg-white/10 text-white text-[14px] font-medium cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: TabId; label: string; icon: typeof Home }> = [
    { id: "home", label: "Home", icon: Home },
    { id: "logs", label: "Logs", icon: ListChecks },
    { id: "friends", label: "Friends", icon: Users },
    { id: "leaderboard", label: "Leaderboard", icon: Trophy },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ];

  const inGymActive = isProfileInGym(state.profile);

  const handleToggleInGym = async () => {
    const next = !inGymActive;
    if (gymLocation?.enabled) {
      setGymGeoSuppressed(state.profile.userId, !next);
    }
    if (
      next &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      const perm = await requestAppNotificationPermission();
      setNotifPerm(perm);
      if (perm === "granted") {
        void apiUpdateNotifications({ pushSubscribed: true });
      }
    }
    triggerHaptic("medium");
    await apiSetInGym(next);
    showToast(
      next
        ? "In the Gym is ON · Screen awake · Auto-off at 2h"
        : "In the Gym turned OFF"
    );
    await fetchState(dayShift);
    if (next) {
      setCheckinOpen(true);
      if (
        !gymLocation?.gymId &&
        typeof navigator !== "undefined" &&
        "geolocation" in navigator
      ) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const publicArrival = evaluatePublicGymsArrival({
              currentLat: lat,
              currentLng: lng,
              currentGymId: gymLocation?.gymId,
              userId: state.profile.userId,
            });
            if (publicArrival) {
              setNoNearbyGymPrompt(false);
              setOsmGymPrompt(null);
              setNearbyGymPrompt(publicArrival);
              return;
            }
            void fetchNearbyOsmGym(lat, lng, 250).then((osmHit) => {
              if (osmHit) {
                setNoNearbyGymPrompt(false);
                setOsmGymPrompt(osmHit);
              } else {
                setNoNearbyGymPrompt(true);
              }
            });
          },
          () => {
            setNoNearbyGymPrompt(true);
          },
          { enableHighAccuracy: true, maximumAge: 30000, timeout: 8000 }
        );
      }
    }
  };

  const handleJoinNearbyGym = async (targetGym: PublicGym) => {
    if (!state) return;
    triggerHaptic("success");
    const res = joinPublicGym(targetGym.id, state.profile.userId);
    void apiJoinPublicGym(targetGym.id);
    if (res) {
      setGymLocation(res.config);
      setNearbyGymPrompt(null);
      await apiSetInGym(true);
      showToast(`Joined ${targetGym.name}! Auto-check-in is ON.`);
      void showLocalNotification(
        `Welcome to ${targetGym.name}`,
        `${targetGym.memberCount} members train here. Pick today's muscle groups.`,
        "gym-geo-arrived"
      );
      await fetchState(dayShift);
      const currState = stateRef.current;
      const needsMusclePick =
        !currState?.todaySession ||
        currState.todaySession.isRest ||
        currState.todaySession.muscleGroups.length === 0;
      if (needsMusclePick) {
        setCheckinOpen(true);
      }
    }
  };

  const handleDismissNearbyGym = (targetGymId: string) => {
    if (!state) return;
    triggerHaptic("light");
    dismissNearbyGym(state.profile.userId, targetGymId);
    setNearbyGymPrompt(null);
  };

  const handleJoinOsmGym = async (osmGym: OsmNearbyGym) => {
    if (!state) return;
    triggerHaptic("success");
    const { gym, config } = registerOrUpdatePublicGym({
      name: osmGym.name,
      lat: osmGym.lat,
      lng: osmGym.lng,
      radiusMeters: 150,
      userId: state.profile.userId,
      userName: state.profile.name,
    });
    setGymLocation(config);
    setOsmGymPrompt(null);
    setGymGeoSuppressed(state.profile.userId, false);
    void apiRegisterOrUpdatePublicGym({
      name: gym.name,
      lat: gym.lat,
      lng: gym.lng,
      radiusMeters: 150,
      existingGymId: gym.id,
    });
    showToast(`Joined ${gym.name}! Auto-check-in is ON.`);
    await fetchState(dayShift);
  };

  return (
    <div className="min-h-screen bg-black text-[#f5f5f7] flex flex-col items-center">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Persistent Floating Rest Timer */}
      <RestTimerPill
        timer={restTimer}
        defaultDuration={restDefaultSec}
        onAdjustSeconds={handleAdjustRestSeconds}
        onSelectPreset={handleSelectRestPreset}
        onDismiss={() => setRestTimer(null)}
      />

      {/* Floating Public Gym Arrival Banner */}
      {nearbyGymPrompt && (
        <aside
          aria-label="Nearby gym discovery"
          className="fixed top-[calc(0.5rem+env(safe-area-inset-top,0px))] left-3 right-3 z-50 max-w-[460px] mx-auto p-3.5 rounded-2xl bg-[#1c1c1e]/95 border border-white/[0.08] shadow-2xl backdrop-blur-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#30d158]/15 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-[#30d158]" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">
                At {nearbyGymPrompt.gym.name}?
              </div>
              <div className="text-[11px] text-[#86868b] truncate">
                {nearbyGymPrompt.gym.memberCount}{" "}
                {nearbyGymPrompt.gym.memberCount === 1 ? "member" : "members"} · Auto-check-in
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleDismissNearbyGym(nearbyGymPrompt.gym.id)}
              className="px-2.5 py-1.5 text-[12px] font-medium text-[#86868b] hover:text-white cursor-pointer"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => handleJoinNearbyGym(nearbyGymPrompt.gym)}
              className="px-3.5 py-1.5 rounded-full bg-[#30d158] text-black text-[12px] font-semibold cursor-pointer"
            >
              Join
            </button>
          </div>
        </aside>
      )}

      {/* Floating OpenStreetMap Gym Prompt */}
      {!nearbyGymPrompt && osmGymPrompt && (
        <aside
          aria-label="Detected nearby gym"
          className="fixed top-[calc(0.5rem+env(safe-area-inset-top,0px))] left-3 right-3 z-50 max-w-[460px] mx-auto p-3.5 rounded-2xl bg-[#1c1c1e]/95 border border-white/[0.08] shadow-2xl backdrop-blur-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#30d158]/15 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-[#30d158]" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">
                At {osmGymPrompt.name}?
              </div>
              <div className="text-[11px] text-[#86868b] truncate">
                ~{osmGymPrompt.distanceMeters}m away · Save for auto-check-in
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setOsmGymPrompt(null)}
              className="px-2.5 py-1.5 text-[12px] font-medium text-[#86868b] hover:text-white cursor-pointer"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => handleJoinOsmGym(osmGymPrompt)}
              className="px-3.5 py-1.5 rounded-full bg-[#30d158] text-black text-[12px] font-semibold cursor-pointer"
            >
              Join
            </button>
          </div>
        </aside>
      )}

      {/* Floating Prompt to Add Gym when None Found Nearby */}
      {!nearbyGymPrompt && !osmGymPrompt && noNearbyGymPrompt && (
        <aside
          aria-label="Add gym location"
          className="fixed top-[calc(0.5rem+env(safe-area-inset-top,0px))] left-3 right-3 z-50 max-w-[460px] mx-auto p-3.5 rounded-2xl bg-[#1c1c1e]/95 border border-white/[0.08] shadow-2xl backdrop-blur-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-[#30d158]" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">
                Save this gym location?
              </div>
              <div className="text-[11px] text-[#86868b] truncate">
                Pin your gym for automatic check-ins
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setNoNearbyGymPrompt(false)}
              className="px-2.5 py-1.5 text-[12px] font-medium text-[#86868b] hover:text-white cursor-pointer"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => {
                setNoNearbyGymPrompt(false);
                setGymLocationOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-full bg-[#30d158] text-black text-[12px] font-semibold cursor-pointer"
            >
              Pin
            </button>
          </div>
        </aside>
      )}

      {/* Minimal Apple Top Bar */}
      <header className="sticky top-0 z-30 w-full bg-black/80 backdrop-blur-2xl border-b border-[#30d158]/15 shadow-[0_4px_24px_rgba(48,209,88,0.08)] pt-safe">
        <div className="max-w-[460px] mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => switchTab("home")}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <span className="brand-icon-box w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src="/icons/logo-icon.png"
                alt="Honest Reps"
                className="w-8 h-8 object-contain"
              />
            </span>
            <span className="text-[16px] font-semibold tracking-[-0.02em] text-white">
              Honest Reps
            </span>
          </button>

          <div className="flex items-center gap-2">
            {isOffline && (
              <span
                title="Offline — workouts save locally and sync automatically when back online"
                className="px-2.5 py-1 rounded-full bg-amber-500/12 text-amber-400 text-[11px] font-medium flex items-center gap-1"
              >
                <WifiOff className="w-3 h-3" />
                Offline
              </span>
            )}

            <button
              type="button"
              aria-label="Notifications"
              onClick={() => {
                const read = markAllInAppNotificationsRead();
                setInboxItems(read);
                setNotifInboxOpen(true);
              }}
              className="relative w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-[#f5f5f7] transition-colors cursor-pointer"
            >
              <Bell className="w-4 h-4" strokeWidth={1.85} />
              {inboxItems.filter((n) => !n.read).length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#30d158] text-black text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {inboxItems.filter((n) => !n.read).length}
                </span>
              )}
            </button>

            <button
              type="button"
              aria-label="Profile"
              onClick={() => switchTab("profile")}
              className={`h-9 px-3 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === "profile"
                  ? "bg-white text-black font-semibold"
                  : "bg-white/[0.06] hover:bg-white/[0.1] text-[#f5f5f7] font-medium"
              }`}
            >
              <User className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="text-[12px] max-w-[74px] truncate">
                {state.profile.name.split(" ")[0]}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="w-full max-w-[460px] flex-1 px-4 pt-4 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]">
        {notifPerm === "default" && !permBannerDismissed && (
          <div className="mb-4 px-4 py-3 rounded-2xl bg-[#111113] border border-white/[0.06] flex items-center justify-between gap-3">
            <div className="text-[12px] text-[#86868b] leading-snug min-w-0">
              Turn on notifications for workout reminders and friend updates.
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  const perm = await requestAppNotificationPermission();
                  setNotifPerm(perm);
                  if (perm === "granted") {
                    await apiUpdateNotifications({ pushSubscribed: true });
                    await evaluateAndTriggerReminders(state, (title, body) => {
                      setInboxItems(getInAppNotifications());
                      showToast(`${title} · ${body}`);
                    });
                    await showLocalNotification(
                      "Honest Reps",
                      "Device notifications are now active.",
                      `enable-push-${Date.now()}`
                    );
                    showToast("Device notifications enabled");
                    fetchState(dayShift);
                  } else {
                    showToast("Allow notifications in browser settings", "error");
                  }
                }}
                className="px-3 py-1.5 rounded-full bg-[#30d158] text-black text-[12px] font-semibold cursor-pointer"
              >
                Allow
              </button>
              <button
                type="button"
                aria-label="Close notification prompt"
                onClick={() => {
                  setPermBannerDismissed(true);
                  try {
                    localStorage.setItem("hr_perm_banner_dismissed", "1");
                  } catch {}
                }}
                className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-[#86868b] hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {activeTab === "home" && (
          <HomeTab
            state={state}
            dayShift={dayShift}
            inGym={inGymActive}
            gymStartedAt={state.profile.gymStartedAt ?? null}
            onToggleInGym={handleToggleInGym}
            onChangeDayShift={(next) => setDayShift(next)}
            onOpenCheckin={() => setCheckinOpen(true)}
            onOpenStrength={(exName) => {
              setEditingStrength(null);
              setStrengthBackfill(false);
              setStrengthPreselect(exName);
              setStrengthOpen(true);
            }}
            onOpenCardio={() => {
              setEditingCardio(null);
              setCardioBackfill(false);
              setCardioOpen(true);
            }}
            onEditStrength={(log) => {
              setEditingStrength(log);
              setStrengthBackfill(false);
              setStrengthOpen(true);
            }}
            onEditCardio={(log) => {
              setEditingCardio(log);
              setCardioBackfill(false);
              setCardioOpen(true);
            }}
            onNavigateTab={(tab) => switchTab(tab)}
          />
        )}

        {activeTab === "logs" && (
          <LogsTab
            state={state}
            onOpenBackfillStrength={() => {
              setEditingStrength(null);
              setStrengthBackfill(true);
              setStrengthPreselect(undefined);
              setStrengthOpen(true);
            }}
            onOpenBackfillCardio={() => {
              setEditingCardio(null);
              setCardioBackfill(true);
              setCardioOpen(true);
            }}
            onEditStrength={(log) => {
              setEditingStrength(log);
              setStrengthBackfill(false);
              setStrengthOpen(true);
            }}
            onEditCardio={(log) => {
              setEditingCardio(log);
              setCardioBackfill(false);
              setCardioOpen(true);
            }}
            onRefresh={() => fetchState(dayShift)}
            onToast={showToast}
            onDeleted={(msg, undoHandler) => {
              showToast(msg, "info", undoHandler ? { actionLabel: "Undo", onAction: undoHandler } : undefined);
              fetchState(dayShift);
            }}
          />
        )}

        {activeTab === "friends" && (
          <FriendsTab
            state={state}
            onRefresh={() => fetchState(dayShift)}
            onToast={showToast}
            onNavigateLeaderboard={() => switchTab("leaderboard")}
          />
        )}

        {activeTab === "leaderboard" && (
          <LeaderboardTab
            state={state}
            onRefresh={() => fetchState(dayShift)}
            onNavigateFriends={() => switchTab("friends")}
            onNavigateProfile={() => switchTab("profile")}
          />
        )}

        {activeTab === "analytics" && <AnalyticsTab state={state} />}

        {activeTab === "profile" && (
          <ProfileTab
            state={state}
            gymLocation={gymLocation}
            geoStatus={geoStatus}
            onOpenGymLocation={() => setGymLocationOpen(true)}
            onRefresh={() => fetchState(dayShift)}
            onToast={showToast}
            onSignOut={handleSignOut}
          />
        )}
      </main>

      {/* Bottom iOS-Style Tab Bar with Safe Area */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-black/85 backdrop-blur-2xl border-t border-[#30d158]/15 shadow-[0_-4px_26px_rgba(48,209,88,0.08)] pb-safe">
        <div className="max-w-[460px] mx-auto px-2 h-[60px] grid grid-cols-5 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const hasBadge =
              item.id === "friends" && state.incomingRequests.length > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  switchTab(item.id);
                }}
                className={`relative flex flex-col items-center justify-center gap-1 py-1 transition-all cursor-pointer ${
                  active ? "text-[#30d158] glow-score" : "text-[#86868b] hover:text-white"
                }`}
              >
                <div className="relative">
                  <Icon
                    className={`w-[20px] h-[20px] ${
                      active ? "drop-shadow-[0_0_10px_rgba(48,209,88,0.75)]" : ""
                    }`}
                    strokeWidth={active ? 2.15 : 1.7}
                  />
                  {hasBadge && (
                    <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-[#30d158] shadow-[0_0_8px_rgba(48,209,88,0.9)]" />
                  )}
                </div>
                <span className="text-[10px] font-medium tracking-[-0.01em]">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals */}
      <GymLocationSheet
        open={gymLocationOpen}
        onClose={() => setGymLocationOpen(false)}
        userId={state.profile.userId}
        userName={state.profile.name}
        onUpdated={(cfg, msg) => {
          setGymLocation(cfg);
          setGymGeoSuppressed(state.profile.userId, false);
          showToast(msg);
        }}
      />

      <DailyCheckinSheet
        open={checkinOpen}
        onClose={() => setCheckinOpen(false)}
        state={state}
        onSaved={(msg) => {
          showToast(msg);
          fetchState(dayShift);
        }}
      />

      <LogStrengthSheet
        open={strengthOpen}
        onClose={() => {
          setStrengthOpen(false);
          setEditingStrength(null);
        }}
        state={state}
        initialBackfill={strengthBackfill}
        initialExerciseName={strengthPreselect}
        editingLog={editingStrength}
        defaultRestSeconds={restDefaultSec}
        onTriggerRestTimer={handleStartRestTimer}
        onSaved={(msg) => {
          showToast(msg);
          fetchState(dayShift);
        }}
        onExerciseAdded={(exName) => {
          showToast(`Added ${exName} to personal library`);
          fetchState(dayShift);
        }}
      />

      <LogCardioSheet
        open={cardioOpen}
        onClose={() => {
          setCardioOpen(false);
          setEditingCardio(null);
        }}
        state={state}
        initialBackfill={cardioBackfill}
        editingLog={editingCardio}
        onSaved={(msg) => {
          showToast(msg);
          fetchState(dayShift);
        }}
      />

      {/* In-App & Browser Notifications Inbox Sheet */}
      <BottomSheet
        open={notifInboxOpen}
        onClose={() => setNotifInboxOpen(false)}
        title="Notifications"
        subtitle="Calibration, Leaderboard, Friend & Admin updates"
      >
        <div className="space-y-3">
          {typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission !== "granted" && (
              <div className="p-3.5 rounded-2xl bg-[#1c1c1e] border border-white/[0.06] flex items-center justify-between gap-3">
                <div className="text-[12px] text-[#d1d1d6] leading-snug">
                  Allow push alerts to receive reminders when the app is closed.
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const perm = await requestAppNotificationPermission();
                    setNotifPerm(perm);
                    if (perm === "granted") {
                      await apiUpdateNotifications({ pushSubscribed: true });
                      await showLocalNotification(
                        "Honest Reps",
                        "Browser push notifications enabled.",
                        "enable-push"
                      );
                      showToast("Browser push alerts enabled");
                      fetchState(dayShift);
                    } else {
                      showToast("Allow notifications in browser settings", "error");
                    }
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-[#30d158] text-black text-[12px] font-semibold cursor-pointer"
                >
                  Allow
                </button>
              </div>
            )}

          {inboxItems.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-[#86868b]">
              No notifications yet.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-[12px] text-[#86868b] px-0.5">
                <span>Recent ({inboxItems.length})</span>
                <button
                  type="button"
                  onClick={() => {
                    clearInAppNotifications();
                    setInboxItems([]);
                  }}
                  className="hover:text-white cursor-pointer"
                >
                  Clear all
                </button>
              </div>
              <div className="rounded-2xl bg-[#1c1c1e] border border-white/[0.05] divide-y divide-white/[0.06] max-h-72 overflow-y-auto no-scrollbar">
                {inboxItems.map((item) => {
                  const targetTab: TabId | null =
                    item.url?.includes("tab=friends") || item.category === "friend"
                      ? "friends"
                      : item.url?.includes("tab=leaderboard") || item.category === "leaderboard"
                      ? "leaderboard"
                      : null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (targetTab) {
                          switchTab(targetTab);
                          setNotifInboxOpen(false);
                        }
                      }}
                      className={`w-full text-left px-4 py-3 space-y-1 ${
                        targetTab ? "hover:bg-white/[0.04] cursor-pointer" : "cursor-default"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-white">
                          {item.title}
                        </span>
                        <span className="text-[11px] text-[#86868b] capitalize">
                          {item.category}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#86868b] leading-snug">
                        {item.body}
                      </div>
                      {targetTab === "friends" && (
                        <div className="text-[11px] font-medium text-[#30d158] pt-0.5">
                          Open Friends
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
