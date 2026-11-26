import assert from "node:assert/strict";
import {
  evaluateAndTriggerReminders,
  getInAppNotifications,
  showLocalNotification,
} from "../notifications";
import { AppStatePayload } from "../client-types";

console.log("Running Honest Reps Device & Admin Notification Verification...");

function createMockDomEnvironment(initialPermission: "default" | "granted" | "denied" = "default") {
  const storage = new Map<string, string>();
  const swNotifications: Array<{ title: string; options: Record<string, unknown> }> = [];
  const windowNotifications: Array<{ title: string; options: Record<string, unknown> }> = [];
  const swMessages: Array<unknown> = [];

  let swShowShouldThrow = false;
  let swReadyNeverResolves = false;

  const mockRegistration = {
    active: {
      postMessage(msg: unknown) {
        swMessages.push(msg);
      },
    },
    async showNotification(title: string, options: Record<string, unknown> = {}) {
      if (swShowShouldThrow) {
        throw new Error("SW showNotification failed");
      }
      swNotifications.push({ title, options });
    },
  };

  const mockNotification = function (title: string, options: Record<string, unknown> = {}) {
    windowNotifications.push({ title, options });
  } as unknown as {
    new (title: string, options?: Record<string, unknown>): unknown;
    permission: "default" | "granted" | "denied";
    requestPermission: () => Promise<"default" | "granted" | "denied">;
  };
  mockNotification.permission = initialPermission;
  mockNotification.requestPermission = async () => mockNotification.permission;

  const mockLocalStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  };

  const mockNavigator = {
    serviceWorker: {
      get ready() {
        if (swReadyNeverResolves) {
          return new Promise(() => {});
        }
        return Promise.resolve(mockRegistration);
      },
      async getRegistration() {
        if (swReadyNeverResolves) return undefined;
        return mockRegistration;
      },
      async register() {
        if (swReadyNeverResolves) return new Promise(() => {});
        return mockRegistration;
      },
    },
  };

  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: mockLocalStorage,
      Notification: mockNotification,
      navigator: mockNavigator,
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: mockLocalStorage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "Notification", {
    value: mockNotification,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: mockNavigator,
    configurable: true,
    writable: true,
  });

  return {
    storage,
    swNotifications,
    windowNotifications,
    swMessages,
    setPermission(p: "default" | "granted" | "denied") {
      mockNotification.permission = p;
    },
    setSwShowShouldThrow(val: boolean) {
      swShowShouldThrow = val;
    },
    setSwReadyNeverResolves(val: boolean) {
      swReadyNeverResolves = val;
    },
  };
}

function buildMockState(overrides?: Partial<AppStatePayload>): AppStatePayload {
  return {
    authenticated: true,
    authMode: "supabase-google",
    isAdmin: false,
    todayIso: "2026-11-24",
    realTodayIso: "2026-11-24",
    profile: {
      userId: "user_hari_1",
      email: "harikrishna16j@gmail.com",
      name: "Hari Krishna",
      username: "hari",
      heightCm: 175,
      activeStatus: "Moderately active",
      weightUnit: "kg",
      heightUnit: "cm",
      shareWorkoutDetails: false,
      onboardingComplete: true,
      suspended: false,
      firstLogDate: "2026-11-23",
      createdAt: "2026-11-23T10:00:00Z",
    },
    todaySession: null,
    todaySummary: {
      date: "2026-11-24",
      dayLetter: "T",
      shortLabel: "Today",
      sessionGroups: ["Chest"],
      isRest: false,
      status: "Calibrating",
      effortScore: 78,
      band: "High",
      itemCount: 1,
      loggedItems: [],
    },
    previousScoredDay: null,
    rolling7Days: [],
    summaries365: [],
    monthStats: {
      monthPrefix: "2026-11",
      monthEffort: 78,
      isMonthCalibrating: true,
      activeDaysThisMonth: 1,
      restDaysThisMonth: 0,
      currentStreak: 1,
      longestStreak: 1,
      activeDaysYear: 1,
    },
    progressAndConsistency: {
      progressPercent: null,
      progressStatus: "Calibrating",
      consistencyPercent: 100,
      consistencyWindowDays: 30,
    },
    weightLogs: [],
    latestWeight: null,
    daysSinceLastWeight: 1,
    needsWeightPrompt: false,
    visibleMuscleGroups: [],
    visibleExercises: [],
    allAccessibleExercises: [],
    hiddenExerciseIds: [],
    recentExerciseLogs: [],
    recentCardioLogs: [],
    strengthProgression: {},
    muscleGroupProgression: {},
    cardioTotals: {
      totalDistanceKm: 0,
      totalMinutes: 0,
      loggedKcal: 0,
      estimatedKcal: 0,
      sessionCount: 0,
    },
    muscleGroupSplit: [],
    monthCalendar: [],
    leaderboard: [],
    incomingRequests: [],
    outgoingRequests: [],
    notificationSettings: {
      userId: "user_hari_1",
      dailyPromptEnabled: false,
      dailyPromptTime: "17:30",
      weeklyWeightEnabled: false,
      weeklyWeightTime: "09:00",
      friendRequestsEnabled: false,
      summariesEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      emailFallbackEnabled: true,
      pushSubscribed: true,
    },
    appSettings: {
      version: 1,
      backfillWindowDays: 2,
      gridThresholds: { veryLowMax: 49, lowMax: 64, steadyMax: 74, highMax: 89 },
      aboveUsualSlope: 12.5,
      belowUsualRoot: 4,
    },
    announcements: [],
    publicGyms: [],
    ...overrides,
  };
}

