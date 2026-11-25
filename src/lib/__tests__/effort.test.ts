import assert from "node:assert/strict";
import {
  calculateCardioWork,
  calculateStrengthWork,
  computeEffortScoreFromRatio,
  computeProgressAndConsistency,
  computeProvisionalDailyEffort,
  computeStreaksAndActiveDays,
  computeUserDaySummaries,
  DEFAULT_GRID_THRESHOLDS,
  detectPersonalRecords,
  detectSetPersonalRecord,
  estimateCardioCalories,
  estimateOneRepMax,
  getEffortBand,
  scoreItemAgainstHistory,
} from "../effort";
import { CardioLog, ExerciseLog } from "../types";

console.log("Running Honest Reps Effort Engine Verification (FR-70 to FR-73)...");

// 1. Verify exact FR-71 realistic table (usual 20-minute walk at same pace)
const walkUsual = calculateCardioWork("Indoor Walk", 20);
const expectations: Array<[number, number]> = [
  [10, 42],
  [15, 47],
  [20, 50],
  [25, 53],
  [30, 56],
  [40, 63],
  [100, 100], // 5x usual reaches 100
  [150, 100], // capped at 100
];

for (const [mins, expectedScore] of expectations) {
  const work = calculateCardioWork("Indoor Walk", mins);
  const actual = computeEffortScoreFromRatio(work, walkUsual);
  assert.equal(
    actual,
    expectedScore,
    `Expected ${mins} min walk to score ${expectedScore}, got ${actual}`
  );
}
console.log("  [PASS] FR-71 curve matches exact spec table (10m=42, 15m=47, 20m=50, 25m=53, 30m=56, 40m=63, 5x=100)");

// 2. Verify FR-62, FR-64, FR-72: First 2 logs stay Calibrating, 3rd log averages first 3, 4th averages earlier
const log1 = scoreItemAgainstHistory([], 1000);
assert.equal(log1.status, "Calibrating");
assert.equal(log1.score, null);

const log2 = scoreItemAgainstHistory([1000], 1100);
assert.equal(log2.status, "Calibrating");
assert.equal(log2.score, null);

const log3 = scoreItemAgainstHistory([1000, 1100], 1200);
assert.equal(log3.status, "Scored");
assert.equal(log3.usualUsed, 1100); // avg(1000, 1100, 1200)
assert.equal(log3.score, 51); // 50 + 12.5*(1200/1100 - 1) = 51.13 -> 51

const log4 = scoreItemAgainstHistory([1000, 1100, 1200], 1100);
assert.equal(log4.status, "Scored");
assert.equal(log4.usualUsed, 1100);
assert.equal(log4.score, 50);
console.log("  [PASS] FR-62/64/72 Calibrating & Usual average verified");

// 3. Verify FR-70: Strength volume = sum(weight * reps), bodyweight push-ups & assisted pull-ups
const strengthWork = calculateStrengthWork([
  { setNumber: 1, weightKg: 80, reps: 10 },
  { setNumber: 2, weightKg: 85, reps: 8 },
]);
assert.equal(strengthWork, 1480);

// Push-Ups with optional 0 added weight uses 65% of 80kg bodyweight = 52kg * 20 reps = 1040
const pushupWork = calculateStrengthWork(
  [{ setNumber: 1, weightKg: 0, reps: 20 }],
  "Push-Ups",
  80
);
assert.equal(pushupWork, 1040);

// Assisted Pull-Ups: 80kg bodyweight - 25kg assisted = 55kg * 10 reps = 550
const assistedWork = calculateStrengthWork(
  [{ setNumber: 1, weightKg: 25, reps: 10 }],
  "Assisted Pull-Ups",
  80
);
assert.equal(assistedWork, 550);
console.log("  [PASS] FR-70 strength volume, bodyweight push-ups & assisted pull-ups verified");

// 4. Verify FR-20: MET calorie estimation
const estKcal = estimateCardioCalories(75, "Indoor Walk", 20, 1.5);
assert.ok(estKcal > 60 && estKcal < 160, `Reasonable MET estimate: ${estKcal}`);
console.log(`  [PASS] FR-20 MET calorie estimation verified (${estKcal} kcal)`);

// 5. Verify FR-58: Effort bands (<50, 60, 70, 80, 90+ scale)
assert.equal(getEffortBand(42, "Scored"), "Very low");
assert.equal(getEffortBand(60, "Scored"), "Low");
assert.equal(getEffortBand(70, "Scored"), "Steady");
assert.equal(getEffortBand(81, "Scored"), "High");
assert.equal(getEffortBand(92, "Scored"), "Very high");
assert.equal(getEffortBand(81, "Calibrating"), "High");
assert.equal(getEffortBand(95, "Calibrating"), "Very high");
assert.equal(getEffortBand(null, "Calibrating"), "Calibrating");
assert.equal(getEffortBand(null, "Rest"), "Rest");
assert.equal(getEffortBand(null, "No log"), "No log");
console.log("  [PASS] FR-58 all 8 year-grid levels verified");

