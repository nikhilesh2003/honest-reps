import assert from "node:assert/strict";
import { computeUserMilestones, formatPlateMultiplierBreakdown } from "../milestones";
import { CardioLog, DaySummary, ExerciseLog } from "../types";

console.log("Running Honest Reps Milestone & Badge Verification...");

const mockExerciseLogs: ExerciseLog[] = [
  {
    id: "ex-1",
    userId: "u1",
    date: "2026-11-20",
    exerciseName: "Bench Press",
    muscleGroup: "Chest",
    sets: [
      { setNumber: 1, weightKg: 80, reps: 10 }, // 800 kg vol, 1RM 107
      { setNumber: 2, weightKg: 90, reps: 10 }, // 900 kg vol, 1RM 120
      { setNumber: 3, weightKg: 100, reps: 10 }, // 1000 kg vol, 1RM 133
    ],
    source: "manual",
    addedLater: false,
    work: 2700,
    usualUsed: 2700,
    effortScore: 50,
    status: "Scored",
    scoringSettingsVersion: 1,
    createdAt: "2026-11-20T10:00:00Z",
  },
  {
    id: "ex-2",
    userId: "u1",
    date: "2026-11-21",
    exerciseName: "Squat",
    muscleGroup: "Legs",
    sets: Array.from({ length: 24 }, (_, idx) => ({
      setNumber: idx + 1,
      weightKg: 100,
      reps: 10, // 24 * 1000 = 24,000 kg -> total 26,700 kg, max 1RM stays 133 kg (< 140 kg)
    })),
    source: "manual",
    addedLater: false,
    work: 24000,
    usualUsed: 24000,
    effortScore: 50,
    status: "Scored",
    scoringSettingsVersion: 1,
    createdAt: "2026-11-21T10:00:00Z",
  },
];

const mockCardioLogs: CardioLog[] = [
  {
    id: "c-1",
    userId: "u1",
    date: "2026-11-20",
    activityType: "Outdoor Run",
    distanceKm: 10.5,
    minutes: 95,
    kcal: 2500,
    kcalIsEstimated: false,
    source: "manual",
    addedLater: false,
    isRestActivity: false,
    work: 95,
    usualUsed: 95,
    effortScore: 50,
    status: "Scored",
    scoringSettingsVersion: 1,
    createdAt: "2026-11-20T11:00:00Z",
  },
  {
    id: "c-2",
    userId: "u1",
    date: "2026-11-22",
    activityType: "Cycling",
    distanceKm: 15.0,
    minutes: 90,
    kcal: 2600,
    kcalIsEstimated: false,
    source: "manual",
    addedLater: false,
    isRestActivity: false,
    work: 90,
    usualUsed: 90,
    effortScore: 50,
    status: "Scored",
    scoringSettingsVersion: 1,
    createdAt: "2026-11-22T11:00:00Z",
  },
];

const summary = computeUserMilestones({
  exerciseLogs: mockExerciseLogs,
  cardioLogs: mockCardioLogs,
  currentStreak: 8,
  weightUnit: "kg",
  todayIso: "2026-11-25",
});

// Check Strength Volume: 25 Ton Club unlocked, 50 Ton locked
const twentyFiveTonBadge = summary.badges.find((b) => b.id === "strength_vol_25k");
assert.ok(twentyFiveTonBadge, "25 Ton badge should exist");
assert.equal(twentyFiveTonBadge?.isUnlocked, true, "25 Ton badge should be unlocked at 26,700kg");
assert.equal(twentyFiveTonBadge?.earnedMonthPrefix, "2026-11");

const fiftyTonBadge = summary.badges.find((b) => b.id === "strength_vol_50k");
assert.equal(fiftyTonBadge?.isUnlocked, false);
assert.equal(fiftyTonBadge?.progressPercent, 53); // 26,700 / 50,000 = 53.4% -> 53%

// Check Strength 1RM: Century 1RM unlocked (133kg), Elite 140kg locked
assert.equal(summary.badges.find((b) => b.id === "strength_1rm_century")?.isUnlocked, true);
assert.equal(summary.badges.find((b) => b.id === "strength_1rm_elite")?.isUnlocked, false);

// Check Cardio Distance: Half Marathon unlocked (25.5km), Marathon locked
assert.equal(summary.badges.find((b) => b.id === "cardio_dist_half")?.isUnlocked, true);
assert.equal(summary.badges.find((b) => b.id === "cardio_dist_full")?.isUnlocked, false);

// Check Cardio Minutes: 3 Hours unlocked (185 min), 10 Hours locked
assert.equal(summary.badges.find((b) => b.id === "cardio_mins_180")?.isUnlocked, true);

// Check Streak: 7-Day Warrior unlocked, 14-Day locked
assert.equal(summary.badges.find((b) => b.id === "streak_7")?.isUnlocked, true);
assert.equal(summary.badges.find((b) => b.id === "streak_14")?.progressPercent, 57);

// Check Weight Plates from 25 to 200 kg ONLY (NO trivial 5kg starter plates!)
assert.equal(summary.platesTotal, 8);
assert.equal(summary.platesUnlocked, 4); // 25, 50, 75, 100 unlocked; 125, 150, 175, 200 locked!
for (const plateKg of [25, 50, 75, 100]) {
  const plate = summary.badges.find((b) => b.id === `strength_plate_${plateKg}`);
  assert.equal(plate?.isUnlocked, true, `${plateKg}kg plate should be unlocked at 100kg`);
  assert.equal(plate?.plateLabel, "25", `${plateKg}kg milestone must show 25 kg plate`);
}
for (const plateKg of [125, 150, 175, 200]) {
  assert.equal(
    summary.badges.find((b) => b.id === `strength_plate_${plateKg}`)?.isUnlocked,
    false,
    `${plateKg}kg plate should stay locked at 100kg`
  );
}
assert.equal(
  summary.badges.some((b) => b.id === "strength_plate_5"),
  false,
  "Easy 5kg plate must NOT exist"
);
assert.equal(formatPlateMultiplierBreakdown(100), "4 × 25 kg");
assert.equal(formatPlateMultiplierBreakdown(50), "2 × 25 kg");

