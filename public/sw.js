// Honest Reps Service Worker for Web Push, Background Sync & Device Notifications
let swConfig = {
  supabaseUrl: "",
  supabaseKey: "",
  userId: "",
  username: "",
  isCalibrating: false,
  isInactiveToday: false,
  hasActiveStreak: false,
  gymStartedAt: null,
  gymSentMilestones: new Set(),
  deliveredIds: new Set(),
};

let pollTimer = null;

function matchesSwTarget(target) {
  const t = String(target || "all").trim().toLowerCase();
  if (t === "all") return true;
  if (t === "calibrating") return Boolean(swConfig.isCalibrating);
  if (t === "inactive_2d") return Boolean(swConfig.isInactiveToday);
  if (t === "active_streak") return Boolean(swConfig.hasActiveStreak);
  const uname = String(swConfig.username || "").trim().toLowerCase();
  return Boolean(uname) && t.replace(/^@/, "") === uname;
}

async function displayDeviceNotification(title, body, tag, extraData = {}) {
  const targetUrl = extraData.url || "/";
  const fullOptions = {
    body: body || "",
    icon: "/icon-192x192.png",
    badge: "/favicon-96x96.png",
    tag: tag || `honest-reps-${Date.now()}`,
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    silent: false,
    timestamp: Date.now(),
    data: { url: targetUrl, ...extraData },
  };
  try {
    await self.registration.showNotification(title || "Honest Reps", fullOptions);
  } catch {
    await self.registration.showNotification(title || "Honest Reps", {
      body: body || "",
      icon: "/icon-192x192.png",
      badge: "/favicon-96x96.png",
      tag: tag || `honest-reps-${Date.now()}`,
      data: { url: targetUrl, ...extraData },
    });
  }
}