// 6. Verify Progress & Consistency calculation (Calibrating baseline, progression, Rest protection)
const baselineOnly = computeProgressAndConsistency({
  exerciseLogs: [
    {
      id: "e1",
      userId: "u1",
      date: "2026-11-23",
      exerciseName: "Bench Press",
      muscleGroup: "Chest",
      sets: [{ setNumber: 1, weightKg: 40, reps: 10 }],
      source: "manual",
      addedLater: false,
      work: 400,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-23T10:00:00Z",
    },
  ],
  cardioLogs: [],
  summaries30: [
    {
      date: "2026-11-23",
      dayLetter: "M",
      shortLabel: "Today",
      sessionGroups: ["Chest"],
      isRest: false,
      status: "Calibrating",
      effortScore: null,
      band: "Calibrating",
      itemCount: 1,
      loggedItems: [],
    },
  ],
});
assert.equal(baselineOnly.progressStatus, "Calibrating");
assert.equal(baselineOnly.progressPercent, null);
assert.equal(baselineOnly.consistencyPercent, 100);

const progressed = computeProgressAndConsistency({
  exerciseLogs: [
    {
      id: "e1",
      userId: "u1",
      date: "2026-11-23",
      exerciseName: "Bench Press",
      muscleGroup: "Chest",
      sets: [{ setNumber: 1, weightKg: 40, reps: 10 }],
      source: "manual",
      addedLater: false,
      work: 400,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-23T10:00:00Z",
    },
    {
      id: "e2",
      userId: "u1",
      date: "2026-11-30",
      exerciseName: "Bench Press",
      muscleGroup: "Chest",
      sets: [{ setNumber: 1, weightKg: 44, reps: 10 }],
      rir: 2,
      source: "manual",
      addedLater: false,
      work: 440,
      usualUsed: 400,
      effortScore: 55,
      status: "Scored",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-30T10:00:00Z",
    },
  ],
  cardioLogs: [],
  summaries30: [
    {
      date: "2026-11-23",
      dayLetter: "M",
      shortLabel: "Nov 23",
      sessionGroups: ["Chest"],
      isRest: false,
      status: "Calibrating",
      effortScore: null,
      band: "Calibrating",
      itemCount: 1,
      loggedItems: [],
    },
    {
      date: "2026-11-24",
      dayLetter: "T",
      shortLabel: "Nov 24",
      sessionGroups: ["Rest"],
      isRest: true,
      status: "Rest",
      effortScore: null,
      band: "Rest",
      itemCount: 0,
      loggedItems: [],
    },
    {
      date: "2026-11-25",
      dayLetter: "W",
      shortLabel: "Nov 25",
      sessionGroups: [],
      isRest: false,
      status: "No log",
      effortScore: null,
      band: "No log",
      itemCount: 0,
      loggedItems: [],
    },
    {
      date: "2026-11-30",
      dayLetter: "M",
      shortLabel: "Today",
      sessionGroups: ["Chest"],
      isRest: false,
      status: "Scored",
      effortScore: 55,
      band: "Steady",
      itemCount: 1,
      loggedItems: [],
    },
  ],
});
assert.equal(progressed.progressStatus, "Scored");
assert.equal(progressed.progressPercent, 10);
assert.equal(progressed.consistencyPercent, 75);

