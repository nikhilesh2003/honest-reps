import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  addDaysIso,
  calculateCardioWork,
  calculateStrengthWork,
  computeStreaksAndActiveDays,
  computeUserDaySummaries,
  DEFAULT_GRID_THRESHOLDS,
  estimateCardioCalories,
  formatLocalIsoDate,
  recalculateEffortLogsForUser,
} from "../effort";
import {
  CardioLog,
  DailySession,
  DatabaseState,
  DaySummary,
  ExerciseLibraryItem,
  ExerciseLog,
  ExerciseSet,
  LogSource,
  MuscleGroup,
  NotificationSettings,
  Profile,
  WeightLog,
} from "../types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "honest-reps-db.json");

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

export function getTodayIso(): string {
  return formatLocalIsoDate(new Date());
}

// Deterministic pseudo-random helper so seed data is rich and realistic
function seededRand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function buildDefaultMuscleGroups(): MuscleGroup[] {
  const names = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Cardio"];
  return names.map((name, idx) => ({
    id: `mg_default_${idx + 1}`,
    name,
    enabled: true,
    displayOrder: idx + 1,
    ownerId: null,
  }));
}

function buildDefaultExercises(): ExerciseLibraryItem[] {
  const defs: Array<[string, string]> = [
    ["Bench Press", "Chest"],
    ["Incline DB Press", "Chest"],
    ["Cable Fly", "Chest"],
    ["Push-Ups", "Chest"],
    ["Pull-Ups", "Back"],
    ["Barbell Row", "Back"],
    ["Lat Pulldown", "Back"],
    ["Seated Cable Row", "Back"],
    ["Barbell Squat", "Legs"],
    ["Leg Press", "Legs"],
    ["Romanian Deadlift", "Legs"],
    ["Leg Extension", "Legs"],
    ["Leg Curl", "Legs"],
    ["Bulgarian Split Squat", "Legs"],
    ["Overhead Press", "Shoulders"],
    ["Lateral Raise", "Shoulders"],
    ["Face Pull", "Shoulders"],
    ["Tricep Pushdown", "Arms"],
    ["Barbell Curl", "Arms"],
    ["Hammer Curl", "Arms"],
    ["Hanging Leg Raise", "Core"],
    ["Cable Crunch", "Core"],
    ["Plank", "Core"],
  ];
  return defs.map(([name, muscleGroup], idx) => ({
    id: `ex_default_${idx + 1}`,
    name,
    muscleGroup,
    enabled: true,
    displayOrder: idx + 1,
    ownerId: null,
  }));
}