async function checkRemoteAnnouncementsFromSw() {
  if (!swConfig.supabaseUrl || !swConfig.supabaseKey || !swConfig.userId) return;
  try {
    const res = await fetch(
      `${swConfig.supabaseUrl}/rest/v1/app_settings?id=eq.1&select=grid_thresholds`,
      {
        headers: {
          apikey: swConfig.supabaseKey,
          Authorization: `Bearer ${swConfig.supabaseKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return;
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    const announcements =
      row && row.grid_thresholds && Array.isArray(row.grid_thresholds.announcements)
        ? row.grid_thresholds.announcements
        : [];

    // Cap to at most 1 newest announcement per poll so older items never burst
    let shownInPoll = false;
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    const hasVisibleClient = clients.some(
      (c) => c.visibilityState === "visible" || c.focused
    );

    for (const ann of announcements) {
      if (!ann || !ann.id || swConfig.deliveredIds.has(ann.id)) continue;
      if (!matchesSwTarget(ann.target)) continue;

      swConfig.deliveredIds.add(ann.id);
      // Only display device popup if user is NOT currently looking at the open app
      if (!shownInPoll && !hasVisibleClient) {
        shownInPoll = true;
        await displayDeviceNotification(
          `Honest Reps · ${ann.title}`,
          ann.body,
          `admin-ann-${ann.id}`,
          { announcementId: ann.id, url: "/" }
        );
      }

      for (const client of clients) {
        client.postMessage({
          type: "SW_ANNOUNCEMENT_DELIVERED",
          announcement: ann,
        });
      }
    }
  } catch {
    // Silent fallback when offline
  }
}

async function checkGymTimerFromSw() {
  if (!swConfig.gymStartedAt) return;
  const startMs = Date.parse(swConfig.gymStartedAt);
  if (Number.isNaN(startMs)) return;
  const elapsedMin = Math.floor((Date.now() - startMs) / 60000);
  if (elapsedMin < 60) return;

  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const hasVisibleClient = clients.some(
    (c) => c.visibilityState === "visible" || c.focused
  );

  const keyPrefix = String(swConfig.gymStartedAt);
  if (elapsedMin >= 120) {
    const mKey = `${keyPrefix}:2h`;
    if (!swConfig.gymSentMilestones.has(mKey)) {
      swConfig.gymSentMilestones.add(mKey);
      if (!hasVisibleClient) {
        await displayDeviceNotification(
          "Honest Reps · In the Gym turned off",
          "2 hours reached — your In the Gym status was automatically turned off.",
          `gym-checkin-${keyPrefix}-2h`,
          { url: "/?tab=home" }
        );
      }
      for (const client of clients) {
        client.postMessage({
          type: "SW_GYM_AUTO_OFF",
          gymStartedAt: swConfig.gymStartedAt,
        });
      }
    }
    swConfig.gymStartedAt = null;
    return;
  }

  if (elapsedMin >= 90) {
    const mKey = `${keyPrefix}:1h30`;
    if (!swConfig.gymSentMilestones.has(mKey)) {
      swConfig.gymSentMilestones.add(mKey);
      if (!hasVisibleClient) {
        await displayDeviceNotification(
          "Honest Reps · Still in the gym?",
          "It has been 1 hr 30 min since you turned on In the Gym. Turn it off if you're done, or it will auto-off at 2 hr.",
          `gym-checkin-${keyPrefix}-1h30`,
          { url: "/?tab=home" }
        );
      }
    }
    return;
  }

  if (elapsedMin >= 60) {
    const mKey = `${keyPrefix}:1h`;
    if (!swConfig.gymSentMilestones.has(mKey)) {
      swConfig.gymSentMilestones.add(mKey);
      if (!hasVisibleClient) {
        await displayDeviceNotification(
          "Honest Reps · Still in the gym?",
          "You've been In the Gym for 1 hr. Turn it off on Home when you finish.",
          `gym-checkin-${keyPrefix}-1h`,
          { url: "/?tab=home" }
        );
      }
    }
  }
}

function ensureSwPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void checkRemoteAnnouncementsFromSw();
    void checkGymTimerFromSw();
  }, 12000);
}

const SHELL_CACHE = "honest-reps-shell-v2";
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icon-192x192.png",
  "/favicon-96x96.png",
  "/icons/logo-icon.png",
  "/icons/logo-wordmark.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k.startsWith("honest-reps-shell-") && k !== SHELL_CACHE)
            .map((k) => caches.delete(k))
        );
      } catch {}
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Never intercept cross-origin APIs (Supabase, OSM, OAuth) or dynamic PHP/version endpoints
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.endsWith("/version.json")
  ) {
    return;
  }

  // Navigation requests: network-first with cached shell fallback for basement/offline gyms
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const cachedPage = await caches.match(req);
          if (cachedPage) return cachedPage;
          const cachedRoot = await caches.match("/");
          if (cachedRoot) return cachedRoot;
          throw new Error("Offline");
        })
    );
    return;
  }

  // Static Next.js chunks, CSS, icons, and manifest: stale-while-revalidate
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|svg|ico|css|js|woff2?|json)$/i.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = { body: event.data ? event.data.text() : "" };
    } catch {
      payload = {};
    }
  }

  const dedupId = payload.announcementId || payload.notifId || null;
  if (dedupId && swConfig.deliveredIds.has(String(dedupId))) {
    return;
  }
  if (dedupId) {
    swConfig.deliveredIds.add(String(dedupId));
  }

  const title =
    typeof payload.title === "string" && payload.title ? payload.title : "Honest Reps";
  const body =
    typeof payload.body === "string" && payload.body
      ? payload.body
      : "Ready to log today's workout.";
  const tag = typeof payload.tag === "string" ? payload.tag : `honest-reps-${Date.now()}`;
  const url = typeof payload.url === "string" && payload.url ? payload.url : "/";

  event.waitUntil(
    (async () => {
      await displayDeviceNotification(title, body, tag, { url, ...payload });
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({
          type: "SW_PUSH_DELIVERED",
          payload: { title, body, url, announcementId: payload.announcementId, notifId: payload.notifId },
        });
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  if (!event.data) return;

  if (event.data.type === "SHOW_NOTIFICATION") {
    const { title, body, tag, url } = event.data;
    event.waitUntil(
      displayDeviceNotification(
        title || "Honest Reps",
        body || "",
        tag || `honest-reps-local-${Date.now()}`,
        { url: url || "/" }
      )
    );
  } else if (event.data.type === "CONFIG_SW_SYNC") {
    const d = event.data;
    if (d.supabaseUrl) swConfig.supabaseUrl = d.supabaseUrl;
    if (d.supabaseKey) swConfig.supabaseKey = d.supabaseKey;
    if (d.userId) swConfig.userId = d.userId;
    if (d.username) swConfig.username = d.username;
    swConfig.isCalibrating = Boolean(d.isCalibrating);
    swConfig.isInactiveToday = Boolean(d.isInactiveToday);
    swConfig.hasActiveStreak = Boolean(d.hasActiveStreak);
    if (d.gymStartedAt !== swConfig.gymStartedAt) {
      swConfig.gymStartedAt = d.gymStartedAt || null;
      swConfig.gymSentMilestones = new Set();
    }
    if (Array.isArray(d.deliveredIds)) {
      for (const id of d.deliveredIds) {
        swConfig.deliveredIds.add(String(id));
      }
    }
    ensureSwPolling();
  } else if (event.data.type === "CHECK_ANNOUNCEMENTS_NOW") {
    event.waitUntil(checkRemoteAnnouncementsFromSw());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "hr-check-announcements") {
    event.waitUntil(checkRemoteAnnouncementsFromSw());
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "hr-periodic-announcements") {
    event.waitUntil(checkRemoteAnnouncementsFromSw());
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if (client.url && "focus" in client) {
            const clientUrl = new URL(client.url, self.location.origin);
            if (clientUrl.origin === self.location.origin) {
              try {
                client.postMessage({ type: "NAVIGATE_TAB", url: targetUrl });
              } catch {}
              return client.focus();
            }
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