// Verify that different muscle groups (e.g. Legs on Sunday vs Chest on Monday)
// are NEVER cross-compared, and short warm-up walks on lifting days do not produce false -60% drops.
const crossMuscleScenario = computeProgressAndConsistency({
  exerciseLogs: [
    // Sunday Nov 22: Legs
    {
      id: "leg1",
      userId: "u1",
      date: "2026-11-22",
      exerciseName: "Leg Extension",
      muscleGroup: "Legs",
      sets: [{ setNumber: 1, weightKg: 60, reps: 10 }],
      source: "manual",
      addedLater: false,
      work: 600,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-22T08:00:00Z",
    },
    {
      id: "leg2",
      userId: "u1",
      date: "2026-11-22",
      exerciseName: "Leg Press",
      muscleGroup: "Legs",
      sets: [{ setNumber: 1, weightKg: 100, reps: 13 }],
      source: "manual",
      addedLater: false,
      work: 1300,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-22T08:15:00Z",
    },
    // Monday Nov 23: Chest (lower raw weight than Legs, different muscle group)
    {
      id: "ch1",
      userId: "u1",
      date: "2026-11-23",
      exerciseName: "Bench Press",
      muscleGroup: "Chest",
      sets: [{ setNumber: 1, weightKg: 40, reps: 10 }],
      source: "manual",
      addedLater: false,
      work: 400,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-23T08:00:00Z",
    },
  ],
  cardioLogs: [
    // Sunday: 3 walk splits = 27 min total
    {
      id: "w1",
      userId: "u1",
      date: "2026-11-22",
      activityType: "Indoor Walk",
      minutes: 5,
      kcal: 68,
      source: "manual",
      addedLater: false,
      work: 5,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-22T07:00:00Z",
    },
    {
      id: "w2",
      userId: "u1",
      date: "2026-11-22",
      activityType: "Indoor Walk",
      minutes: 7,
      kcal: 93,
      source: "manual",
      addedLater: false,
      work: 7,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-22T07:10:00Z",
    },
    {
      id: "w3",
      userId: "u1",
      date: "2026-11-22",
      activityType: "Indoor Walk",
      minutes: 15,
      kcal: 135,
      source: "manual",
      addedLater: false,
      work: 15,
      effortScore: 50,
      status: "Scored",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-22T07:25:00Z",
    },
    // Monday: 9 min warm-up walk before Chest lifting
    {
      id: "w4",
      userId: "u1",
      date: "2026-11-23",
      activityType: "Indoor Walk",
      minutes: 9,
      kcal: 106,
      source: "manual",
      addedLater: false,
      work: 9,
      effortScore: 68,
      status: "Scored",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-23T07:00:00Z",
    },
  ],
  summaries30: [
    {
      date: "2026-11-22",
      dayLetter: "S",
      shortLabel: "Nov 22",
      sessionGroups: ["Legs", "Cardio"],
      isRest: false,
      status: "Calibrating",
      effortScore: 50,
      band: "Steady",
      itemCount: 4,
      loggedItems: [],
    },
    {
      date: "2026-11-23",
      dayLetter: "M",
      shortLabel: "Nov 23",
      sessionGroups: ["Chest"],
      isRest: false,
      status: "Calibrating",
      effortScore: 68,
      band: "High",
      itemCount: 2,
      loggedItems: [],
    },
  ],
});
// Must remain Calibrating with null progressPercent (never cross-comparing Legs with Chest or producing -60%)
assert.equal(crossMuscleScenario.progressStatus, "Calibrating");
assert.equal(crossMuscleScenario.progressPercent, null);

console.log("  [PASS] Progress & Consistency metrics verified");

// 7. Verify Day-1 Provisional Daily Effort (ChatGPT 5-category model, missing RIR not penalized)
const nov23Provisional = computeProvisionalDailyEffort(
  [
    {
      id: "p1",
      userId: "u1",
      date: "2026-11-23",
      exerciseName: "Pec Fly",
      muscleGroup: "Chest",
      sets: [
        { setNumber: 1, weightKg: 35, reps: 12 },
        { setNumber: 2, weightKg: 35, reps: 12 },
        { setNumber: 3, weightKg: 30, reps: 12 },
      ],
      source: "manual",
      addedLater: false,
      work: 1200,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-23T10:00:00Z",
    },
    {
      id: "p2",
      userId: "u1",
      date: "2026-11-23",
      exerciseName: "Bench Press",
      muscleGroup: "Chest",
      sets: [
        { setNumber: 1, weightKg: 40, reps: 13 },
        { setNumber: 2, weightKg: 40, reps: 13 },
        { setNumber: 3, weightKg: 40, reps: 10 },
      ],
      source: "manual",
      addedLater: false,
      work: 1440,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-23T10:05:00Z",
    },
  ],
  [
    {
      id: "c1",
      userId: "u1",
      date: "2026-11-23",
      activityType: "Indoor Walk",
      minutes: 9,
      distanceKm: 0.501,
      kcal: 45,
      kcalIsEstimated: true,
      source: "manual",
      addedLater: false,
      isRestActivity: false,
      work: 9,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-23T10:20:00Z",
    },
  ]
);
assert.ok(nov23Provisional >= 75 && nov23Provisional <= 88, `Expected ~81, got ${nov23Provisional}`);
console.log(`  [PASS] Day-1 provisional effort verified (${nov23Provisional}/100)`);

// 8. Verify 3-day streak grace window (up to 3 missed days does not break streak; 4 missed days breaks it)
const makeDay = (date: string, itemCount: number, isRest = false) => ({
  date,
  dayLetter: "M",
  shortLabel: date,
  sessionGroups: [],
  isRest,
  status: (isRest ? "Rest" : itemCount > 0 ? "Scored" : "No log") as "Rest" | "Scored" | "No log",
  effortScore: itemCount > 0 ? 75 : null,
  band: (isRest ? "Rest" : itemCount > 0 ? "High" : "No log") as "Rest" | "High" | "No log",
  itemCount,
  loggedItems: [],
});

const graceKeep = computeStreaksAndActiveDays(
  [
    makeDay("2026-11-18", 1),
    makeDay("2026-11-19", 0), // missed 1
    makeDay("2026-11-20", 0), // missed 2
    makeDay("2026-11-21", 0), // missed 3 (still within 3-day grace!)
    makeDay("2026-11-22", 1),
    makeDay("2026-11-23", 0), // missed 1
    makeDay("2026-11-24", 0), // today unlogged
  ],
  "2026-11-24"
);
assert.equal(graceKeep.currentStreak, 2);
assert.equal(graceKeep.longestStreak, 2);

