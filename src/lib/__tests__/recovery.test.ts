import assert from "node:assert/strict";
import {
  evaluateMonthlyRecoveryHealth,
  getMuscleRecoveryStatus,
  MUSCLE_RECOVERY_GUIDELINES,
} from "../recovery";
import { ExerciseLog } from "../types";

console.log("Running Honest Reps Recovery & Muscle Timeline Verification...");

// 1. Muscle recovery timeline rules
{
  assert.equal(MUSCLE_RECOVERY_GUIDELINES.legs.hours, "48–72h");
  assert.equal(MUSCLE_RECOVERY_GUIDELINES.legs.isLarge, true);
  assert.equal(MUSCLE_RECOVERY_GUIDELINES.chest.hours, "48–72h");
  assert.equal(MUSCLE_RECOVERY_GUIDELINES.chest.isLarge, true);
  assert.equal(MUSCLE_RECOVERY_GUIDELINES.arms.hours, "24–48h");
  assert.equal(MUSCLE_RECOVERY_GUIDELINES.arms.isLarge, false);
  assert.equal(MUSCLE_RECOVERY_GUIDELINES.shoulders.hours, "48h");
  console.log("  [PASS] Muscle recovery guidelines definitions verified");
}

// 2. Muscle recovery status calculation
{
  const today = "2026-11-24";
  const logs: ExerciseLog[] = [
    {
      id: "l1",
      userId: "u1",
      date: "2026-11-24", // Today
      exerciseName: "Bench Press",
      muscleGroup: "Chest",
      sets: [{ setNumber: 1, weightKg: 80, reps: 10 }],
      source: "manual",
      addedLater: false,
      work: 800,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-24T10:00:00Z",
    },
    {
      id: "l2",
      userId: "u1",
      date: "2026-11-23", // 1 day ago
      exerciseName: "Bicep Curl",
      muscleGroup: "Arms",
      sets: [{ setNumber: 1, weightKg: 20, reps: 10 }],
      source: "manual",
      addedLater: false,
      work: 200,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-23T10:00:00Z",
    },
    {
      id: "l3",
      userId: "u1",
      date: "2026-11-23", // 1 day ago
      exerciseName: "Squat",
      muscleGroup: "Legs",
      sets: [{ setNumber: 1, weightKg: 100, reps: 8 }],
      source: "manual",
      addedLater: false,
      work: 800,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-23T10:00:00Z",
    },
  ];

  // Chest trained today -> must be Recovering & RED zone
  const chest = getMuscleRecoveryStatus("Chest", logs, today);
  assert.equal(chest.status, "Recovering");
  assert.equal(chest.recoveryZone, "red");
  assert.equal(chest.daysAgo, 0);

  // Arms trained yesterday -> small group -> Ready & GREEN zone
  const arms = getMuscleRecoveryStatus("Arms", logs, today);
  assert.equal(arms.status, "Ready");
  assert.equal(arms.recoveryZone, "green");
  assert.equal(arms.daysAgo, 1);

  // Legs trained yesterday -> large group -> Recovering (needs 48–72h) & YELLOW zone
  const legs = getMuscleRecoveryStatus("Legs", logs, today);
  assert.equal(legs.status, "Recovering");
  assert.equal(legs.recoveryZone, "yellow");
  assert.equal(legs.daysAgo, 1);

  // Back not in logs -> Ready & GREEN zone
  const back = getMuscleRecoveryStatus("Back", logs, today);
  assert.equal(back.status, "Ready");
  assert.equal(back.recoveryZone, "green");
  assert.equal(back.daysAgo, null);

  // Shoulders trained yesterday -> 48h group -> YELLOW zone
  const shouldersLogs: ExerciseLog[] = [
    ...logs,
    {
      id: "l4",
      userId: "u1",
      date: "2026-11-23",
      exerciseName: "Shoulder Press",
      muscleGroup: "Shoulders",
      sets: [{ setNumber: 1, weightKg: 30, reps: 10 }],
      source: "manual",
      addedLater: false,
      work: 300,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-23T11:00:00Z",
    },
  ];
  const shoulders = getMuscleRecoveryStatus("Shoulders", shouldersLogs, today);
  assert.equal(shoulders.recoveryZone, "yellow");
  assert.equal(shoulders.status, "Recovering");

  console.log("  [PASS] Muscle readiness & recovery timeline calculations verified");
}

// 3. Monthly recovery health evaluation
{
  // Healthy: 10 rest days on day 30
  const healthy = evaluateMonthlyRecoveryHealth({
    activeDays: 20,
    restDays: 10,
    dayOfMonth: 30,
    daysInMonth: 30,
  });
  assert.equal(healthy.status, "optimal");
  assert.ok(healthy.title.includes("8–12"));

  // High fatigue risk: 1 rest day on day 20 -> projected ~1.5 (< 4)
  const overtraining = evaluateMonthlyRecoveryHealth({
    activeDays: 19,
    restDays: 1,
    dayOfMonth: 20,
    daysInMonth: 30,
  });
  assert.equal(overtraining.status, "risk-overtraining");
  assert.ok(overtraining.title.includes("< 4 Rest Days"));

  // High-frequency split: 4 rest days on day 20 -> projected 6 (4–7)
  const split = evaluateMonthlyRecoveryHealth({
    activeDays: 16,
    restDays: 4,
    dayOfMonth: 20,
    daysInMonth: 30,
  });
  assert.equal(split.status, "acceptable");
  assert.ok(split.title.includes("4–7"));

  // High rest volume: 22 rest days on day 30
  const lowVolume = evaluateMonthlyRecoveryHealth({
    activeDays: 8,
    restDays: 22,
    dayOfMonth: 30,
    daysInMonth: 30,
  });
  assert.equal(lowVolume.status, "risk-detraining");
  assert.ok(lowVolume.title.includes("> 18"));

  // Well-spaced 8 rest days across the month (2 per week) -> optimal
  const spacedMonth = evaluateMonthlyRecoveryHealth({
    activeDays: 22,
    restDays: 8,
    dayOfMonth: 30,
    daysInMonth: 30,
    restDates: [
      "2026-11-01", "2026-11-02",
      "2026-11-08", "2026-11-09",
      "2026-11-15", "2026-11-16",
      "2026-11-22", "2026-11-23",
    ],
  });
  assert.equal(spacedMonth.status, "optimal");

  // Clustered 8 rest days all in the same week -> flagged Uneven Rest (not optimal)
  const clusteredMonth = evaluateMonthlyRecoveryHealth({
    activeDays: 22,
    restDays: 8,
    dayOfMonth: 30,
    daysInMonth: 30,
    restDates: [
      "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04",
      "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08",
    ],
  });
  assert.equal(clusteredMonth.badge, "Uneven Rest");
  assert.equal(clusteredMonth.status, "acceptable");

  console.log("  [PASS] Monthly recovery health evaluation verified");
}

console.log("All Honest Reps Recovery tests passed.");