// Check beginner (17.5 kg + 75 kg Assisted Pull-Ups) earns ZERO plates (never easy!)
const beginnerSummary = computeUserMilestones({
  exerciseLogs: [
    {
      id: "assist-only",
      userId: "u2",
      date: "2026-11-22",
      exerciseName: "Assisted Pull-Ups",
      muscleGroup: "Back",
      sets: [{ setNumber: 1, weightKg: 75, reps: 10 }],
      source: "manual",
      addedLater: false,
      work: 50,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-22T10:00:00Z",
    },
    {
      id: "curl-1",
      userId: "u2",
      date: "2026-11-23",
      exerciseName: "Dumbbell Curl",
      muscleGroup: "Arms",
      sets: [{ setNumber: 1, weightKg: 17.5, reps: 10 }],
      source: "manual",
      addedLater: false,
      work: 175,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-23T10:00:00Z",
    },
  ],
  cardioLogs: [],
  todayIso: "2026-11-25",
});
assert.equal(beginnerSummary.highestWeightKg, 17.5);
assert.equal(beginnerSummary.platesUnlocked, 0, "Beginners below 25kg must unlock 0 plates");
assert.equal(
  beginnerSummary.badges.find((b) => b.id === "strength_plate_25")?.progressPercent,
  70 // 17.5 / 25 = 70%
);

// Check Chronological One-by-One Monthly (18d) + Yearly (180d) & Auto-Removal of Unearned Past Periods:
const sepMissedDays: DaySummary[] = Array.from({ length: 5 }, (_, idx) => ({
  date: `2026-09-${String(idx + 1).padStart(2, "0")}`,
  dayLetter: "W",
  shortLabel: `Sep ${idx + 1}`,
  sessionGroups: ["Legs"],
  isRest: false,
  status: "Scored",
  effortScore: 55,
  band: "Steady",
  itemCount: 2,
  loggedItems: [],
}));
const octEarnedDays: DaySummary[] = Array.from({ length: 18 }, (_, idx) => ({
  date: `2026-10-${String(idx + 1).padStart(2, "0")}`,
  dayLetter: "M",
  shortLabel: `Oct ${idx + 1}`,
  sessionGroups: ["Chest"],
  isRest: false,
  status: "Scored",
  effortScore: 64,
  band: "High",
  itemCount: 3,
  loggedItems: [],
}));
const pastYearMissedDays: DaySummary[] = Array.from({ length: 12 }, (_, idx) => ({
  date: `2025-12-${String(idx + 1).padStart(2, "0")}`,
  dayLetter: "T",
  shortLabel: `Dec ${idx + 1}`,
  sessionGroups: ["Back"],
  isRest: false,
  status: "Scored",
  effortScore: 52,
  band: "Steady",
  itemCount: 2,
  loggedItems: [],
}));
const novPartialDays: DaySummary[] = Array.from({ length: 4 }, (_, idx) => ({
  date: `2026-11-${String(idx + 22).padStart(2, "0")}`,
  dayLetter: "W",
  shortLabel: `Nov ${idx + 22}`,
  sessionGroups: ["Chest"],
  isRest: false,
  status: "Scored",
  effortScore: 55,
  band: "Steady",
  itemCount: 2,
  loggedItems: [],
}));

const chronologicalSummary = computeUserMilestones({
  exerciseLogs: mockExerciseLogs,
  cardioLogs: mockCardioLogs,
  summaries365: [...pastYearMissedDays, ...sepMissedDays, ...octEarnedDays, ...novPartialDays],
  todayIso: "2026-11-25",
});

assert.equal(chronologicalSummary.badges.some((b) => b.id === "monthly_cal_2025_12"), false);
assert.equal(chronologicalSummary.badges.some((b) => b.id === "monthly_cal_2026_09"), false);
assert.equal(chronologicalSummary.badges.some((b) => b.id === "yearly_cal_2025"), false);

const octBadge = chronologicalSummary.badges.find((b) => b.id === "monthly_cal_2026_10");
assert.equal(octBadge?.isUnlocked, true);
assert.equal(octBadge?.title, "October 2026");

const novBadge = chronologicalSummary.badges.find((b) => b.id === "monthly_cal_2026_11");
assert.equal(novBadge?.isUnlocked, false);
assert.equal(novBadge?.title, "November 2026");
assert.equal(novBadge?.progressPercent, 33); // 6 / 18 = 33%

const yr2026Badge = chronologicalSummary.badges.find((b) => b.id === "yearly_cal_2026");
assert.equal(yr2026Badge?.title, "2026 Yearly");
assert.equal(yr2026Badge?.isUnlocked, false);

console.log(
  `  [PASS] Unlocked: ${summary.totalUnlocked} of ${summary.totalAvailable} | Plates (25-200kg): ${summary.platesUnlocked}/${summary.platesTotal} | Monthly: ${chronologicalSummary.monthlyTotal} | Yearly: ${chronologicalSummary.yearlyTotal}`
);
console.log("All Milestone & Badge tests passed.");