const graceBreak = computeStreaksAndActiveDays(
  [
    makeDay("2026-11-17", 1),
    makeDay("2026-11-18", 0), // missed 1
    makeDay("2026-11-19", 0), // missed 2
    makeDay("2026-11-20", 0), // missed 3
    makeDay("2026-11-21", 0), // missed 4 -> breaks streak!
    makeDay("2026-11-22", 1),
  ],
  "2026-11-22"
);
assert.equal(graceBreak.currentStreak, 1);
console.log("  [PASS] 3-day streak grace window verified");

// 9. Verify 1RM Estimation (Epley formula) & Personal Record (PR) Detection
assert.equal(estimateOneRepMax(100, 1), 100);
assert.equal(estimateOneRepMax(100, 10), 133); // 100 * (1 + 10/30) = 133.33 -> 133
assert.equal(estimateOneRepMax(60, 8), 76); // 60 * (1 + 8/30) = 76
assert.equal(estimateOneRepMax(0, 10), 0);
assert.equal(estimateOneRepMax(100, 0), 0);

const mockHistory: ExerciseLog[] = [
  {
    id: "log-1",
    userId: "u1",
    date: "2026-11-20",
    exerciseName: "Bench Press",
    muscleGroup: "Chest",
    sets: [
      { setNumber: 1, weightKg: 80, reps: 10 }, // 1RM: 107, vol: 800
      { setNumber: 2, weightKg: 85, reps: 8 },  // 1RM: 108, vol: 680
    ],
    source: "manual",
    addedLater: false,
    work: 1480,
    usualUsed: 1480,
    effortScore: 50,
    status: "Scored",
    scoringSettingsVersion: 1,
    createdAt: "2026-11-20T10:00:00Z",
  },
];

// Set PR evaluation: 90kg x 8 (1RM 114) beats prior max weight (85kg) and 1RM (108kg)
const setPr = detectSetPersonalRecord("Bench Press", { weightKg: 90, reps: 8 }, mockHistory);
assert.equal(setPr.isWeightPr, true);
assert.equal(setPr.isOneRepMaxPr, true);
assert.equal(setPr.estimated1RM, 114);

// Non-PR set: 80kg x 5 (1RM 93) beats neither
const setNonPr = detectSetPersonalRecord("Bench Press", { weightKg: 80, reps: 5 }, mockHistory);
assert.equal(setNonPr.isWeightPr, false);
assert.equal(setNonPr.isOneRepMaxPr, false);

// Workout PR detection:
const sessionPr = detectPersonalRecords(
  "Bench Press",
  [
    { weightKg: 80, reps: 10 },
    { weightKg: 90, reps: 5 }, // 90kg beats 85kg max weight
  ],
  mockHistory
);
assert.equal(sessionPr.isWeightPr, true);
assert.equal(sessionPr.bestWeight, 90);
assert.equal(sessionPr.bestOneRepMax, 108); // prior 85x8 was 108, current 90x5 is 105

// Empty history scenario: establishes records without false PR celebration
const emptyHistoryPr = detectPersonalRecords(
  "Overhead Press",
  [{ weightKg: 50, reps: 8 }],
  []
);
assert.equal(emptyHistoryPr.isWeightPr, false);
assert.equal(emptyHistoryPr.bestWeight, 50);
assert.equal(emptyHistoryPr.bestOneRepMax, 63); // 50 * (1 + 8/30) = 63.33 -> 63

// Assisted exercise PR & 1RM test (counterweight assistance inverted):
// If user logged 75kg assistance first, and later logs 65kg assistance, 65kg is superior!
const assistedHistory: ExerciseLog[] = [
  {
    id: "ap1",
    userId: "u1",
    date: "2026-11-22",
    exerciseName: "Assisted Pull-Ups",
    muscleGroup: "Back",
    sets: [
      { setNumber: 1, weightKg: 75, reps: 10 },
      { setNumber: 2, weightKg: 70, reps: 7 },
      { setNumber: 3, weightKg: 70, reps: 7 },
    ],
    source: "manual",
    addedLater: false,
    work: 300,
    usualUsed: null,
    effortScore: null,
    status: "Calibrating",
    scoringSettingsVersion: 1,
    createdAt: "2026-11-22T10:00:00Z",
  },
];

// 75kg x 10 reps -> 1RM assist = 75 / (1 + 10/30) = 56 kg assist
assert.equal(estimateOneRepMax(75, 10, "Assisted Pull-Ups"), 56);
// 65kg x 10 reps -> 1RM assist = 65 / (1 + 10/30) = 49 kg assist
assert.equal(estimateOneRepMax(65, 10, "Assisted Pull-Ups"), 49);