function createInitialSeed(): DatabaseState {
  const todayIso = getTodayIso();
  const startIso = addDaysIso(todayIso, -364);

  const nikhilId = "user_nikhil";
  const rahulId = "user_rahul";
  const aaravId = "user_aarav";
  const mayaId = "user_maya";
  const kiranId = "user_kiran";
  const devId = "user_dev";

  const profiles: Profile[] = [
    {
      userId: nikhilId,
      email: "nikhil@honestreps.com",
      name: "Nikhil Sharma",
      username: "nikhil_lifts",
      heightCm: 178,
      activeStatus: "Moderately active",
      weightUnit: "kg",
      heightUnit: "cm",
      age: 27,
      sex: "Male",
      goal: "Build strength & steady consistency",
      shareWorkoutDetails: false, // FR-69: OFF by default
      onboardingComplete: true,
      suspended: false,
      firstLogDate: startIso,
      createdAt: `${startIso}T08:00:00.000Z`,
    },
    {
      userId: rahulId,
      email: "rahul@honestreps.com",
      name: "Rahul Verma",
      username: "rahul_runs",
      heightCm: 175,
      activeStatus: "Very active",
      weightUnit: "kg",
      heightUnit: "cm",
      age: 28,
      sex: "Male",
      goal: "10K & strength balance",
      shareWorkoutDetails: true, // Demonstrates shared workout details view (FR-69)
      onboardingComplete: true,
      suspended: false,
      firstLogDate: addDaysIso(todayIso, -220),
      createdAt: `${addDaysIso(todayIso, -220)}T08:00:00.000Z`,
    },
    {
      userId: aaravId,
      email: "aarav@honestreps.com",
      name: "Aarav Mehta",
      username: "aarav_iron",
      heightCm: 181,
      activeStatus: "Moderately active",
      weightUnit: "kg",
      heightUnit: "cm",
      age: 26,
      sex: "Male",
      goal: "Hypertrophy",
      shareWorkoutDetails: false, // Demonstrates private workout details view (FR-39)
      onboardingComplete: true,
      suspended: false,
      firstLogDate: addDaysIso(todayIso, -190),
      createdAt: `${addDaysIso(todayIso, -190)}T08:00:00.000Z`,
    },
    {
      userId: mayaId,
      email: "maya@honestreps.com",
      name: "Maya Nair",
      username: "maya_moves",
      heightCm: 165,
      activeStatus: "Lightly active",
      weightUnit: "kg",
      heightUnit: "cm",
      age: 25,
      sex: "Female",
      goal: "Consistency",
      shareWorkoutDetails: false,
      onboardingComplete: true,
      suspended: false,
      firstLogDate: addDaysIso(todayIso, -3), // Still Calibrating (FR-38: not ranked)
      createdAt: `${addDaysIso(todayIso, -3)}T08:00:00.000Z`,
    },
    {
      userId: kiranId,
      email: "kiran@honestreps.com",
      name: "Kiran Patel",
      username: "kiran_fit",
      heightCm: 172,
      activeStatus: "Moderately active",
      weightUnit: "kg",
      heightUnit: "cm",
      shareWorkoutDetails: false,
      onboardingComplete: true,
      suspended: false,
      firstLogDate: addDaysIso(todayIso, -90),
      createdAt: `${addDaysIso(todayIso, -90)}T08:00:00.000Z`,
    },
    {
      userId: devId,
      email: "dev@honestreps.com",
      name: "Dev Joshi",
      username: "dev_iron",
      heightCm: 180,
      activeStatus: "Very active",
      weightUnit: "kg",
      heightUnit: "cm",
      shareWorkoutDetails: true,
      onboardingComplete: true,
      suspended: false,
      firstLogDate: addDaysIso(todayIso, -120),
      createdAt: `${addDaysIso(todayIso, -120)}T08:00:00.000Z`,
    },
  ];

  // FR-5 & FR-42: Dated weight history; last log is 8 days ago so skippable weight card triggers cleanly
  const weightLogs: WeightLog[] = [
    { id: "wl_1", userId: nikhilId, date: addDaysIso(todayIso, -42), weightKg: 76.2, createdAt: `${addDaysIso(todayIso, -42)}T07:30:00.000Z` },
    { id: "wl_2", userId: nikhilId, date: addDaysIso(todayIso, -35), weightKg: 75.8, createdAt: `${addDaysIso(todayIso, -35)}T07:30:00.000Z` },
    { id: "wl_3", userId: nikhilId, date: addDaysIso(todayIso, -28), weightKg: 75.4, createdAt: `${addDaysIso(todayIso, -28)}T07:30:00.000Z` },
    { id: "wl_4", userId: nikhilId, date: addDaysIso(todayIso, -21), weightKg: 75.1, createdAt: `${addDaysIso(todayIso, -21)}T07:30:00.000Z` },
    { id: "wl_5", userId: nikhilId, date: addDaysIso(todayIso, -15), weightKg: 74.8, createdAt: `${addDaysIso(todayIso, -15)}T07:30:00.000Z` },
    { id: "wl_6", userId: nikhilId, date: addDaysIso(todayIso, -8), weightKg: 74.5, createdAt: `${addDaysIso(todayIso, -8)}T07:30:00.000Z` },
  ];

  const sessions: DailySession[] = [];
  const exerciseLogs: ExerciseLog[] = [];
  const cardioLogs: CardioLog[] = [];

  // Helper to seed realistic 365-day training logs for a member
  const seedMemberHistory = (
    userId: string,
    daysBack: number,
    seedOffset: number,
    skipLast7: boolean
  ) => {
    const splits: Array<{
      groups: string[];
      exercises: Array<{ name: string; group: string; baseWeight: number; reps: number }>;
      isCardio?: boolean;
    }> = [
      {
        groups: ["Chest", "Arms"],
        exercises: [
          { name: "Bench Press", group: "Chest", baseWeight: 77.5, reps: 8 },
          { name: "Incline DB Press", group: "Chest", baseWeight: 28, reps: 10 },
          { name: "Tricep Pushdown", group: "Arms", baseWeight: 32.5, reps: 12 },
        ],
      },
      {
        groups: ["Back", "Arms"],
        exercises: [
          { name: "Barbell Row", group: "Back", baseWeight: 70, reps: 10 },
          { name: "Lat Pulldown", group: "Back", baseWeight: 60, reps: 10 },
          { name: "Hammer Curl", group: "Arms", baseWeight: 16, reps: 12 },
        ],
      },
      {
        groups: ["Legs"],
        exercises: [
          { name: "Barbell Squat", group: "Legs", baseWeight: 95, reps: 8 },
          { name: "Romanian Deadlift", group: "Legs", baseWeight: 85, reps: 8 },
          { name: "Leg Extension", group: "Legs", baseWeight: 55, reps: 12 },
        ],
      },
      {
        groups: ["Shoulders", "Core"],
        exercises: [
          { name: "Overhead Press", group: "Shoulders", baseWeight: 50, reps: 8 },
          { name: "Lateral Raise", group: "Shoulders", baseWeight: 12, reps: 14 },
          { name: "Hanging Leg Raise", group: "Core", baseWeight: 0, reps: 15 },
        ],
      },
      {
        groups: ["Cardio"],
        exercises: [],
        isCardio: true,
      },
    ];

    let splitCursor = seedOffset % splits.length;
    const stopAt = skipLast7 ? 7 : 0;

    for (let offset = daysBack; offset >= stopAt; offset--) {
      const date = addDaysIso(todayIso, -offset);
      const r = seededRand(offset * 17 + seedOffset * 131);

      // ~18% No log, ~17% Rest day, ~65% Workout day
      if (r < 0.17) {
        continue; // No log
      }
      if (r < 0.34) {
        sessions.push({
          id: uid("ses"),
          userId,
          date,
          muscleGroups: [],
          isRest: true,
          createdAt: `${date}T09:00:00.000Z`,
        });
        continue;
      }

      const plan = splits[splitCursor % splits.length];
      splitCursor += 1;

      sessions.push({
        id: uid("ses"),
        userId,
        date,
        muscleGroups: plan.groups,
        isRest: false,
        createdAt: `${date}T17:00:00.000Z`,
      });

      // Slight progressive overload over the year
      const progressFactor = 0.88 + ((daysBack - offset) / Math.max(1, daysBack)) * 0.16;
      const intensityJitter = 0.72 + seededRand(offset * 31 + seedOffset * 53) * 0.65;

      if (plan.isCardio) {
        const mins = Math.max(14, Math.round(24 * intensityJitter));
        const dist = Number((mins * 0.17).toFixed(2));
        const hasHr = seededRand(offset * 11 + seedOffset) > 0.35;
        const avgHr = hasHr ? Math.round(138 + seededRand(offset * 19) * 26) : undefined;
        const isEst = seededRand(offset * 23) > 0.55;
        const kcal = estimateCardioCalories(74.5, "Outdoor Run", mins, dist);

        cardioLogs.push({
          id: uid("crd"),
          userId,
          date,
          activityType: hasHr ? "Outdoor Run" : "Treadmill Run",
          distanceKm: dist,
          minutes: mins,
          avgHeartRate: avgHr,
          kcal,
          kcalIsEstimated: isEst,
          source: "text-parsed",
          addedLater: false,
          isRestActivity: false,
          work: calculateCardioWork(hasHr ? "Outdoor Run" : "Treadmill Run", mins, avgHr, dist),
          usualUsed: null,
          effortScore: null,
          status: "Calibrating",
          scoringSettingsVersion: 1,
          createdAt: `${date}T18:10:00.000Z`,
        });
      } else {
        for (const ex of plan.exercises) {
          const w =
            ex.baseWeight === 0
              ? 0
              : Math.round((ex.baseWeight * progressFactor * (0.94 + intensityJitter * 0.08)) / 2.5) * 2.5;
          const setCount = intensityJitter > 1.15 ? 3 : intensityJitter < 0.82 ? 1 : 2;
          const sets: ExerciseSet[] = [];
          for (let s = 1; s <= setCount; s++) {
            sets.push({
              setNumber: s,
              weightKg: Math.max(0, w),
              reps: Math.max(5, Math.round(ex.reps * (0.9 + intensityJitter * 0.15))),
            });
          }
          exerciseLogs.push({
            id: uid("exl"),
            userId,
            date,
            exerciseName: ex.name,
            muscleGroup: ex.group,
            sets,
            source: "manual",
            addedLater: false,
            work: calculateStrengthWork(sets),
            usualUsed: null,
            effortScore: null,
            status: "Calibrating",
            scoringSettingsVersion: 1,
            createdAt: `${date}T18:00:00.000Z`,
          });
        }
      }
    }
  };

  // Seed Nikhil's past year (up to 7 days ago) + curated recent 7 days demonstrating EVERY spec state!
  seedMemberHistory(nikhilId, 360, 1, true);

  // Curated Last 7 Days for Nikhil:
  // Day -6: Shoulders & Core (Steady ~50)
  const d6 = addDaysIso(todayIso, -6);
  sessions.push({ id: uid("ses"), userId: nikhilId, date: d6, muscleGroups: ["Shoulders", "Core"], isRest: false, createdAt: `${d6}T17:00:00.000Z` });
  exerciseLogs.push(
    {
      id: uid("exl"), userId: nikhilId, date: d6, exerciseName: "Overhead Press", muscleGroup: "Shoulders",
      sets: [{ setNumber: 1, weightKg: 52.5, reps: 8 }, { setNumber: 2, weightKg: 52.5, reps: 8 }],
      source: "manual", addedLater: false, work: calculateStrengthWork([{ setNumber: 1, weightKg: 52.5, reps: 8 }, { setNumber: 2, weightKg: 52.5, reps: 8 }]),
      usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${d6}T17:15:00.000Z`,
    },
    {
      id: uid("exl"), userId: nikhilId, date: d6, exerciseName: "Lateral Raise", muscleGroup: "Shoulders",
      sets: [{ setNumber: 1, weightKg: 12.5, reps: 14 }, { setNumber: 2, weightKg: 12.5, reps: 14 }],
      source: "manual", addedLater: false, work: calculateStrengthWork([{ setNumber: 1, weightKg: 12.5, reps: 14 }, { setNumber: 2, weightKg: 12.5, reps: 14 }]),
      usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${d6}T17:25:00.000Z`,
    },
    {
      id: uid("exl"), userId: nikhilId, date: d6, exerciseName: "Hanging Leg Raise", muscleGroup: "Core",
      sets: [{ setNumber: 1, weightKg: 0, reps: 16 }, { setNumber: 2, weightKg: 0, reps: 14 }],
      source: "manual", addedLater: false, work: calculateStrengthWork([{ setNumber: 1, weightKg: 0, reps: 16 }, { setNumber: 2, weightKg: 0, reps: 14 }]),
      usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${d6}T17:35:00.000Z`,
    }
  );

  // Day -5: Cardio (Treadmill Run, Estimated kcal per FR-20/FR-21)
  const d5 = addDaysIso(todayIso, -5);
  sessions.push({ id: uid("ses"), userId: nikhilId, date: d5, muscleGroups: ["Cardio"], isRest: false, createdAt: `${d5}T08:00:00.000Z` });
  cardioLogs.push({
    id: uid("crd"), userId: nikhilId, date: d5, activityType: "Treadmill Run", distanceKm: 4.5, minutes: 28,
    kcal: estimateCardioCalories(74.5, "Treadmill Run", 28, 4.5), kcalIsEstimated: true,
    source: "text-parsed", addedLater: false, isRestActivity: false,
    work: calculateCardioWork("Treadmill Run", 28, undefined, 4.5),
    usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${d5}T08:30:00.000Z`,
  });

  // Day -4: Back & Arms + Backfilled entry ("Added later", FR-34/FR-74)
  const d4 = addDaysIso(todayIso, -4);
  sessions.push({ id: uid("ses"), userId: nikhilId, date: d4, muscleGroups: ["Back", "Arms"], isRest: false, createdAt: `${d4}T18:00:00.000Z` });
  exerciseLogs.push(
    {
      id: uid("exl"), userId: nikhilId, date: d4, exerciseName: "Barbell Row", muscleGroup: "Back",
      sets: [{ setNumber: 1, weightKg: 72.5, reps: 10 }, { setNumber: 2, weightKg: 72.5, reps: 8 }],
      source: "manual", addedLater: true, work: calculateStrengthWork([{ setNumber: 1, weightKg: 72.5, reps: 10 }, { setNumber: 2, weightKg: 72.5, reps: 8 }]),
      usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${d4}T18:20:00.000Z`,
    },
    {
      id: uid("exl"), userId: nikhilId, date: d4, exerciseName: "Lat Pulldown", muscleGroup: "Back",
      sets: [{ setNumber: 1, weightKg: 62.5, reps: 10 }, { setNumber: 2, weightKg: 62.5, reps: 10 }],
      source: "manual", addedLater: false, work: calculateStrengthWork([{ setNumber: 1, weightKg: 62.5, reps: 10 }, { setNumber: 2, weightKg: 62.5, reps: 10 }]),
      usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${d4}T18:35:00.000Z`,
    },
    {
      id: uid("exl"), userId: nikhilId, date: d4, exerciseName: "Hammer Curl", muscleGroup: "Arms",
      sets: [{ setNumber: 1, weightKg: 17.5, reps: 12 }],
      source: "manual", addedLater: false, work: calculateStrengthWork([{ setNumber: 1, weightKg: 17.5, reps: 12 }]),
      usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${d4}T18:45:00.000Z`,
    }
  );

  // Day -3: Legs with Scored Squat + CALIBRATING Bulgarian Split Squat (only 2 logs total => FR-62/FR-63)
  const d3 = addDaysIso(todayIso, -3);
  sessions.push({ id: uid("ses"), userId: nikhilId, date: d3, muscleGroups: ["Legs"], isRest: false, createdAt: `${d3}T17:30:00.000Z` });
  // Ensure Bulgarian Split Squat has 1 earlier log so Day -3 is Log 2 of 3 (Calibrating!)
  exerciseLogs.push(
    {
      id: uid("exl"), userId: nikhilId, date: addDaysIso(todayIso, -10), exerciseName: "Bulgarian Split Squat", muscleGroup: "Legs",
      sets: [{ setNumber: 1, weightKg: 20, reps: 10 }, { setNumber: 2, weightKg: 20, reps: 10 }],
      source: "manual", addedLater: false, work: 400,
      usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${addDaysIso(todayIso, -10)}T17:30:00.000Z`,
    },
    {
      id: uid("exl"), userId: nikhilId, date: d3, exerciseName: "Barbell Squat", muscleGroup: "Legs",
      sets: [{ setNumber: 1, weightKg: 102.5, reps: 8 }, { setNumber: 2, weightKg: 105, reps: 8 }, { setNumber: 3, weightKg: 105, reps: 6 }],
      source: "manual", addedLater: false, work: calculateStrengthWork([{ setNumber: 1, weightKg: 102.5, reps: 8 }, { setNumber: 2, weightKg: 105, reps: 8 }, { setNumber: 3, weightKg: 105, reps: 6 }]),
      usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${d3}T17:40:00.000Z`,
    },
    {
      id: uid("exl"), userId: nikhilId, date: d3, exerciseName: "Romanian Deadlift", muscleGroup: "Legs",
      sets: [{ setNumber: 1, weightKg: 90, reps: 10 }, { setNumber: 2, weightKg: 90, reps: 10 }],
      source: "manual", addedLater: false, work: calculateStrengthWork([{ setNumber: 1, weightKg: 90, reps: 10 }, { setNumber: 2, weightKg: 90, reps: 10 }]),
      usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${d3}T17:55:00.000Z`,
    },
    {
      id: uid("exl"), userId: nikhilId, date: d3, exerciseName: "Bulgarian Split Squat", muscleGroup: "Legs",
      sets: [{ setNumber: 1, weightKg: 24, reps: 8 }, { setNumber: 2, weightKg: 24, reps: 8 }],
      source: "manual", addedLater: false, work: 384,
      usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${d3}T18:10:00.000Z`,
    }
  );

  // Day -2: Rest Day with light Indoor Walk (FR-32, FR-77: labeled Rest, not judged against workout days)
  const d2 = addDaysIso(todayIso, -2);
  sessions.push({ id: uid("ses"), userId: nikhilId, date: d2, muscleGroups: [], isRest: true, createdAt: `${d2}T09:00:00.000Z` });
  cardioLogs.push({
    id: uid("crd"), userId: nikhilId, date: d2, activityType: "Indoor Walk", distanceKm: 1.2, minutes: 20,
    kcal: estimateCardioCalories(74.5, "Indoor Walk", 20, 1.2), kcalIsEstimated: true,
    source: "text-parsed", addedLater: false, isRestActivity: true,
    work: calculateCardioWork("Indoor Walk", 20, undefined, 1.2),
    usualUsed: null, effortScore: null, status: "Rest", scoringSettingsVersion: 1, createdAt: `${d2}T10:15:00.000Z`,
  });

  // Day -1 (Yesterday): Outdoor Run with Heart Rate (Scored ~51 Steady)
  const d1 = addDaysIso(todayIso, -1);
  sessions.push({ id: uid("ses"), userId: nikhilId, date: d1, muscleGroups: ["Cardio"], isRest: false, createdAt: `${d1}T07:45:00.000Z` });
  cardioLogs.push({
    id: uid("crd"), userId: nikhilId, date: d1, activityType: "Outdoor Run", distanceKm: 5.2, minutes: 28,
    avgHeartRate: 154, kcal: 320, kcalIsEstimated: false,
    source: "image-parsed", addedLater: false, isRestActivity: false,
    work: calculateCardioWork("Outdoor Run", 28, 154, 5.2),
    usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${d1}T08:15:00.000Z`,
  });

  // Today: Chest & Arms (Bench Press progression up to 85kg, Incline DB, Tricep Pushdown)
  sessions.push({ id: uid("ses"), userId: nikhilId, date: todayIso, muscleGroups: ["Chest", "Arms"], isRest: false, createdAt: `${todayIso}T14:00:00.000Z` });
  const benchSets: ExerciseSet[] = [
    { setNumber: 1, weightKg: 80, reps: 10 },
    { setNumber: 2, weightKg: 82.5, reps: 8 },
    { setNumber: 3, weightKg: 85, reps: 6 },
  ];
  const inclineSets: ExerciseSet[] = [
    { setNumber: 1, weightKg: 28, reps: 10 },
    { setNumber: 2, weightKg: 30, reps: 10 },
    { setNumber: 3, weightKg: 30, reps: 8 },
  ];
  const tricepSets: ExerciseSet[] = [
    { setNumber: 1, weightKg: 35, reps: 12 },
    { setNumber: 2, weightKg: 35, reps: 12 },
  ];
  exerciseLogs.push(
    {
      id: uid("exl"), userId: nikhilId, date: todayIso, exerciseName: "Bench Press", muscleGroup: "Chest",
      sets: benchSets, optionalMinutes: 18, source: "manual", addedLater: false,
      work: calculateStrengthWork(benchSets), usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1,
      createdAt: `${todayIso}T14:20:00.000Z`,
    },
    {
      id: uid("exl"), userId: nikhilId, date: todayIso, exerciseName: "Incline DB Press", muscleGroup: "Chest",
      sets: inclineSets, source: "manual", addedLater: false,
      work: calculateStrengthWork(inclineSets), usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1,
      createdAt: `${todayIso}T14:35:00.000Z`,
    },
    {
      id: uid("exl"), userId: nikhilId, date: todayIso, exerciseName: "Tricep Pushdown", muscleGroup: "Arms",
      sets: tricepSets, source: "manual", addedLater: false,
      work: calculateStrengthWork(tricepSets), usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1,
      createdAt: `${todayIso}T14:48:00.000Z`,
    }
  );

  // Seed friends' histories
  seedMemberHistory(rahulId, 160, 2, false);
  seedMemberHistory(aaravId, 140, 3, false);
  seedMemberHistory(kiranId, 60, 4, false);
  seedMemberHistory(devId, 90, 5, false);

  // Seed Maya Nair with ONLY 2 logs total => Calibrating everywhere & NOT ranked on leaderboard (FR-38)
  const m1 = addDaysIso(todayIso, -2);
  sessions.push(
    { id: uid("ses"), userId: mayaId, date: m1, muscleGroups: ["Legs"], isRest: false, createdAt: `${m1}T10:00:00.000Z` },
    { id: uid("ses"), userId: mayaId, date: todayIso, muscleGroups: ["Legs"], isRest: false, createdAt: `${todayIso}T10:00:00.000Z` }
  );
  exerciseLogs.push(
    {
      id: uid("exl"), userId: mayaId, date: m1, exerciseName: "Leg Press", muscleGroup: "Legs",
      sets: [{ setNumber: 1, weightKg: 60, reps: 12 }], source: "manual", addedLater: false,
      work: 720, usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${m1}T10:15:00.000Z`,
    },
    {
      id: uid("exl"), userId: mayaId, date: todayIso, exerciseName: "Leg Press", muscleGroup: "Legs",
      sets: [{ setNumber: 1, weightKg: 65, reps: 12 }], source: "manual", addedLater: false,
      work: 780, usualUsed: null, effortScore: null, status: "Calibrating", scoringSettingsVersion: 1, createdAt: `${todayIso}T10:15:00.000Z`,
    }
  );

  const defaultSettings = {
    version: 1,
    aiProvider: "gemini" as const,
    aiModel: "gemini-2.5-flash",
    aiRateLimitPerDay: 30,
    maxImageSizeMb: 5.0,
    aboveUsualSlope: 12.5,
    belowUsualRoot: 4,
    backfillWindowDays: 2,
    gridThresholds: { ...DEFAULT_GRID_THRESHOLDS },
    updatedAt: `${todayIso}T08:00:00.000Z`,
  };

  const state: DatabaseState = {
    currentUserId: nikhilId,
    profiles,
    weightLogs,
    muscleGroups: buildDefaultMuscleGroups(),
    exerciseLibrary: buildDefaultExercises(),
    hiddenExercises: [],
    sessions,
    exerciseLogs,
    cardioLogs,
    friendships: [
      { id: "fr_1", userId: nikhilId, friendId: rahulId, status: "accepted", createdAt: `${addDaysIso(todayIso, -80)}T12:00:00.000Z` },
      { id: "fr_2", userId: nikhilId, friendId: aaravId, status: "accepted", createdAt: `${addDaysIso(todayIso, -65)}T12:00:00.000Z` },
      { id: "fr_3", userId: nikhilId, friendId: mayaId, status: "accepted", createdAt: `${addDaysIso(todayIso, -2)}T12:00:00.000Z` },
      { id: "fr_4", userId: kiranId, friendId: nikhilId, status: "pending", createdAt: `${addDaysIso(todayIso, -1)}T15:00:00.000Z` },
    ],
    notificationSettings: profiles.map((p): NotificationSettings => ({
      userId: p.userId,
      dailyPromptEnabled: true,
      dailyPromptTime: "17:30",
      weeklyWeightEnabled: true,
      weeklyWeightTime: "09:00",
      friendRequestsEnabled: true,
      summariesEnabled: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      emailFallbackEnabled: true,
      pushSubscribed: false,
    })),
    adminEmails: [
      { email: "nikhil@honestreps.com", addedBy: "system", addedAt: `${startIso}T00:00:00.000Z` },
    ],
    appSettings: defaultSettings,
    auditLog: [
      {
        id: "aud_1",
        adminEmail: "nikhil@honestreps.com",
        action: "Initialized default exercise library & FR-71 effort settings",
        target: "app_settings (v1)",
        timestamp: `${addDaysIso(todayIso, -3)}T09:00:00.000Z`,
      },
    ],
    aiUsageLogs: [
      {
        id: "ai_1",
        userId: nikhilId,
        provider: "gemini",
        model: "gemini-2.5-flash",
        inputType: "image",
        success: true,
        estimatedCostUsd: 0.0004,
        timestamp: `${d1}T08:14:00.000Z`,
      },
      {
        id: "ai_2",
        userId: nikhilId,
        provider: "gemini",
        model: "gemini-2.5-flash",
        inputType: "text",
        success: true,
        estimatedCostUsd: 0.0001,
        timestamp: `${d2}T10:14:00.000Z`,
      },
      {
        id: "ai_3",
        userId: rahulId,
        provider: "gemini",
        model: "gemini-2.5-flash",
        inputType: "image",
        success: false,
        errorMessage: "Blurry watch photo — minutes unreadable (prompted user per FR-16)",
        estimatedCostUsd: 0.0004,
        timestamp: `${d3}T07:50:00.000Z`,
      },
    ],
    friendReports: [
      {
        id: "rep_1",
        reporterUsername: "aarav_iron",
        reportedUserId: devId,
        reportedUsername: "dev_iron",
        reason: "Unwanted repeated invite links",
        status: "open",
        createdAt: `${addDaysIso(todayIso, -2)}T16:40:00.000Z`,
      },
    ],
    announcements: [
      {
        id: "ann_1",
        title: "Honest Effort Engine v1 Live",
        body: "All exercises calibrate on logs 1–2 and score from log 3 onward against your personal usual.",
        sentBy: "nikhil@honestreps.com",
        sentAt: `${addDaysIso(todayIso, -5)}T10:00:00.000Z`,
      },
    ],
    notificationTemplates: [
      {
        id: "tpl_1",
        type: "daily_prompt",
        title: "What are you training today?",
        body: "Pick your focus or mark Rest. Reminders pause automatically on Rest days.",
      },
      {
        id: "tpl_2",
        type: "weekly_weight",
        title: "Weekly weight check",
        body: "Quick optional weigh-in to keep MET calorie estimates accurate.",
      },
      {
        id: "tpl_3",
        type: "friend_request",
        title: "New friend request",
        body: "Someone wants to compare honest effort scores with you.",
      },
      {
        id: "tpl_4",
        type: "month_summary",
        title: "Monthly effort summary",
        body: "Review your average active-day effort, active days, and streak.",
      },
    ],
    publicGyms: [],
  };

  // Run true FR-72/FR-71 scoring across all seeded logs chronologically
  for (const p of state.profiles) {
    recalculateUserScores(state, p.userId);
  }

  return state;
}

// FR-64, FR-72, FR-76: Recalculate scores for a user's exercise or cardio items chronologically.
// Respects:
// - First 2 logs stay Calibrating permanently (score = null)
// - 3rd log averages first 3; 4th+ averages all earlier logs
// - Cardio with HR compared ONLY with earlier cardio of same activity with HR; without HR only with without HR
// - Rest-day cardio stays Rest (never scored)
// - Admin scoring settings changes apply only to future logs when recalculateExisting=false;
//   on backfill (FR-76) we recalculate only affected exercise/activity chronologically!
export function recalculateUserScores(
  state: DatabaseState,
  userId: string,
  filterExerciseName?: string,
  filterCardioActivity?: string
) {
  recalculateEffortLogsForUser(
    state.exerciseLogs,
    state.cardioLogs,
    userId,
    state.appSettings,
    filterExerciseName,
    filterCardioActivity
  );
}

export function loadDatabase(): DatabaseState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seeded = createInitialSeed();
    saveDatabase(seeded);
    return seeded;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(raw) as DatabaseState;
  } catch {
    const seeded = createInitialSeed();
    saveDatabase(seeded);
    return seeded;
  }
}

export function saveDatabase(state: DatabaseState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmpFile, DB_FILE);
}

export function isUserAdmin(state: DatabaseState, email?: string | null): boolean {
  if (!email) return false;
  return state.adminEmails.some((a) => a.email.toLowerCase() === email.toLowerCase());
}

export function getActiveUser(state: DatabaseState, overrideEmail?: string | null): Profile | null {
  if (overrideEmail) {
    const existing = state.profiles.find(
      (p) => p.email.toLowerCase() === overrideEmail.toLowerCase()
    );
    if (existing) return existing;
  }
  if (!state.currentUserId) return null;
  return state.profiles.find((p) => p.userId === state.currentUserId) ?? null;
}

export function ensureGoogleUserInDb(
  state: DatabaseState,
  email: string,
  fullName?: string
): Profile {
  const existing = state.profiles.find(
    (p) => p.email.toLowerCase() === email.toLowerCase()
  );
  if (existing) {
    state.currentUserId = existing.userId;
    saveDatabase(state);
    return existing;
  }

  const todayIso = getTodayIso();
  const baseHandle = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 14);
  let username = `${baseHandle}_${Math.floor(10 + Math.random() * 89)}`;
  while (state.profiles.some((p) => p.username.toLowerCase() === username.toLowerCase())) {
    username = `${baseHandle}_${Math.floor(100 + Math.random() * 899)}`;
  }

  const newProfile: Profile = {
    userId: uid("user"),
    email,
    name: fullName?.trim() || email.split("@")[0],
    username,
    heightCm: 175,
    activeStatus: "Moderately active",
    weightUnit: "kg",
    heightUnit: "cm",
    shareWorkoutDetails: false,
    onboardingComplete: false, // Sends new Google user through Onboarding (FR-2, FR-65)
    suspended: false,
    firstLogDate: todayIso,
    createdAt: new Date().toISOString(),
  };

  state.profiles.push(newProfile);
  state.notificationSettings.push({
    userId: newProfile.userId,
    dailyPromptEnabled: true,
    dailyPromptTime: "17:30",
    weeklyWeightEnabled: true,
    weeklyWeightTime: "09:00",
    friendRequestsEnabled: true,
    summariesEnabled: true,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    emailFallbackEnabled: true,
    pushSubscribed: false,
  });
  state.currentUserId = newProfile.userId;
  saveDatabase(state);
  return newProfile;
}

export function getUser365DaySummaries(
  state: DatabaseState,
  userId: string,
  todayIso: string = getTodayIso()
): DaySummary[] {
  const profile = state.profiles.find((p) => p.userId === userId);
  const dates: string[] = [];
  for (let i = 364; i >= 0; i--) {
    dates.push(addDaysIso(todayIso, -i));
  }

  const map = computeUserDaySummaries({
    userId,
    firstLogDate: profile?.firstLogDate || todayIso,
    sessions: state.sessions.filter((s) => s.userId === userId),
    exerciseLogs: state.exerciseLogs.filter((e) => e.userId === userId),
    cardioLogs: state.cardioLogs.filter((c) => c.userId === userId),
    thresholds: state.appSettings.gridThresholds,
    dates,
    todayIso,
  });

  return dates.map((d) => map.get(d)!);
}

export function getUserMonthStats(summaries: DaySummary[], todayIso: string) {
  const monthPrefix = todayIso.slice(0, 7); // YYYY-MM
  const monthDays = summaries.filter((d) => d.date.startsWith(monthPrefix));
  const activeDays = monthDays.filter((d) => d.itemCount > 0 && !d.isRest);
  const restDays = monthDays.filter((d) => d.isRest);
  const scoredDays = activeDays.filter((d) => d.status === "Scored" && d.effortScore !== null);

  // FR-33: Month effort is average of its active days' efforts; a new month starts with no score
  const monthEffort =
    scoredDays.length > 0
      ? Math.round(
          scoredDays.reduce((acc, d) => acc + (d.effortScore ?? 0), 0) / scoredDays.length
        )
      : null;

  const isMonthCalibrating = activeDays.length > 0 && scoredDays.length === 0;
  const streaks = computeStreaksAndActiveDays(summaries, todayIso);

  return {
    monthPrefix,
    monthEffort,
    isMonthCalibrating,
    activeDaysThisMonth: activeDays.length,
    restDaysThisMonth: restDays.length,
    ...streaks,
  };
}

export function addAuditLog(
  state: DatabaseState,
  adminEmail: string,
  action: string,
  target: string
) {
  state.auditLog.unshift({
    id: uid("aud"),
    adminEmail,
    action,
    target,
    timestamp: new Date().toISOString(),
  });
}

export { uid };
