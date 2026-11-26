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
} from "lucide-react";
import { AppStatePayload } from "@/lib/client-types";
import {
  apiGetState,
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
import { apiJoinPublicGym, apiRegisterOrUpdatePublicGym } from "@/lib/client-engine";
import { triggerHaptic } from "@/lib/haptics";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { CardioLog, ExerciseLog } from "@/lib/types";
import { Toast, ToastMessage } from "./ui/Toast";
import { BottomSheet } from "./ui/BottomSheet";
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

export function GymAppShell() {
  const router = useRouter();
  const [state, setState] = useState<AppStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [dayShift, setDayShift] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Modals
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [gymLocationOpen, setGymLocationOpen] = useState(false);
  const [gymLocation, setGymLocation] = useState<GymLocationConfig | null>(null);
  const [geoStatus, setGeoStatus] = useState<
    "idle" | "watching" | "denied" | "unavailable" | "error"
  >("idle");
  const [gymDistanceMeters, setGymDistanceMeters] = useState<number | null>(null);
  const [nearbyGymPrompt, setNearbyGymPrompt] = useState<{ gym: PublicGym; distanceMeters: number } | null>(null);
  const [osmGymPrompt, setOsmGymPrompt] = useState<OsmNearbyGym | null>(null);
  const [noNearbyGymPrompt, setNoNearbyGymPrompt] = useState(false);
  const [geoRetryNonce, setGeoRetryNonce] = useState(0);
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") as TabId | null;
      if (
        tabParam &&
        ["home", "logs", "friends", "leaderboard", "analytics", "profile"].includes(tabParam)
      ) {
        setActiveTab(tabParam);
        window.history.replaceState({}, "", "/");
      }
      if ("Notification" in window) {
        setNotifPerm(Notification.permission);
        if (Notification.permission === "granted") {
          void ensureWebPushSubscribed();
        }
      } else {
        setNotifPerm("unsupported");
      }
    }
  }, []);

  const showToast = useCallback((text: string, tone: "success" | "error" | "info" = "success") => {
    const id = Date.now();
    setToast({ id, text, tone });
    setTimeout(() => {
      setToast((curr) => (curr && curr.id === id ? null : curr));
    }, 2800);
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

  useEffect(() => {
    if (!currentUserId) {
      setGeoStatus("idle");
      setGymDistanceMeters(null);
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

        // 1. Evaluate user's own saved gym location
        if (gymLocation?.enabled) {
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
          setGymDistanceMeters(res.distanceMeters);

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
                // ignore transient network errors; next position tick retries
              } finally {
                geoActivatingRef.current = false;
              }
            })();
          }
        }

        // 2. Evaluate if arrived at a Public Gym not yet joined
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
        maximumAge: 15000,
        timeout: 15000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [currentUserId, gymLocation, dayShift, fetchState, showToast, geoRetryNonce]);

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

    // Exact timers for 1h, 1h30, and 2h gym milestones while the app is open
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
    }, 10000);

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
            setActiveTab(tabParam);
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

    // Subscribe to real-time database changes and admin broadcasts
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
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "sessions" },
            () => {
              debouncedSyncAndEvaluate();
            }
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "friendships" },
            () => {
              debouncedSyncAndEvaluate();
            }
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "exercise_logs" },
            () => {
              debouncedSyncAndEvaluate();
            }
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "exercise_sets" },
            () => {
              debouncedSyncAndEvaluate();
            }
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cardio_logs" },
            () => {
              debouncedSyncAndEvaluate();
            }
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "effort_scores" },
            () => {
              debouncedSyncAndEvaluate();
            }
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "profiles" },
            () => {
              debouncedSyncAndEvaluate();
            }
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "weight_logs" },
            () => {
              debouncedSyncAndEvaluate();
            }
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "app_settings" },
            () => {
              debouncedSyncAndEvaluate();
            }
          )
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
  }, [state?.profile.userId, state?.profile.inGym, state?.profile.gymStartedAt, dayShift, showToast, fetchState]);

  // Automatically request device notification permission on first user gesture if still "default"
  useEffect(() => {
    if (!state || typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;

    let handled = false;
    const onFirstGesture = async () => {
      if (handled || Notification.permission !== "default") return;
      handled = true;
      window.removeEventListener("click", onFirstGesture);
      const perm = await requestAppNotificationPermission();
      setNotifPerm(perm);
      if (perm === "granted") {
        await apiUpdateNotifications({ pushSubscribed: true }).catch(() => {});
        await ensureWebPushSubscribed().catch(() => {});
        setInboxItems(getInAppNotifications());
      }
    };

    window.addEventListener("click", onFirstGesture, { once: true });
    return () => {
      window.removeEventListener("click", onFirstGesture);
    };
  }, [state, showToast]);

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
    if (next && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
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
        ? "In the Gym is ON · Check-ins at 1h, 1h30 · Auto-off at 2h"
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

  const handleRequestLocation = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGeoStatus("unavailable");
      showToast("GPS location is unavailable on this device", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setGeoStatus("watching");
        setGeoRetryNonce((n) => n + 1);
        showToast("Location enabled while using the app");
      },
      (err) => {
        if (err.code === 1) {
          setGeoStatus("denied");
          showToast("Allow location in browser/site settings while using the app", "error");
        } else {
          setGeoStatus("error");
          setGeoRetryNonce((n) => n + 1);
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="min-h-screen bg-black text-[#f5f5f7] flex flex-col items-center">
      <Toast toast={toast} />

      {/* Floating Public Gym Arrival Banner */}
      {nearbyGymPrompt && (
        <aside
          aria-label="Nearby gym discovery"
          className="fixed top-2 left-3 right-3 z-50 max-w-[460px] mx-auto p-3.5 rounded-2xl bg-black/95 border border-[#10e760]/40 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#10e760]/15 border border-[#10e760]/30 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-[#10e760]" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">
                Are you at {nearbyGymPrompt.gym.name}?
              </div>
              <div className="text-[11px] text-[#86868b] truncate">
                {nearbyGymPrompt.gym.memberCount}{" "}
                {nearbyGymPrompt.gym.memberCount === 1 ? "member trains" : "members train"} here · Join to auto-check-in
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleDismissNearbyGym(nearbyGymPrompt.gym.id)}
              className="px-2.5 py-1.5 text-[11px] font-medium text-[#86868b] hover:text-white cursor-pointer"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => handleJoinNearbyGym(nearbyGymPrompt.gym)}
              className="px-3.5 py-1.5 rounded-xl bg-[#10e760] text-black text-[12px] font-semibold hover:bg-[#25d658] cursor-pointer"
            >
              Join
            </button>
          </div>
        </aside>
      )}

      {/* Floating OpenStreetMap Gym Prompt when no contributor gym matched */}
      {!nearbyGymPrompt && osmGymPrompt && (
        <aside
          aria-label="Detected nearby gym"
          className="fixed top-2 left-3 right-3 z-50 max-w-[460px] mx-auto p-3.5 rounded-2xl bg-black/95 border border-[#10e760]/40 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#10e760]/15 border border-[#10e760]/30 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-[#10e760]" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">
                Are you at {osmGymPrompt.name}?
              </div>
              <div className="text-[11px] text-[#86868b] truncate">
                ~{osmGymPrompt.distanceMeters}m away · Join to save &amp; auto-check-in
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setOsmGymPrompt(null)}
              className="px-2.5 py-1.5 text-[11px] font-medium text-[#86868b] hover:text-white cursor-pointer"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => handleJoinOsmGym(osmGymPrompt)}
              className="px-3.5 py-1.5 rounded-xl bg-[#10e760] text-black text-[12px] font-semibold hover:bg-[#25d658] cursor-pointer"
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
          className="fixed top-2 left-3 right-3 z-50 max-w-[460px] mx-auto p-3.5 rounded-2xl bg-black/95 border border-white/15 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-[#10e760]" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">
                No gym found nearby
              </div>
              <div className="text-[11px] text-[#86868b] truncate">
                Add this gym&apos;s location &amp; name for auto-check-in
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setNoNearbyGymPrompt(false)}
              className="px-2.5 py-1.5 text-[11px] font-medium text-[#86868b] hover:text-white cursor-pointer"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => {
                setNoNearbyGymPrompt(false);
                setGymLocationOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-[#10e760] text-black text-[12px] font-semibold hover:bg-[#25d658] cursor-pointer"
            >
              Add Gym
            </button>
          </div>
        </aside>
      )}

      {/* Minimal Top App Bar with Notifications & Profile in Header */}
      <header className="sticky top-0 z-30 w-full bg-black/85 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-[460px] mx-auto px-4 h-16 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("home")}
            className="flex items-center gap-3 cursor-pointer"
          >
            <span className="brand-icon-box w-14 h-11 rounded-[12px] flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src="/icons/logo-icon.png"
                alt="Honest Reps"
                className="w-14 h-14 max-w-none object-contain scale-[1.18]"
              />
            </span>
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-white">
              Honest Reps
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => {
                const read = markAllInAppNotificationsRead();
                setInboxItems(read);
                setNotifInboxOpen(true);
              }}
              className="relative w-10 h-10 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-[#f5f5f7] cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {inboxItems.filter((n) => !n.read).length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#10e760] text-black text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {inboxItems.filter((n) => !n.read).length}
                </span>
              )}
            </button>

            <button
              type="button"
              aria-label="Profile"
              onClick={() => setActiveTab("profile")}
              className={`h-10 px-2.5 rounded-full border flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === "profile"
                  ? "bg-[#10e760]/15 border-[#10e760]/50 text-[#10e760]"
                  : "bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.08] text-[#f5f5f7]"
              }`}
            >
              <User className="w-4 h-4" />
              <span className="text-[12px] font-medium max-w-[76px] truncate">
                {state.profile.name.split(" ")[0]}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="w-full max-w-[460px] flex-1 px-4 pt-3 pb-24">
        {notifPerm === "default" && !permBannerDismissed && (
          <div className="mb-3 p-3 rounded-2xl bg-[#10e760]/10 border border-[#10e760]/30 flex items-center justify-between gap-2.5">
            <div className="text-[12px] text-white leading-snug min-w-0">
              Enable device notifications to receive admin & workout alerts directly on your phone or desktop.
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
                className="px-3 py-1.5 rounded-xl bg-[#10e760] text-black text-[12px] font-semibold cursor-pointer"
              >
                Enable
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
            onNavigateTab={(tab) => setActiveTab(tab)}
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
            onDeleted={(msg) => {
              showToast(msg);
              fetchState(dayShift);
            }}
          />
        )}

        {activeTab === "friends" && (
          <FriendsTab
            state={state}
            onRefresh={() => fetchState(dayShift)}
            onToast={showToast}
            onNavigateLeaderboard={() => setActiveTab("leaderboard")}
          />
        )}

        {activeTab === "leaderboard" && (
          <LeaderboardTab
            state={state}
            onRefresh={() => fetchState(dayShift)}
            onNavigateFriends={() => setActiveTab("friends")}
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

      {/* Bottom iOS-Style Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-black/90 backdrop-blur-xl border-t border-white/[0.08]">
        <div className="max-w-[460px] mx-auto px-2 h-[68px] grid grid-cols-5 items-center">
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
                  setActiveTab(item.id);
                }}
                className={`relative flex flex-col items-center justify-center gap-1 py-1.5 transition-colors cursor-pointer ${
                  active ? "text-[#10e760]" : "text-[#86868b] hover:text-white"
                }`}
              >
                <div className="relative">
                  <Icon className="w-[21px] h-[21px]" strokeWidth={active ? 2.2 : 1.75} />
                  {hasBadge && (
                    <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-[#10e760]" />
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
              <div className="p-3.5 rounded-2xl bg-[#10e760]/10 border border-[#10e760]/30 flex items-center justify-between gap-3">
                <div className="text-[12px] text-white">
                  Enable browser push alerts to receive notifications even when the tab is in the background.
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const perm = await requestAppNotificationPermission();
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
                  className="shrink-0 px-3 py-1.5 rounded-xl bg-[#10e760] text-black text-[12px] font-semibold cursor-pointer"
                >
                  Enable
                </button>
              </div>
            )}

          {inboxItems.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-[#86868b]">
              No notifications yet.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-[11px] text-[#86868b]">
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
              <div className="space-y-2 max-h-72 overflow-y-auto no-scrollbar">
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
                          setActiveTab(targetTab);
                          setNotifInboxOpen(false);
                        }
                      }}
                      className={`w-full text-left p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-1 ${
                        targetTab ? "hover:bg-white/[0.06] cursor-pointer" : "cursor-default"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-white">
                          {item.title}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.05em] text-[#10e760] font-semibold">
                          {item.category}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#86868b] leading-snug">
                        {item.body}
                      </div>
                      {targetTab === "friends" && (
                        <div className="text-[11px] font-medium text-[#10e760] pt-0.5">
                          Tap to open Friends →
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