// Logging 65kg assistance beats previous 70kg best assistance
const assistedSetPr = detectSetPersonalRecord(
  "Assisted Pull-Ups",
  { weightKg: 65, reps: 10 },
  assistedHistory
);
assert.equal(assistedSetPr.isWeightPr, true); // 65kg < 70kg assistance
assert.equal(assistedSetPr.isOneRepMaxPr, true); // 49kg < 56kg 1RM assistance
assert.equal(assistedSetPr.estimated1RM, 49);

const assistedSessionPr = detectPersonalRecords(
  "Assisted Pull-Ups",
  [{ weightKg: 65, reps: 10 }],
  assistedHistory
);
assert.equal(assistedSessionPr.isWeightPr, true);
assert.equal(assistedSessionPr.bestWeight, 65); // User request: "if i used 75 now and 65 later then u chould consider as the 65"
assert.equal(assistedSessionPr.bestOneRepMax, 49);

console.log("  [PASS] 1RM estimation & PR detection verified");

// 10. Multiple indoor walks on the same day consolidated as splits
{
  const splitWalks: CardioLog[] = [
    {
      id: "walk_1",
      userId: "u_walk",
      date: "2026-11-24",
      activityType: "Indoor Walk",
      minutes: 20,
      distanceKm: 1.2,
      kcal: 80,
      kcalIsEstimated: false,
      source: "manual",
      addedLater: false,
      isRestActivity: false,
      work: 20,
      usualUsed: 20,
      effortScore: 50,
      status: "Scored",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-24T08:00:00Z",
    },
    {
      id: "walk_2",
      userId: "u_walk",
      date: "2026-11-24",
      activityType: "Indoor Walk",
      minutes: 15,
      distanceKm: 0.9,
      kcal: 60,
      kcalIsEstimated: false,
      source: "manual",
      addedLater: false,
      isRestActivity: false,
      work: 15,
      usualUsed: 20,
      effortScore: 45,
      status: "Scored",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-24T14:00:00Z",
    },
    {
      id: "walk_3",
      userId: "u_walk",
      date: "2026-11-24",
      activityType: "Indoor Walk",
      minutes: 25,
      distanceKm: 1.5,
      kcal: 100,
      kcalIsEstimated: false,
      source: "manual",
      addedLater: false,
      isRestActivity: false,
      work: 25,
      usualUsed: 20,
      effortScore: 55,
      status: "Scored",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-24T19:00:00Z",
    },
  ];

  const summary = computeUserDaySummaries({
    userId: "u_walk",
    firstLogDate: "2026-11-24",
    sessions: [],
    exerciseLogs: [],
    cardioLogs: splitWalks,
    thresholds: DEFAULT_GRID_THRESHOLDS,
  });

  const daySummary = summary.get("2026-11-24");
  assert.ok(daySummary);
  // Must be consolidated into ONE logged item with splits, not 3 individual exercises
  assert.equal(daySummary.loggedItems.length, 1);
  const consolidated = daySummary.loggedItems[0];
  assert.ok(consolidated.title.includes("Indoor Walk"));
  assert.ok(consolidated.title.includes("3 Splits"));
  assert.ok(consolidated.splits !== undefined);
  assert.equal(consolidated.splits?.length, 3);
  assert.equal(consolidated.splits?.[0].minutes, 20);
  assert.equal(consolidated.splits?.[1].minutes, 15);
  assert.equal(consolidated.splits?.[2].minutes, 25);
  // Total stats verified
  assert.ok(consolidated.detail.includes("60 min"));
  assert.ok(consolidated.detail.includes("240 kcal"));
  assert.equal(consolidated.splits?.every((s) => s.effortScore === null), true);
  console.log("  [PASS] Multiple indoor walks consolidated as splits verified");
}

