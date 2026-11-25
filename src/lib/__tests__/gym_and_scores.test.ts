import assert from "node:assert/strict";
import { evaluateGymSessionReminders } from "../notifications";
import { isProfileInGym } from "../client-engine";
import { buildDayScoreReason, buildLeaderboardScoreReason } from "../score-reason";
import { AppStatePayload, LeaderboardEntry } from "../client-types";
import { DaySummary } from "../types";

console.log("Running In-the-Gym & Score Reason Popup Verification...");

function setupMockEnv(permission: "granted" | "default" = "granted") {
  const storage = new Map<string, string>();
  const swNotifications: Array<{ title: string; options: Record<string, unknown> }> = [];

  const mockRegistration = {
    async showNotification(title: string, options: Record<string, unknown> = {}) {
      swNotifications.push({ title, options });
    },
  };

  const mockNotification = function () {} as unknown as {
    new (title: string, options?: Record<string, unknown>): unknown;
    permission: "default" | "granted" | "denied";
    requestPermission: () => Promise<"default" | "granted" | "denied">;
  };
  mockNotification.permission = permission;
  mockNotification.requestPermission = async () => permission;

  const mockStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  };

  const mockNavigator = {
    serviceWorker: {
      ready: Promise.resolve(mockRegistration),
      getRegistration: async () => mockRegistration,
    },
  };

  Object.defineProperty(globalThis, "window", {
    value: { localStorage: mockStorage, Notification: mockNotification, navigator: mockNavigator },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: mockStorage,
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

  return { swNotifications };
}

function makeState(gymStartedAt: string | null, inGym: boolean): AppStatePayload {
  return {
    authenticated: true,
    todayIso: "2026-11-24",
    realTodayIso: "2026-11-24",
    profile: {
      userId: "u_gym_1",
      email: "test@honestreps.com",
      name: "Test Lifter",
      username: "lifter",
      heightCm: 175,
      activeStatus: "Moderately active",
      weightUnit: "kg",
      heightUnit: "cm",
      shareWorkoutDetails: false,
      onboardingComplete: true,
      suspended: false,
      firstLogDate: "2026-11-01",
      createdAt: "2026-11-01T10:00:00Z",
      inGym,
      gymStartedAt,
    },
  } as unknown as AppStatePayload;
}

async function runTests() {
  // 1. In-the-Gym 1h, 1h30, and 2h auto-off notifications
  {
    const env = setupMockEnv("granted");
    const t0 = Date.parse("2026-11-24T10:00:00.000Z");
    const state = makeState("2026-11-24T10:00:00.000Z", true);
    let autoOffCalled = 0;

    // At 59 min: no reminder yet
    await evaluateGymSessionReminders(state, async () => { autoOffCalled++; }, undefined, t0 + 59 * 60_000);
    assert.equal(env.swNotifications.length, 0);
    assert.equal(autoOffCalled, 0);

    // At 60 min (1 hr): fires 1h reminder once
    await evaluateGymSessionReminders(state, async () => { autoOffCalled++; }, undefined, t0 + 60 * 60_000);
    await evaluateGymSessionReminders(state, async () => { autoOffCalled++; }, undefined, t0 + 65 * 60_000);
    assert.equal(env.swNotifications.length, 1);
    assert.match(env.swNotifications[0].title, /Still in the gym/i);
    assert.equal(autoOffCalled, 0);

    // At 90 min (1:30 hr): fires 1h30 reminder once
    await evaluateGymSessionReminders(state, async () => { autoOffCalled++; }, undefined, t0 + 90 * 60_000);
    assert.equal(env.swNotifications.length, 2);
    assert.match(env.swNotifications[1].options.body as string, /1 hr 30 min/i);
    assert.equal(autoOffCalled, 0);

    // At 120 min (2 hr): fires auto-off notification and triggers onAutoTurnOff()
    await evaluateGymSessionReminders(state, async () => { autoOffCalled++; }, undefined, t0 + 120 * 60_000);
    assert.equal(env.swNotifications.length, 3);
    assert.equal(autoOffCalled, 1);
    assert.match(env.swNotifications[2].title, /turned off/i);
    console.log("  [PASS] In-the-Gym 1h, 1h30, and 2h auto-off notifications verified");
  }

  // 2. isProfileInGym respects 2h auto-expiration
  {
    const t0 = Date.parse("2026-11-24T10:00:00.000Z");
    assert.equal(
      isProfileInGym({ inGym: true, gymStartedAt: "2026-11-24T10:00:00.000Z" }, t0 + 119 * 60_000),
      true
    );
    assert.equal(
      isProfileInGym({ inGym: true, gymStartedAt: "2026-11-24T10:00:00.000Z" }, t0 + 120 * 60_000),
      false
    );
    assert.equal(
      isProfileInGym({ inGym: false, gymStartedAt: null }, t0),
      false
    );
    console.log("  [PASS] isProfileInGym 2-hour auto-expiration verified");
  }

  // 3. Score Reason Builders (self vs private friend vs leaderboard)
  {
    const dayWithBreakdown: DaySummary = {
      date: "2026-11-24",
      dayLetter: "T",
      shortLabel: "Today",
      sessionGroups: ["Chest", "Shoulders"],
      isRest: false,
      status: "Calibrating",
      effortScore: 81,
      band: "High",
      itemCount: 3,
      loggedItems: [],
      effortBreakdown: {
        mode: "provisional",
        formulaNote: "61 / 75 known pts normalized to 81 / 100",
        items: [
          { label: "Strength volume", points: "17 / 25", detail: "6 sets across 2 exercises" },
        ],
      },
    };
    const selfReason = buildDayScoreReason(dayWithBreakdown, {
      hidePrivateDetails: false,
      shareDetailsEnabled: true,
    });
    assert.equal(selfReason.scoreLabel, "81 / 100");
    assert.equal(selfReason.items.length, 1);

    const privateFriendDay: DaySummary = {
      date: "2026-11-24",
      dayLetter: "T",
      shortLabel: "Today",
      sessionGroups: ["Back"],
      isRest: false,
      status: "Scored",
      effortScore: 68,
      band: "Steady",
      itemCount: 2,
      loggedItems: [],
    };
    const friendReason = buildDayScoreReason(privateFriendDay, {
      hidePrivateDetails: true,
      shareDetailsEnabled: false,
      ownerName: "Hari",
    });
    assert.equal(friendReason.scoreLabel, "68 / 100");
    assert.ok(friendReason.items.length > 0);
    assert.match(friendReason.formulaNote, /private/i);

    const lbEntry: LeaderboardEntry = {
      userId: "u2",
      name: "Hari Krishna",
      username: "hari",
      isMe: false,
      shareWorkoutDetails: false,
      inGym: true,
      gymStartedAt: "2026-11-24T10:30:00.000Z",
      todayScore: 76,
      todayStatus: "Calibrating",
      todayGroups: ["Legs"],
      monthEffort: 74,
      isMonthCalibrating: true,
      activeDaysThisMonth: 5,
      currentStreak: 3,
    };
    const monthReason = buildLeaderboardScoreReason(lbEntry, "month");
    assert.equal(monthReason.scoreLabel, "74 / 100");
    assert.ok(monthReason.items.some((i) => i.label.includes("Active days")));
    console.log("  [PASS] Score reason builders verified for self, heatmap, and private friends");
  }

  console.log("All Gym & Score Reason tests passed.");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