async function runTests() {
  // Test 1: Admin announcement received while permission is "default" must still trigger device notification once permission becomes "granted"
  {
    const env = createMockDomEnvironment("default");
    const state = buildMockState({
      announcements: [
        {
          id: "ann_test_1",
          title: "Gym Challenge Live",
          body: "Log your workout today to stay on the leaderboard!",
          target: "@hari",
          sentBy: "mailbox2249@gmail.com",
          sentAt: "2026-11-24T10:00:00.000Z",
        },
      ],
    });

    const inAppToasts: string[] = [];
    await evaluateAndTriggerReminders(state, (t, b) => inAppToasts.push(`${t}: ${b}`));

    // In-app notification should be recorded immediately
    assert.equal(getInAppNotifications().length, 1);
    assert.equal(inAppToasts.length, 1);
    assert.equal(env.swNotifications.length, 0);

    // Now user grants device notification permission
    env.setPermission("granted");
    await evaluateAndTriggerReminders(state, (t, b) => inAppToasts.push(`${t}: ${b}`));

    // Device notification MUST now be triggered on the device, without duplicating the in-app inbox item!
    assert.equal(
      env.swNotifications.length,
      1,
      "Expected device notification to fire once permission was granted for pending admin announcement"
    );
    assert.equal(env.swNotifications[0].title, "Honest Reps · Gym Challenge Live");
    assert.equal(
      env.swNotifications[0].options.renotify,
      true,
      "Expected renotify: true so device pops up heads-up notification alert"
    );
    assert.equal(
      getInAppNotifications().length,
      1,
      "Expected in-app inbox not to duplicate the announcement"
    );
    console.log("  [PASS] Test 1: Pending admin notification triggers on device after permission is granted");
  }

  // Test 2: When ServiceWorker showNotification throws or SW is not ready, showLocalNotification falls back to window Notification instead of hanging or dropping
  {
    const env = createMockDomEnvironment("granted");
    env.setSwShowShouldThrow(true);

    const delivered = await showLocalNotification(
      "Honest Reps · Admin Alert",
      "Fallback to native window notification",
      "admin-fallback-test"
    );
    assert.equal(delivered, true, "Expected showLocalNotification to succeed via fallback");
    assert.equal(
      env.windowNotifications.length,
      1,
      "Expected fallback to new Notification() when SW showNotification throws"
    );

    // Also test when SW ready never resolves (unregistered SW) — must not hang forever
    env.setSwShowShouldThrow(false);
    env.setSwReadyNeverResolves(true);
    const timeoutResult = await Promise.race([
      showLocalNotification("Honest Reps · No SW", "Direct device alert", "no-sw-test"),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2500)),
    ]);
    assert.equal(timeoutResult, true, "Expected showLocalNotification not to hang when SW is not registered");
    assert.equal(env.windowNotifications.length, 2);
    console.log("  [PASS] Test 2: showLocalNotification falls back cleanly when SW fails or is unregistered");
  }

  // Test 3: Multiple unseen admin announcements must NOT burst out all at once — only newest 1 fires on device, others saved quietly in inbox
  {
    const env = createMockDomEnvironment("granted");
    const nowIso = new Date().toISOString();
    const state = buildMockState({
      announcements: [
        {
          id: "ann_new_1",
          title: "Newest Broadcast",
          body: "Latest announcement",
          target: "all",
          sentBy: "mailbox2249@gmail.com",
          sentAt: nowIso,
        },
        {
          id: "ann_old_2",
          title: "Older Broadcast",
          body: "Should not burst",
          target: "calibrating",
          sentBy: "mailbox2249@gmail.com",
          sentAt: nowIso,
        },
        {
          id: "ann_other_3",
          title: "Private to Nikhil",
          body: "Only @nikhil22 should get this",
          target: "@nikhil22",
          sentBy: "mailbox2249@gmail.com",
          sentAt: nowIso,
        },
      ],
    });

    await evaluateAndTriggerReminders(state);

    assert.equal(
      env.swNotifications.length,
      1,
      "Expected burst protection to fire at most 1 device notification per evaluation"
    );
    assert.equal(env.swNotifications[0].options.tag, "admin-ann-ann_new_1");
    assert.equal(env.swNotifications[0].options.renotify, true);
    assert.equal(
      getInAppNotifications().length,
      2,
      "Expected both matching announcements in the in-app inbox while excluding @nikhil22"
    );
    console.log("  [PASS] Test 3: Burst protection caps device alerts to 1 and respects targeting");
  }

  // Test 4: Friend request notification sets data.url = '/?tab=friends' so clicking opens Friends tab
  {
    const env = createMockDomEnvironment("granted");
    const state = buildMockState({
      notificationSettings: {
        userId: "user_hari_1",
        dailyPromptEnabled: false,
        dailyPromptTime: "17:30",
        weeklyWeightEnabled: false,
        weeklyWeightTime: "09:00",
        friendRequestsEnabled: true,
        summariesEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        emailFallbackEnabled: true,
        pushSubscribed: true,
      },
      incomingRequests: [
        {
          friendshipId: "fr_tap_1",
          userId: "u_nikhil",
          name: "Nikhil",
          username: "nikhil22",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    await evaluateAndTriggerReminders(state);
    assert.equal(env.swNotifications.length, 1);
    assert.deepEqual(env.swNotifications[0].options.data, { url: "/?tab=friends" });
    console.log("  [PASS] Test 4: Friend request notification targets '/?tab=friends'");
  }

  console.log("All Honest Reps Notification tests passed.");
}

runTests().catch((err) => {
  console.error("Notification test failed:", err);
  process.exit(1);
});