// 11. One-day cardio gets ONE score per day (splits never scored individually or counted as extra days)
{
  const { recalculateEffortLogsForUser } = require("../effort");
  const makeWalk = (id: string, date: string, mins: number, dist: number, ts: string, hr?: number): CardioLog => ({
    id,
    userId: "u_daily",
    date,
    activityType: "Indoor Walk",
    minutes: mins,
    distanceKm: dist,
    avgHeartRate: hr,
    kcal: mins * 6,
    kcalIsEstimated: true,
    source: "manual",
    addedLater: false,
    isRestActivity: false,
    work: calculateCardioWork("Indoor Walk", mins, hr, dist),
    usualUsed: null,
    effortScore: null,
    status: "Calibrating",
    scoringSettingsVersion: 1,
    createdAt: ts,
  });

  // HR parameter order check (minutes, avgHeartRate, distanceKm)
  assert.equal(calculateCardioWork("Indoor Walk", 9, 150, 0.5), 13.5);

  const cardioLogs: CardioLog[] = [
    // Day 1 (Nov 22): 3 splits (5m, 7m, 15m) -> total 27m = Day 1 calibrating
    makeWalk("d1_s1", "2026-11-22", 5, 0.3, "2026-11-22T08:00:00Z"),
    makeWalk("d1_s2", "2026-11-22", 7, 0.5, "2026-11-22T12:00:00Z"),
    makeWalk("d1_s3", "2026-11-22", 15, 1.0, "2026-11-22T19:00:00Z"),
    // Day 2 (Nov 23): 2 splits -> still Calibrating (only 2 distinct days!)
    makeWalk("d2_s1", "2026-11-23", 10, 0.7, "2026-11-23T08:00:00Z"),
    makeWalk("d2_s2", "2026-11-23", 17, 1.1, "2026-11-23T18:00:00Z"),
    // Day 3 (Nov 24): 2 splits -> 3rd distinct day, scored ONCE as a day
    makeWalk("d3_s1", "2026-11-24", 12, 0.8, "2026-11-24T09:00:00Z"),
    makeWalk("d3_s2", "2026-11-24", 15, 1.0, "2026-11-24T18:00:00Z"),
  ];

  recalculateEffortLogsForUser([], cardioLogs, "u_daily", {
    aboveUsualSlope: 12.5,
    belowUsualRoot: 4,
  });

  // Day 1 Split 3 MUST stay Calibrating (never scored 50 on Day 1)
  assert.equal(cardioLogs[0].status, "Calibrating");
  assert.equal(cardioLogs[2].status, "Calibrating");
  assert.equal(cardioLogs[2].effortScore, null);

  // Day 2 stays Calibrating across both splits
  assert.equal(cardioLogs[3].status, "Calibrating");
  assert.equal(cardioLogs[4].effortScore, null);

  // Day 3 unlocks ONE identical daily score across both splits
  assert.equal(cardioLogs[5].status, "Scored");
  assert.equal(cardioLogs[6].status, "Scored");
  assert.equal(cardioLogs[5].effortScore, 50);
  assert.equal(cardioLogs[6].effortScore, 50);

  const summary = computeUserDaySummaries({
    userId: "u_daily",
    firstLogDate: "2026-11-22",
    sessions: [],
    exerciseLogs: [],
    cardioLogs,
    thresholds: DEFAULT_GRID_THRESHOLDS,
  });
  const day3Summary = summary.get("2026-11-24");
  assert.ok(day3Summary);
  assert.equal(day3Summary.loggedItems[0].status, "Scored");
  assert.equal(day3Summary.loggedItems[0].effortScore, 50);
  assert.equal(day3Summary.loggedItems[0].splits?.every((s) => s.effortScore === null), true);
  console.log("  [PASS] One-day daily cardio single-score rule verified");
}

// 12. Rest duration formatting & optional set rest time tracking
{
  const { formatRestDuration } = require("../effort");
  assert.equal(formatRestDuration(45), "45s");
  assert.equal(formatRestDuration(60), "1m");
  assert.equal(formatRestDuration(90), "1m 30s");
  assert.equal(formatRestDuration(120), "2m");
  console.log("  [PASS] Rest duration formatting verified");
}

// 13. Equality between Cardio and Non-Cardio workouts (no cardio penalty in provisional or calibrated modes)
{
  const makeEx = (id: string, name: string, numSets: number): ExerciseLog => ({
    id,
    userId: "u_eq",
    date: "2026-11-24",
    exerciseName: name,
    muscleGroup: "Back",
    sets: Array.from({ length: numSets }, (_, i) => ({
      setNumber: i + 1,
      weightKg: 40,
      reps: 10,
    })),
    source: "manual",
    addedLater: false,
    work: numSets * 400,
    usualUsed: null,
    effortScore: null,
    status: "Calibrating",
    scoringSettingsVersion: 1,
    createdAt: "2026-11-24T10:00:00Z",
  });

  // 9 sets across 3 exercises with NO cardio must not get an automatic 100
  const nineSetsNoCardio = computeProvisionalDailyEffort(
    [makeEx("e1", "Seated Row", 3), makeEx("e2", "Hammer Curl", 3), makeEx("e3", "High Pulley", 3)],
    []
  );
  assert.ok(nineSetsNoCardio < 90, `Expected 9 sets without cardio < 90, got ${nineSetsNoCardio}`);

  // Exact same workout WITH cardio must score STRICTLY HIGHER than without cardio
  const sameNineSetsWithCardio = computeProvisionalDailyEffort(
    [makeEx("e1", "Seated Row", 3), makeEx("e2", "Hammer Curl", 3), makeEx("e3", "High Pulley", 3)],
    [
      {
        id: "c1",
        userId: "u_eq",
        date: "2026-11-24",
        activityType: "Indoor Walk",
        minutes: 10,
        avgHeartRate: 150,
        kcal: 90,
        kcalIsEstimated: true,
        source: "manual",
        addedLater: false,
        isRestActivity: false,
        work: 15,
        usualUsed: null,
        effortScore: null,
        status: "Calibrating",
        scoringSettingsVersion: 1,
        createdAt: "2026-11-24T10:30:00Z",
      },
    ]
  );
  assert.ok(
    sameNineSetsWithCardio > nineSetsNoCardio,
    `Adding cardio (${sameNineSetsWithCardio}) must exceed without cardio (${nineSetsNoCardio})`
  );

  // Calibrated day: a light cool-down walk (37) added to 3 strong exercises (55) must not lower the day below 55
  const calibratedMixed = computeUserDaySummaries({
    userId: "u_cal_eq",
    firstLogDate: "2026-11-01",
    sessions: [
      { id: "s1", userId: "u_cal_eq", date: "2026-11-10", muscleGroups: ["Back", "Cardio"], isRest: false, createdAt: "2026-11-10T10:00:00Z" },
      { id: "s2", userId: "u_cal_eq", date: "2026-11-15", muscleGroups: ["Back", "Cardio"], isRest: false, createdAt: "2026-11-15T10:00:00Z" },
      { id: "s3", userId: "u_cal_eq", date: "2026-11-24", muscleGroups: ["Back", "Cardio"], isRest: false, createdAt: "2026-11-24T10:00:00Z" },
    ],
    exerciseLogs: [
      { ...makeEx("x1", "Seated Row", 3), userId: "u_cal_eq", date: "2026-11-10", status: "Scored", effortScore: 50 },
      { ...makeEx("x2", "Seated Row", 3), userId: "u_cal_eq", date: "2026-11-15", status: "Scored", effortScore: 50 },
      { ...makeEx("x3", "Seated Row", 3), userId: "u_cal_eq", date: "2026-11-24", status: "Scored", effortScore: 55 },
      { ...makeEx("x4", "Lat Pulldown", 3), userId: "u_cal_eq", date: "2026-11-24", status: "Scored", effortScore: 55 },
    ],
    cardioLogs: [
      {
        id: "kc1",
        userId: "u_cal_eq",
        date: "2026-11-10",
        activityType: "Indoor Walk",
        minutes: 20,
        kcal: 120,
        kcalIsEstimated: true,
        source: "manual",
        addedLater: false,
        isRestActivity: false,
        work: 70,
        usualUsed: 70,
        effortScore: 50,
        status: "Scored",
        scoringSettingsVersion: 1,
        createdAt: "2026-11-10T11:00:00Z",
      },
      {
        id: "kc2",
        userId: "u_cal_eq",
        date: "2026-11-15",
        activityType: "Indoor Walk",
        minutes: 20,
        kcal: 120,
        kcalIsEstimated: true,
        source: "manual",
        addedLater: false,
        isRestActivity: false,
        work: 70,
        usualUsed: 70,
        effortScore: 50,
        status: "Scored",
        scoringSettingsVersion: 1,
        createdAt: "2026-11-15T11:00:00Z",
      },
      {
        id: "kc3",
        userId: "u_cal_eq",
        date: "2026-11-24",
        activityType: "Indoor Walk",
        minutes: 5,
        kcal: 40,
        kcalIsEstimated: true,
        source: "manual",
        addedLater: false,
        isRestActivity: false,
        work: 17.5,
        usualUsed: 70,
        effortScore: 37,
        status: "Scored",
        scoringSettingsVersion: 1,
        createdAt: "2026-11-24T11:00:00Z",
      },
    ],
    thresholds: DEFAULT_GRID_THRESHOLDS,
  });
  const nov24Eq = calibratedMixed.get("2026-11-24");
  assert.ok(nov24Eq && typeof nov24Eq.effortScore === "number");
  assert.ok(nov24Eq.effortScore >= 55, `Expected cardio not to drag calibrated day (${nov24Eq.effortScore}) below strength (55)`);
  console.log("  [PASS] Cardio vs non-cardio equality verified");
}

// 14. Consecutive (max 2) and weekly (max 3 per 7 days) rest day caps prevent bunching 8 rest days into 1 week
{
  // Balanced: 2 consecutive weekend rest days protect streak cleanly
  const balancedStreak = computeStreaksAndActiveDays(
    [
      makeDay("2026-11-16", 1),
      makeDay("2026-11-17", 1),
      makeDay("2026-11-18", 0, true), // rest 1
      makeDay("2026-11-19", 0, true), // rest 2 (<= 2 consecutive, <= 3 in 7d)
      makeDay("2026-11-20", 1),
    ],
    "2026-11-20"
  );
  assert.equal(balancedStreak.currentStreak, 3);

  // Clustered 8 rest days all in one week breaks streak (> 2 consecutive + > 3 grace)
  const clusteredStreak = computeStreaksAndActiveDays(
    [
      makeDay("2026-11-12", 1),
      makeDay("2026-11-13", 1),
      makeDay("2026-11-14", 0, true),
      makeDay("2026-11-15", 0, true),
      makeDay("2026-11-16", 0, true),
      makeDay("2026-11-17", 0, true),
      makeDay("2026-11-18", 0, true),
      makeDay("2026-11-19", 0, true),
      makeDay("2026-11-20", 0, true),
      makeDay("2026-11-21", 0, true), // 8 rest days in a row -> streak must break!
      makeDay("2026-11-22", 1),
    ],
    "2026-11-22"
  );
  assert.equal(clusteredStreak.currentStreak, 1);

  // Consistency penalizes 7 rest days crammed into one 10-day window
  const bunchedConsistency = computeProgressAndConsistency({
    exerciseLogs: [],
    cardioLogs: [],
    summaries30: [
      makeDay("2026-11-10", 1),
      makeDay("2026-11-11", 0, true),
      makeDay("2026-11-12", 0, true),
      makeDay("2026-11-13", 0, true),
      makeDay("2026-11-14", 0, true),
      makeDay("2026-11-15", 0, true),
      makeDay("2026-11-16", 0, true),
      makeDay("2026-11-17", 0, true),
      makeDay("2026-11-18", 1),
    ],
  });
  assert.ok(
    bunchedConsistency.consistencyPercent < 60,
    `Expected clustered week of rest to drop consistency below 60%, got ${bunchedConsistency.consistencyPercent}%`
  );
  console.log("  [PASS] Consecutive (2d) & weekly (3d/wk) rest limits verified");
}

// 15. Final Calibrated Daily Scoring: Chest + optional Cardio does not fragment session kind or inflate denominator
{
  const makeChestEx = (id: string, date: string, name: string, score: number, status: "Calibrating" | "Scored"): ExerciseLog => ({
    id,
    userId: "u_layer3",
    date,
    exerciseName: name,
    muscleGroup: "Chest",
    sets: [{ setNumber: 1, weightKg: 40, reps: 10 }],
    source: "manual",
    addedLater: false,
    work: 400,
    usualUsed: status === "Scored" ? 400 : null,
    effortScore: score,
    status,
    scoringSettingsVersion: 1,
    createdAt: `${date}T10:00:00Z`,
  });

  const summaries = computeUserDaySummaries({
    userId: "u_layer3",
    firstLogDate: "2026-11-01",
    sessions: [
      { id: "s1", userId: "u_layer3", date: "2026-11-10", muscleGroups: ["Chest"], isRest: false, createdAt: "2026-11-10T10:00:00Z" },
      { id: "s2", userId: "u_layer3", date: "2026-11-15", muscleGroups: ["Chest"], isRest: false, createdAt: "2026-11-15T10:00:00Z" },
      { id: "s3", userId: "u_layer3", date: "2026-11-20", muscleGroups: ["Chest", "Cardio"], isRest: false, createdAt: "2026-11-20T10:00:00Z" },
    ],
    exerciseLogs: [
      makeChestEx("e1", "2026-11-10", "Bench Press", 50, "Scored"),
      makeChestEx("e2", "2026-11-10", "Pec Fly", 50, "Scored"),
      makeChestEx("e3", "2026-11-10", "Incline Press", 50, "Scored"),
      makeChestEx("e4", "2026-11-15", "Bench Press", 50, "Scored"),
      makeChestEx("e5", "2026-11-15", "Pec Fly", 50, "Scored"),
      makeChestEx("e6", "2026-11-15", "Incline Press", 50, "Scored"),
      makeChestEx("e7", "2026-11-20", "Bench Press", 50, "Scored"),
      makeChestEx("e8", "2026-11-20", "Pec Fly", 50, "Scored"),
      makeChestEx("e9", "2026-11-20", "Incline Press", 50, "Scored"),
    ],
    cardioLogs: [
      {
        id: "c3",
        userId: "u_layer3",
        date: "2026-11-20",
        activityType: "Indoor Walk",
        minutes: 10,
        kcal: 60,
        kcalIsEstimated: true,
        source: "manual",
        addedLater: false,
        isRestActivity: false,
        work: 35,
        usualUsed: 35,
        effortScore: 37,
        status: "Scored",
        scoringSettingsVersion: 1,
        createdAt: "2026-11-20T11:00:00Z",
      },
    ],
    thresholds: DEFAULT_GRID_THRESHOLDS,
  });

  const nov20 = summaries.get("2026-11-20");
  assert.ok(nov20);
  // Shares Chest baseline from Nov 10 & Nov 15 -> unlocks Scored immediately AND stays fair (~50-56, NOT 64 inflated)
  assert.equal(nov20.status, "Scored");
  assert.ok(
    nov20.effortScore !== null && nov20.effortScore >= 50 && nov20.effortScore <= 58,
    `Expected fair calibrated Chest+Cardio score in [50..58], got ${nov20.effortScore}`
  );
  console.log("  [PASS] Final calibrated Chest + optional Cardio fairness verified");
}

console.log("All Honest Reps Effort Engine tests passed.");
