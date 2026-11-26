import {
  AppSettings,
  CardioLog,
  DailySession,
  DaySummary,
  EffortBand,
  ExerciseLibraryItem,
  ExerciseLog,
  ExerciseSet,
  GridThresholds,
  HeightUnit,
  LoggedItemSplit,
  PersonalRecordResult,
  WeightUnit,
} from "./types";

export const DEFAULT_GRID_THRESHOLDS: GridThresholds = {
  veryLowMax: 49,
  lowMax: 64,
  steadyMax: 74,
  highMax: 89,
};

// MET table for cardio intensity and calorie estimation (FR-20, FR-70)
const ACTIVITY_METS: Record<string, number> = {
  "indoor walk": 3.5,
  walk: 3.5,
  walking: 3.5,
  "incline walk": 5.5,
  treadmill: 7.0,
  run: 9.0,
  running: 9.0,
  "outdoor run": 9.2,
  "5k run": 9.5,
  jogging: 7.5,
  cycling: 7.5,
  bike: 7.0,
  "stationary bike": 6.8,
  rowing: 8.5,
  elliptical: 5.5,
  stairmaster: 8.8,
  swimming: 8.0,
  hiit: 9.5,
  "jump rope": 10.0,
  mobility: 2.5,
  stretching: 2.3,
};

export function getActivityMet(activityType: string, distanceKm?: number | null, minutes?: number): number {
  const key = activityType.trim().toLowerCase();
  let baseMet = 5.0;
  for (const [label, met] of Object.entries(ACTIVITY_METS)) {
    if (key.includes(label)) {
      baseMet = met;
      break;
    }
  }
  // Adjust MET subtly by pace when distance and minutes are both logged (FR-20, FR-70)
  if (distanceKm && distanceKm > 0 && minutes && minutes > 0) {
    const speedKmh = distanceKm / (minutes / 60);
    if (key.includes("walk")) {
      if (speedKmh >= 6.5) baseMet = Math.max(baseMet, 5.0);
      else if (speedKmh >= 5.0) baseMet = Math.max(baseMet, 4.0);
      else if (speedKmh < 3.5) baseMet = Math.min(baseMet, 2.8);
    } else if (key.includes("run") || key.includes("jog") || key.includes("treadmill")) {
      if (speedKmh >= 12) baseMet = 11.5;
      else if (speedKmh >= 10) baseMet = 9.8;
      else if (speedKmh >= 8) baseMet = 8.3;
      else baseMet = 6.8;
    } else if (key.includes("cycl") || key.includes("bike")) {
      if (speedKmh >= 24) baseMet = 10.0;
      else if (speedKmh >= 19) baseMet = 8.0;
      else baseMet = 6.0;
    }
  }
  return Number(baseMet.toFixed(2));
}

// FR-20: MET-based calorie estimation using user's weight, activity type, minutes, and pace
export function estimateCardioCalories(
  weightKg: number,
  activityType: string,
  minutes: number,
  distanceKm?: number | null
): number {
  const safeWeight = weightKg > 30 ? weightKg : 72;
  const met = getActivityMet(activityType, distanceKm, minutes);
  // Standard ACSM formula: kcal = MET * 3.5 * weight(kg) / 200 * minutes
  return Math.max(1, Math.round((met * 3.5 * safeWeight * minutes) / 200));
}

export type ExerciseLoadMode = "standard" | "bodyweight" | "assisted";

export function getExerciseLoadMode(exerciseName: string): ExerciseLoadMode {
  const lower = exerciseName.trim().toLowerCase();
  if (lower.includes("assisted")) return "assisted";
  if (
    lower.includes("push-up") ||
    lower.includes("pushup") ||
    lower.includes("push up") ||
    lower.includes("pull-up") ||
    lower.includes("pullup") ||
    lower.includes("pull up") ||
    lower.includes("chin-up") ||
    lower.includes("chinup") ||
    lower.includes("dip") ||
    lower.includes("leg raise") ||
    lower.includes("plank") ||
    lower.includes("crunch")
  ) {
    return "bodyweight";
  }
  return "standard";
}

// FR-70: Strength work = sum(effectiveLoad * reps) over that day's sets. Optional strength time is ignored.
// - Standard exercises: weightKg * reps
// - Bodyweight (e.g. Push-Ups, Pull-Ups): (bodyWeightKg * factor + optionalAddedWeightKg) * reps
// - Assisted (e.g. Assisted Pull-Ups): max(5, bodyWeightKg - assistedWeightKg) * reps
export function calculateStrengthWork(
  sets: ExerciseSet[],
  exerciseName = "",
  bodyWeightKg = 74
): number {
  const mode = getExerciseLoadMode(exerciseName);
  const lower = exerciseName.trim().toLowerCase();
  const safeBw = bodyWeightKg > 20 ? bodyWeightKg : 74;

  const sum = sets.reduce((acc, set) => {
    const w = Math.max(0, Number(set.weightKg) || 0);
    const r = Math.max(0, Number(set.reps) || 0);

    let effectiveLoad = w;
    if (mode === "assisted") {
      effectiveLoad = Math.max(5, safeBw - w);
    } else if (mode === "bodyweight") {
      const bwFactor = lower.includes("push") ? 0.65 : 1.0;
      effectiveLoad = safeBw * bwFactor + w;
    } else if (w === 0) {
      effectiveLoad = 1;
    }

    return acc + effectiveLoad * r;
  }, 0);
  return Number(sum.toFixed(2));
}

/**
 * Estimates 1 Repetition Maximum (1RM) using the standard Epley formula:
 * 1RM = Weight * (1 + Reps / 30)
 * When Reps <= 1, returns the exact weight.
 * For non-positive weight or reps, returns 0.
 * For assisted exercises (e.g. Assisted Pull-Ups):
 * Counterweight machine provides counter-assistance. As reps increase,
 * the assistance needed for a 1-rep max decreases.
 */
export function estimateOneRepMax(weightKg: number, reps: number, exerciseName = ""): number {
  const w = Math.max(0, Number(weightKg) || 0);
  const r = Math.max(0, Number(reps) || 0);
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return Math.round(w);

  const mode = getExerciseLoadMode(exerciseName);
  if (mode === "assisted") {
    // For assisted exercises: assistance needed for 1 rep decreases with reps performed
    return Math.max(1, Math.round(w / (1 + r / 30)));
  }

  return Math.round(w * (1 + r / 30));
}

/**
 * Checks an individual set against historical logs for the same exercise to see if it beats
 * previous records (max weight, estimated 1RM, or single-set volume).
 * For assisted exercises (e.g. Assisted Pull-Ups), lower assistance weight is superior.
 */
export function detectSetPersonalRecord(
  exerciseName: string,
  set: { weightKg: number; reps: number },
  history: ExerciseLog[] = []
): {
  isWeightPr: boolean;
  isOneRepMaxPr: boolean;
  isVolumePr: boolean;
  estimated1RM: number;
} {
  const w = Math.max(0, Number(set.weightKg) || 0);
  const r = Math.max(0, Number(set.reps) || 0);
  const mode = getExerciseLoadMode(exerciseName);
  const isAssisted = mode === "assisted";
  const estimated1RM = estimateOneRepMax(w, r, exerciseName);
  const setVolume = w * r;

  const key = exerciseName.trim().toLowerCase();
  const matchingLogs = history.filter((h) => h.exerciseName.trim().toLowerCase() === key);
  const priorSets = matchingLogs.flatMap((h) => h.sets || []);
  const hasPriorHistory = priorSets.length > 0;

  if (!hasPriorHistory || (w === 0 && r === 0)) {
    return {
      isWeightPr: false,
      isOneRepMaxPr: false,
      isVolumePr: false,
      estimated1RM,
    };
  }

  if (isAssisted) {
    const priorPositiveWeights = priorSets.map((s) => Number(s.weightKg) || 0).filter((val) => val > 0);
    const historicalBestWeight = priorPositiveWeights.length > 0 ? Math.min(...priorPositiveWeights) : Infinity;
    const prior1RMs = priorSets
      .map((s) => estimateOneRepMax(Number(s.weightKg) || 0, Number(s.reps) || 0, exerciseName))
      .filter((val) => val > 0);
    const historicalBest1RM = prior1RMs.length > 0 ? Math.min(...prior1RMs) : Infinity;
    const historicalMaxVolume = priorSets.reduce(
      (max, s) => Math.max(max, (Number(s.weightKg) || 0) * (Number(s.reps) || 0)),
      0
    );

    return {
      isWeightPr: w > 0 && w < historicalBestWeight,
      isOneRepMaxPr: estimated1RM > 0 && estimated1RM < historicalBest1RM,
      isVolumePr: setVolume > historicalMaxVolume,
      estimated1RM,
    };
  }

  const historicalMaxWeight = priorSets.reduce((max, s) => Math.max(max, Number(s.weightKg) || 0), 0);
  const historicalMax1RM = priorSets.reduce(
    (max, s) => Math.max(max, estimateOneRepMax(Number(s.weightKg) || 0, Number(s.reps) || 0, exerciseName)),
    0
  );
  const historicalMaxVolume = priorSets.reduce(
    (max, s) => Math.max(max, (Number(s.weightKg) || 0) * (Number(s.reps) || 0)),
    0
  );

  return {
    isWeightPr: w > historicalMaxWeight,
    isOneRepMaxPr: estimated1RM > historicalMax1RM,
    isVolumePr: setVolume > historicalMaxVolume,
    estimated1RM,
  };
}

/**
 * Scans a workout's sets against previous logs for this exercise and determines all-time personal records.
 * For assisted exercises, lower assistance is recognized as the personal record.
 */
export function detectPersonalRecords(
  exerciseName: string,
  sets: Array<{ weightKg: number; reps: number }>,
  history: ExerciseLog[] = []
): PersonalRecordResult {
  const key = exerciseName.trim().toLowerCase();
  const matchingLogs = history.filter((h) => h.exerciseName.trim().toLowerCase() === key);
  const priorSets = matchingLogs.flatMap((h) => h.sets || []);
  const hasPriorHistory = priorSets.length > 0;
  const isAssisted = getExerciseLoadMode(exerciseName) === "assisted";

  if (isAssisted) {
    const priorPositiveWeights = priorSets.map((s) => Number(s.weightKg) || 0).filter((w) => w > 0);
    const historicalBestWeight = priorPositiveWeights.length > 0 ? Math.min(...priorPositiveWeights) : Infinity;
    const prior1RMs = priorSets
      .map((s) => estimateOneRepMax(Number(s.weightKg) || 0, Number(s.reps) || 0, exerciseName))
      .filter((r) => r > 0);
    const historicalBest1RM = prior1RMs.length > 0 ? Math.min(...prior1RMs) : Infinity;
    const historicalMaxVolume = priorSets.reduce(
      (max, s) => Math.max(max, (Number(s.weightKg) || 0) * (Number(s.reps) || 0)),
      0
    );

    const currentPositiveWeights = sets.map((s) => Number(s.weightKg) || 0).filter((w) => w > 0);
    const currentBestWeight = currentPositiveWeights.length > 0 ? Math.min(...currentPositiveWeights) : 0;
    const current1RMs = sets
      .map((s) => estimateOneRepMax(Number(s.weightKg) || 0, Number(s.reps) || 0, exerciseName))
      .filter((r) => r > 0);
    const currentBest1RM = current1RMs.length > 0 ? Math.min(...current1RMs) : 0;
    const currentMaxVolume = sets.reduce(
      (max, s) => Math.max(max, (Number(s.weightKg) || 0) * (Number(s.reps) || 0)),
      0
    );

    const isWeightPr = hasPriorHistory && currentBestWeight > 0 && currentBestWeight < historicalBestWeight;
    const isOneRepMaxPr = hasPriorHistory && currentBest1RM > 0 && currentBest1RM < historicalBest1RM;
    const isVolumePr = hasPriorHistory && currentMaxVolume > historicalMaxVolume;

    const allPositiveWeights = [...priorPositiveWeights, ...currentPositiveWeights];
    const bestWeight = allPositiveWeights.length > 0 ? Math.min(...allPositiveWeights) : 0;
    const all1RMs = [...prior1RMs, ...current1RMs];
    const bestOneRepMax = all1RMs.length > 0 ? Math.min(...all1RMs) : 0;
    const bestVolume = Math.max(historicalMaxVolume, currentMaxVolume);

    return {
      isWeightPr,
      isOneRepMaxPr,
      isVolumePr,
      bestWeight,
      bestOneRepMax,
      bestVolume,
    };
  }

  const historicalMaxWeight = priorSets.reduce((max, s) => Math.max(max, Number(s.weightKg) || 0), 0);
  const historicalMax1RM = priorSets.reduce(
    (max, s) => Math.max(max, estimateOneRepMax(Number(s.weightKg) || 0, Number(s.reps) || 0, exerciseName)),
    0
  );
  const historicalMaxVolume = priorSets.reduce(
    (max, s) => Math.max(max, (Number(s.weightKg) || 0) * (Number(s.reps) || 0)),
    0
  );

  const currentMaxWeight = sets.reduce((max, s) => Math.max(max, Number(s.weightKg) || 0), 0);
  const currentMax1RM = sets.reduce(
    (max, s) => Math.max(max, estimateOneRepMax(Number(s.weightKg) || 0, Number(s.reps) || 0, exerciseName)),
    0
  );
  const currentMaxVolume = sets.reduce(
    (max, s) => Math.max(max, (Number(s.weightKg) || 0) * (Number(s.reps) || 0)),
    0
  );

  const isWeightPr = hasPriorHistory && currentMaxWeight > historicalMaxWeight;
  const isOneRepMaxPr = hasPriorHistory && currentMax1RM > historicalMax1RM;
  const isVolumePr = hasPriorHistory && currentMaxVolume > historicalMaxVolume;

  const bestWeight = Math.max(historicalMaxWeight, currentMaxWeight);
  const bestOneRepMax = Math.max(historicalMax1RM, currentMax1RM);
  const bestVolume = Math.max(historicalMaxVolume, currentMaxVolume);

  return {
    isWeightPr,
    isOneRepMaxPr,
    isVolumePr,
    bestWeight,
    bestOneRepMax,
    bestVolume,
  };
}

// FR-70: Cardio work = minutes weighted by intensity (avg HR when logged, otherwise MET/pace)
// Typed calories NEVER raise the effort score.
export function calculateCardioWork(
  activityType: string,
  minutes: number,
  avgHeartRate?: number | null,
  distanceKm?: number | null
): number {
  const mins = Math.max(0, Number(minutes) || 0);
  if (mins === 0) return 0;
  if (avgHeartRate && avgHeartRate > 40) {
    // Heart-rate intensity multiplier scaled smoothly around resting-to-peak zone
    const hrIntensity = Number((avgHeartRate / 100).toFixed(4));
    return Number((mins * hrIntensity).toFixed(2));
  }
  const met = getActivityMet(activityType, distanceKm, mins);
  return Number((mins * met).toFixed(2));
}

// FR-71: Honest Relative Effort score (0-100, 50 = usual)
// At or above usual: 50 + slope * (r - 1), capped at 100 (default slope = 12.5 => 5x = 100)
// Below usual: 50 * r^(1/root) (default root = 4)
// FR-30: Low scores stay low; never inflated or artificially rounded up.
export function computeEffortScoreFromRatio(
  todayWork: number,
  usualWork: number,
  settings?: Pick<AppSettings, "aboveUsualSlope" | "belowUsualRoot">
): number {
  if (todayWork <= 0 || usualWork <= 0) return 0;
  const slope = settings?.aboveUsualSlope ?? 12.5;
  const root = settings?.belowUsualRoot ?? 4;
  const r = todayWork / usualWork;

  let raw: number;
  if (r >= 1) {
    raw = 50 + slope * (r - 1);
  } else {
    raw = 50 * Math.pow(r, 1 / root);
  }

  return Math.max(0, Math.min(100, Math.round(raw)));
}

// FR-72 & FR-62–FR-64:
// - Fewer than 3 logs => Calibrating (score = null). First 2 logs stay Calibrating permanently.
// - 3rd log: usual = average of the first three logs (including the 3rd).
// - 4th log onward: usual = average of all earlier logs.
export function scoreItemAgainstHistory(
  priorWorks: number[],
  currentWork: number,
  settings?: Pick<AppSettings, "aboveUsualSlope" | "belowUsualRoot">
): { status: "Calibrating" | "Scored"; score: number | null; usualUsed: number | null } {
  const logIndex = priorWorks.length + 1; // 1-based
  if (logIndex < 3) {
    return { status: "Calibrating", score: null, usualUsed: null };
  }

  let usual: number;
  if (logIndex === 3) {
    usual = (priorWorks[0] + priorWorks[1] + currentWork) / 3;
  } else {
    usual = priorWorks.reduce((a, b) => a + b, 0) / priorWorks.length;
  }

  const score = computeEffortScoreFromRatio(currentWork, usual, settings);
  return {
    status: "Scored",
    score,
    usualUsed: Number(usual.toFixed(2)),
  };
}

// FR-58: Map score / status to one of the 8 distinct Year Grid looks
export function getEffortBand(
  score: number | null,
  status: "Calibrating" | "Scored" | "Rest" | "No log",
  thresholds: GridThresholds = DEFAULT_GRID_THRESHOLDS
): EffortBand {
  if (status === "Rest") return "Rest";
  if (status === "No log") return "No log";
  if (score === null) return status === "Calibrating" ? "Calibrating" : "No log";
  if (score <= thresholds.veryLowMax) return "Very low";
  if (score <= thresholds.lowMax) return "Low";
  if (score <= thresholds.steadyMax) return "Steady";
  if (score <= thresholds.highMax) return "High";
  return "Very high";
}

// Date helpers (local ISO YYYY-MM-DD without timezone drift)
export function normalizeCardioActivityKey(activityType: string): string {
  const lower = activityType.trim().toLowerCase();
  if (lower === "indoor walking" || lower.includes("indoor walk")) {
    return "indoor walk";
  }
  return lower || "cardio";
}

/** Formats an ISO timestamp into local clock time (e.g. "10:24 AM") for UI display. */
export function formatLogTime(isoTimestamp?: string | null): string | null {
  if (!isoTimestamp) return null;
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Formats rest duration in seconds concisely (e.g. 45 -> "45s", 90 -> "1m 30s", 120 -> "2m"). */
export function formatRestDuration(seconds?: number | null): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s === 0) return "0s";
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (mins === 0) return `${rem}s`;
  if (rem === 0) return `${mins}m`;
  return `${mins}m ${rem}s`;
}

/**
 * Recomputes personal strength and cardio effort scores chronologically for a user.
 * Strength is scored per exercise session; cardio is consolidated per day (activity + HR mode)
 * so multiple splits/sets in one day combine into a single daily score and count as one day in history.
 */
export function recalculateEffortLogsForUser(
  exerciseLogs: ExerciseLog[],
  cardioLogs: CardioLog[],
  userId: string,
  settings: Pick<AppSettings, "aboveUsualSlope" | "belowUsualRoot">,
  filterExerciseName?: string,
  filterCardioActivity?: string
): void {
  const normalizedFilterEx = filterExerciseName?.trim().toLowerCase();
  const userEx = exerciseLogs
    .filter(
      (e) =>
        e.userId === userId &&
        (!normalizedFilterEx || e.exerciseName.trim().toLowerCase() === normalizedFilterEx)
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const exPriorByKey = new Map<string, number[]>();
  for (const log of userEx) {
    const key = log.exerciseName.trim().toLowerCase();
    const prior = exPriorByKey.get(key) ?? [];
    const res = scoreItemAgainstHistory(prior, log.work, settings);
    log.status = res.status;
    log.effortScore = res.score;
    log.usualUsed = res.usualUsed;
    prior.push(log.work);
    exPriorByKey.set(key, prior);
  }

  const normalizedFilterCardio = filterCardioActivity
    ? normalizeCardioActivityKey(filterCardioActivity)
    : null;
  const userCardio = cardioLogs
    .filter(
      (c) =>
        c.userId === userId &&
        (!normalizedFilterCardio ||
          normalizeCardioActivityKey(c.activityType) === normalizedFilterCardio)
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const dailyGroups = new Map<
    string,
    { baselineKey: string; totalWork: number; logs: CardioLog[] }
  >();

  for (const log of userCardio) {
    if (log.isRestActivity) {
      log.status = "Rest";
      log.effortScore = null;
      log.usualUsed = null;
      continue;
    }
    const hasHr = Boolean(log.avgHeartRate && log.avgHeartRate > 40);
    const baselineKey = `${normalizeCardioActivityKey(log.activityType)}__${hasHr ? "hr" : "nohr"}`;
    const dayGroupKey = `${log.date}__${baselineKey}`;
    const existing = dailyGroups.get(dayGroupKey);
    if (existing) {
      existing.totalWork = Number((existing.totalWork + log.work).toFixed(2));
      existing.logs.push(log);
    } else {
      dailyGroups.set(dayGroupKey, {
        baselineKey,
        totalWork: Number(log.work.toFixed(2)),
        logs: [log],
      });
    }
  }

  const cardioPriorByKey = new Map<string, number[]>();
  for (const group of dailyGroups.values()) {
    const prior = cardioPriorByKey.get(group.baselineKey) ?? [];
    const res = scoreItemAgainstHistory(prior, group.totalWork, settings);
    for (const log of group.logs) {
      log.status = res.status;
      log.effortScore = res.score;
      log.usualUsed = res.usualUsed;
    }
    prior.push(group.totalWork);
    cardioPriorByKey.set(group.baselineKey, prior);
  }
}

export function formatLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return formatLocalIsoDate(dt);
}

export function daysBetweenIso(startIso: string, endIso: string): number {
  const [y1, m1, d1] = startIso.split("-").map(Number);
  const [y2, m2, d2] = endIso.split("-").map(Number);
  const t1 = new Date(y1, m1 - 1, d1).getTime();
  const t2 = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((t2 - t1) / 86400000);
}

export function getDayLetter(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const letters = ["S", "M", "T", "W", "T", "F", "S"];
  return letters[new Date(y, m - 1, d).getDay()];
}

export function formatShortMonthDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}`;
}

export function formatFullDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[dt.getDay()]}, ${months[m - 1]} ${d}, ${y}`;
}

export function normalizeSessionKey(groups: string[]): string {
  if (!groups || groups.length === 0) return "general";
  return [...groups]
    .map((g) => g.trim().toLowerCase())
    .sort()
    .join("+");
}

/**
 * Day-1 Provisional Daily Effort (0-100) using a unified additive scale:
 * Strength-only, Cardio-only, and Hybrid (Strength + Cardio) workouts share
 * an equal 0-100 effort scale. Adding Cardio or RIR never shrinks a denominator
 * or lowers a lifter's points relative to skipping cardio.
 */
export function computeProvisionalDailyEffort(
  dayExercises: ExerciseLog[],
  dayCardio: CardioLog[]
): number {
  return computeProvisionalEffortBreakdown(dayExercises, dayCardio).score;
}

export function computeProvisionalEffortBreakdown(
  dayExercises: ExerciseLog[],
  dayCardio: CardioLog[]
): {
  score: number;
  formulaNote: string;
  items: Array<{ label: string; points: string; detail: string }>;
} {
  const activeCardio = dayCardio.filter((c) => !c.isRestActivity);
  const cardioForScore = activeCardio.length > 0 ? activeCardio : dayCardio;
  const hasStrength = dayExercises.length > 0;
  const hasCardio = cardioForScore.length > 0;

  if (!hasStrength && !hasCardio) {
    return { score: 0, formulaNote: "No activities logged", items: [] };
  }

  const items: Array<{ label: string; points: string; detail: string }> = [];
  const totalSets = dayExercises.reduce((sum, e) => sum + e.sets.length, 0);
  const totalCardioMin = cardioForScore.reduce((sum, c) => sum + c.minutes, 0);

  // Intensity-weighted cardio minutes (HR > 40 or pace/MET relative to brisk walking)
  const effectiveCardioMin = cardioForScore.reduce((sum, c) => {
    const factor =
      c.avgHeartRate && c.avgHeartRate > 40
        ? Math.max(0.85, Math.min(1.5, c.avgHeartRate / 120))
        : Math.max(
            0.85,
            Math.min(1.5, getActivityMet(c.activityType, c.distanceKm, c.minutes) / 4.0)
          );
    return sum + c.minutes * factor;
  }, 0);

  // Pure Cardio baseline on an equal 0-100 scale
  const cardioAloneScore = hasCardio
    ? Math.min(
        100,
        Math.max(
          25,
          Math.round(
            32 +
              Math.min(35, effectiveCardioMin) * 1.35 +
              Math.max(0, effectiveCardioMin - 35) * 0.6
          )
        )
      )
    : 0;

  if (!hasStrength) {
    items.push({
      label: "Cardio effort",
      points: `${cardioAloneScore} / 100`,
      detail: `${totalCardioMin} min total across ${cardioForScore.length} ${
        cardioForScore.length === 1 ? "entry" : "entries"
      }`,
    });
    return {
      score: cardioAloneScore,
      formulaNote: `Cardio effort (${totalCardioMin} min intensity-weighted) = ${cardioAloneScore} / 100`,
      items,
    };
  }

  // Strength components sum cleanly out of 100 (no denominator shrink bias)
  const strengthVolPts = Math.min(
    64,
    Math.round(27 + Math.min(12, totalSets) * 2.5 + Math.max(0, totalSets - 12) * 1.0)
  );
  items.push({
    label: "Strength volume",
    points: `${strengthVolPts} / 64`,
    detail: `${totalSets} ${totalSets === 1 ? "set" : "sets"} across ${dayExercises.length} ${
      dayExercises.length === 1 ? "exercise" : "exercises"
    }`,
  });

  const coveragePts =
    dayExercises.length >= 4
      ? 18
      : dayExercises.length === 3
      ? 15
      : dayExercises.length === 2
      ? 13
      : 10;
  items.push({
    label: "Exercise variety",
    points: `${coveragePts} / 18`,
    detail: `${dayExercises.length} ${dayExercises.length === 1 ? "exercise" : "exercises"} logged`,
  });

  const completionPts =
    totalSets >= 12 ? 18 : totalSets >= 6 ? 14 : totalSets >= 3 ? 11 : 8;
  items.push({
    label: "Session completion",
    points: `${completionPts} / 18`,
    detail:
      totalSets >= 12
        ? "High-volume session"
        : totalSets >= 6
        ? "Solid working session"
        : "Starter / focused session",
  });

  // Optional RIR gives a small positive intensity boost without penalizing anyone who leaves it blank or trains submaximally
  let rirBonus = 0;
  const rirLogs = dayExercises.filter((e) => typeof e.rir === "number");
  if (rirLogs.length > 0) {
    const avgRir = rirLogs.reduce((sum, e) => sum + (e.rir ?? 2), 0) / rirLogs.length;
    rirBonus = avgRir <= 0.5 ? 5 : avgRir <= 1.5 ? 4 : avgRir <= 2.5 ? 2 : 0;
    items.push({
      label: "Intensity (RIR)",
      points: rirBonus > 0 ? `+${rirBonus}` : "+0",
      detail: `Avg RIR ${avgRir.toFixed(1)} · non-penalizing`,
    });
  }

  const strengthBase = Math.min(100, strengthVolPts + coveragePts + completionPts + rirBonus);

  let cardioBonus = 0;
  if (hasCardio) {
    cardioBonus = Math.min(24, Math.max(4, Math.round(effectiveCardioMin * 0.55 + 3)));
    items.push({
      label: "Cardio add-on",
      points: `+${cardioBonus}`,
      detail: `${totalCardioMin} min added on top of strength`,
    });
  }

  const score = Math.max(
    15,
    Math.min(100, hasCardio ? Math.max(cardioAloneScore, strengthBase + cardioBonus) : strengthBase)
  );

  return {
    score,
    formulaNote: hasCardio
      ? `${strengthBase} strength + ${cardioBonus} cardio = ${score} / 100`
      : `Strength effort across ${totalSets} sets (${dayExercises.length} exercises) = ${score} / 100`,
    items,
  };
}

// FR-73: Compute Day Effort for every logged date of a user
// Compares day against user's past active days of the SAME muscle groups in their Session.
// A day shows "Calibrating" when it has only Calibrating items, or until >= 3 active days of same session kind,
// or within first 14 days of user's first log (UI/UX spec Section 4).
export function computeUserDaySummaries(params: {
  userId: string;
  firstLogDate: string;
  sessions: DailySession[];
  exerciseLogs: ExerciseLog[];
  cardioLogs: CardioLog[];
  thresholds: GridThresholds;
  dates?: string[];
  todayIso?: string;
}): Map<string, DaySummary> {
  const {
    firstLogDate,
    sessions,
    exerciseLogs,
    cardioLogs,
    thresholds,
    dates = [],
    todayIso = new Date().toISOString().slice(0, 10),
  } = params;

  const sessionByDate = new Map<string, DailySession>();
  for (const s of sessions) sessionByDate.set(s.date, s);

  const exByDate = new Map<string, ExerciseLog[]>();
  for (const e of exerciseLogs) {
    const arr = exByDate.get(e.date) ?? [];
    arr.push(e);
    exByDate.set(e.date, arr);
  }

  const cardioByDate = new Map<string, CardioLog[]>();
  for (const c of cardioLogs) {
    const arr = cardioByDate.get(c.date) ?? [];
    arr.push(c);
    cardioByDate.set(c.date, arr);
  }

  // Collect all active dates chronologically to track per-session-kind historical item counts (FR-73)
  const allLoggedDates = new Set<string>([
    ...exByDate.keys(),
    ...cardioByDate.keys(),
    ...sessionByDate.keys(),
    ...dates,
  ]);
  const sortedDates = [...allLoggedDates].sort();

  const pastItemCountsByKind = new Map<string, number[]>();
  const pastStrengthCountsByKind = new Map<string, number[]>();
  const summaryMap = new Map<string, DaySummary>();

  for (const date of sortedDates) {
    const session = sessionByDate.get(date);
    const dayEx = exByDate.get(date) ?? [];
    const dayCardio = cardioByDate.get(date) ?? [];

    const inferredGroups =
      session && session.muscleGroups.length > 0
        ? session.muscleGroups
        : Array.from(
            new Set([
              ...dayEx.map((e) => e.muscleGroup),
              ...(dayCardio.length > 0 ? ["Cardio"] : []),
            ])
          );

    const mappedEx = dayEx.map((e) => ({
      id: e.id,
      kind: "strength" as const,
      title: e.exerciseName,
      detail: `${e.sets.length} ${e.sets.length === 1 ? "set" : "sets"} · ${e.sets
        .map((s) => `${s.weightKg}kg × ${s.reps}`)
        .join(", ")}`,
      effortScore: e.effortScore,
      status: e.status,
      addedLater: e.addedLater,
      createdAt: e.createdAt,
    }));

    // Consolidate same-day repeated cardio logs (e.g. multiple Indoor Walk splits/sets)
    // so each day displays ONE cardio row with ONE daily effort score (never per-split scores).
    const cardioGroups = new Map<string, CardioLog[]>();
    for (const c of dayCardio) {
      const groupKey = `${c.isRestActivity ? "rest" : "active"}__${normalizeCardioActivityKey(
        c.activityType
      )}`;
      const list = cardioGroups.get(groupKey) ?? [];
      list.push(c);
      cardioGroups.set(groupKey, list);
    }

    const mappedCardio: DaySummary["loggedItems"] = [];

    for (const groupLogs of cardioGroups.values()) {
      const sorted = [...groupLogs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (sorted.length > 1) {
        const splits: LoggedItemSplit[] = sorted.map((c, idx) => ({
          id: c.id,
          splitNumber: idx + 1,
          minutes: c.minutes,
          distanceKm: c.distanceKm,
          kcal: c.kcal,
          effortScore: null,
          addedLater: c.addedLater,
          createdAt: c.createdAt,
        }));

        const totalMins = splits.reduce((acc, s) => acc + s.minutes, 0);
        const totalKcal = splits.reduce((acc, s) => acc + s.kcal, 0);
        const totalDist = splits.reduce((acc, s) => acc + (s.distanceKm || 0), 0);
        const hrEntries = sorted.filter((c) => c.avgHeartRate && c.avgHeartRate > 40);
        const hrMinSum = hrEntries.reduce((acc, c) => acc + c.minutes, 0);
        const weightedHr =
          hrMinSum > 0
            ? Math.round(
                hrEntries.reduce((acc, c) => acc + (c.avgHeartRate || 0) * c.minutes, 0) /
                  hrMinSum
              )
            : null;
        const activeLogs = sorted.filter((c) => !c.isRestActivity);
        const allRest = activeLogs.length === 0;
        const scoredLogs = activeLogs.filter(
          (c) => c.status === "Scored" && typeof c.effortScore === "number"
        );
        const allScored = activeLogs.length > 0 && scoredLogs.length === activeLogs.length;
        const dailyCardioScore = allScored ? scoredLogs[0].effortScore : null;
        const displayTitle =
          normalizeCardioActivityKey(sorted[0].activityType) === "indoor walk"
            ? "Indoor Walk"
            : sorted[0].activityType;

        mappedCardio.push({
          id: `splits_${sorted[0].id}`,
          kind: "cardio",
          title: `${displayTitle} (${splits.length} Splits · ${totalMins}m)`,
          detail: [
            `${totalMins} min`,
            totalDist > 0 ? `${Number(totalDist.toFixed(2))} km` : null,
            weightedHr ? `${weightedHr} bpm` : null,
            `${totalKcal} kcal`,
            `${splits.length} splits`,
          ]
            .filter(Boolean)
            .join(" · "),
          effortScore: dailyCardioScore,
          status: allRest ? "Rest" : allScored ? "Scored" : "Calibrating",
          addedLater: sorted.some((c) => c.addedLater),
          kcalIsEstimated: sorted.some((c) => c.kcalIsEstimated),
          createdAt: sorted[sorted.length - 1].createdAt,
          splits,
        });
      } else {
        const c = sorted[0];
        mappedCardio.push({
          id: c.id,
          kind: "cardio",
          title: c.activityType,
          detail: [
            `${c.minutes} min`,
            c.distanceKm ? `${c.distanceKm} km` : null,
            c.avgHeartRate ? `${c.avgHeartRate} bpm` : null,
            `${c.kcal} kcal`,
          ]
            .filter(Boolean)
            .join(" · "),
          effortScore: c.effortScore,
          status: c.status,
          addedLater: c.addedLater,
          kcalIsEstimated: c.kcalIsEstimated,
          createdAt: c.createdAt,
        });
      }
    }

    const loggedItems: DaySummary["loggedItems"] = [...mappedEx, ...mappedCardio];
    const totalItems = loggedItems.length;

    const shortLabel =
      date === todayIso
        ? "Today"
        : date === addDaysIso(todayIso, -1)
        ? "Yesterday"
        : formatShortMonthDay(date);

    // FR-32 / FR-77: Rest day (light activity allowed and labeled Rest, never judged against workout days)
    if (session?.isRest) {
      summaryMap.set(date, {
        date,
        dayLetter: getDayLetter(date),
        shortLabel,
        sessionGroups: ["Rest"],
        isRest: true,
        status: "Rest",
        effortScore: null,
        band: "Rest",
        itemCount: totalItems,
        loggedItems,
      });
      continue;
    }

    // FR-31: No log day — neutral style, never low-effort color
    if (totalItems === 0) {
      summaryMap.set(date, {
        date,
        dayLetter: getDayLetter(date),
        shortLabel,
        sessionGroups: inferredGroups,
        isRest: false,
        status: "No log",
        effortScore: null,
        band: "No log",
        itemCount: 0,
        loggedItems: [],
      });
      continue;
    }

    const strengthGroups = inferredGroups.filter((g) => g.toLowerCase() !== "cardio");
    const kindKey = normalizeSessionKey(
      strengthGroups.length > 0 ? strengthGroups : inferredGroups
    );
    const priorCounts = pastItemCountsByKind.get(kindKey) ?? [];
    const priorStrengthCounts = pastStrengthCountsByKind.get(kindKey) ?? [];

    const scoredItems = loggedItems.filter((item) => item.status === "Scored" && item.effortScore !== null);
    const calibratingCount = loggedItems.filter((item) => item.status === "Calibrating").length;
    const calibratingStrengthCount = mappedEx.filter((item) => item.status === "Calibrating").length;

    const daysSinceFirst = firstLogDate ? daysBetweenIso(firstLogDate, date) : 999;

    // FR-73: A day shows "Calibrating" when it has only Calibrating items,
    // or until the user has at least 3 active days with the same muscle groups (including today => priorCounts.length >= 2),
    // or within 14 days of first log when fewer than 3 scored days exist.
    const hasEnoughSessionHistory = priorCounts.length >= 2;
    const isWithinInitialCalibration = daysSinceFirst < 14 && scoredItems.length === 0;

    let dayStatus: "Calibrating" | "Scored" = "Calibrating";
    let dayScore: number | null = null;
    let effortBreakdown: DaySummary["effortBreakdown"] = undefined;

    if (scoredItems.length > 0 && hasEnoughSessionHistory && !isWithinInitialCalibration) {
      const countsForAverage =
        priorCounts.length === 2 ? [...priorCounts, totalItems] : priorCounts;
      const usualItemCount =
        countsForAverage.reduce((a, b) => a + b, 0) / countsForAverage.length;

      // FR-73: Calibrating items lower that average by the same count,
      // so a new exercise neither lifts nor drags the day.
      const effectiveDenominator = Math.max(1, usualItemCount - calibratingCount);
      const scoreSum = scoredItems.reduce((sum, item) => sum + (item.effortScore ?? 0), 0);
      const combinedScore = Math.round(scoreSum / effectiveDenominator);

      // Equality guard: adding light warm-up/cool-down cardio must not pull a lifting day below its own strength score
      // (using prior strength-only baseline count so days with newly added cardio never inflate strength denominator)
      const scoredStrength = scoredItems.filter((item) => item.kind === "strength");
      const scoredCardio = scoredItems.filter((item) => item.kind === "cardio");
      let adjustedScore = combinedScore;
      if (scoredStrength.length > 0 && scoredCardio.length > 0) {
        const strengthCountsForAvg =
          priorStrengthCounts.length === 2
            ? [...priorStrengthCounts, mappedEx.length]
            : priorStrengthCounts.length > 0
            ? priorStrengthCounts
            : [mappedEx.length];
        const usualStrengthCount =
          strengthCountsForAvg.reduce((a, b) => a + b, 0) / strengthCountsForAvg.length;
        const strengthOnlyDenom = Math.max(1, usualStrengthCount - calibratingStrengthCount);
        const strengthOnlyScore = Math.round(
          scoredStrength.reduce((sum, item) => sum + (item.effortScore ?? 0), 0) /
            strengthOnlyDenom
        );
        adjustedScore = Math.max(strengthOnlyScore, combinedScore);
      }

      dayScore = Math.max(0, Math.min(100, adjustedScore));
      dayStatus = "Scored";
      effortBreakdown = {
        mode: "calibrated",
        formulaNote: `Compared against your own history (50 = usual · ${Number(
          effectiveDenominator.toFixed(1)
        )} usual items)`,
        items: loggedItems.map((item) => ({
          label: item.title,
          points:
            item.status === "Scored" && item.effortScore !== null
              ? `${item.effortScore} / 100`
              : "Calibrating",
          detail: item.detail,
        })),
      };
    } else {
      // Day-1 provisional effort score so Effort works from day one until personal calibration completes
      const prov = computeProvisionalEffortBreakdown(dayEx, dayCardio);
      dayScore = prov.score;
      dayStatus = "Calibrating";
      effortBreakdown = {
        mode: "provisional",
        formulaNote: prov.formulaNote,
        items: prov.items,
      };
    }

    // Record this active day in session-kind history for subsequent days
    pastItemCountsByKind.set(kindKey, [...priorCounts, totalItems]);
    pastStrengthCountsByKind.set(kindKey, [...priorStrengthCounts, mappedEx.length]);

    summaryMap.set(date, {
      date,
      dayLetter: getDayLetter(date),
      shortLabel,
      sessionGroups: inferredGroups.length > 0 ? inferredGroups : ["Workout"],
      isRest: false,
      status: dayStatus,
      effortScore: dayScore,
      band: getEffortBand(dayScore, dayStatus, thresholds),
      itemCount: totalItems,
      loggedItems,
      effortBreakdown,
    });
  }

  return summaryMap;
}

export const REST_DAY_POLICY = {
  maxConsecutiveRestDays: 2,
  maxRestDaysPerWeek: 3,
} as const;

/**
 * Evaluates rest-day spacing chronologically across active/rest days:
 * up to 2 consecutive rest days and 3 rest days in any rolling 7-day window
 * receive full streak protection and adherence credit; extra clustered rest days
 * (e.g. taking all 8 monthly rest days in one week) are marked excess.
 */
export function analyzeRestDayDistribution(
  days: Array<{ date: string; isRest: boolean; itemCount?: number }>
): {
  protectedRestDates: Set<string>;
  excessRestDates: Set<string>;
  maxConsecutiveRest: number;
  maxRestIn7Days: number;
} {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const protectedRestDates = new Set<string>();
  const excessRestDates = new Set<string>();

  let currentConsec = 0;
  let prevRestDate: string | null = null;
  let maxConsecutiveRest = 0;
  let maxRestIn7Days = 0;
  const allRestWindow: string[] = [];
  const protectedWindow: string[] = [];

  for (const day of sorted) {
    const hasActivity = (day.itemCount ?? 0) > 0;
    if (hasActivity || !day.isRest) {
      currentConsec = 0;
      prevRestDate = null;
      continue;
    }

    const consec =
      prevRestDate && daysBetweenIso(prevRestDate, day.date) === 1
        ? currentConsec + 1
        : 1;
    currentConsec = consec;
    prevRestDate = day.date;

    while (allRestWindow.length > 0 && daysBetweenIso(allRestWindow[0], day.date) >= 7) {
      allRestWindow.shift();
    }
    allRestWindow.push(day.date);

    while (protectedWindow.length > 0 && daysBetweenIso(protectedWindow[0], day.date) >= 7) {
      protectedWindow.shift();
    }

    if (consec > maxConsecutiveRest) maxConsecutiveRest = consec;
    if (allRestWindow.length > maxRestIn7Days) maxRestIn7Days = allRestWindow.length;

    if (
      consec <= REST_DAY_POLICY.maxConsecutiveRestDays &&
      protectedWindow.length < REST_DAY_POLICY.maxRestDaysPerWeek
    ) {
      protectedRestDates.add(day.date);
      protectedWindow.push(day.date);
    } else {
      excessRestDates.add(day.date);
    }
  }

  return {
    protectedRestDates,
    excessRestDates,
    maxConsecutiveRest,
    maxRestIn7Days,
  };
}

// FR-60: Compute Active Days (past 365 days), Current Streak, and Longest Streak
// Up to 2 consecutive rest days and 3 rest days per 7-day window preserve streak without penalty;
// beyond those caps, rest days consume the 3-day unlogged grace window so clustering 8 rest days into one week breaks streaks.
export function computeStreaksAndActiveDays(
  orderedSummaries: DaySummary[],
  todayIso: string
): { activeDaysYear: number; currentStreak: number; longestStreak: number } {
  const activeDaysYear = orderedSummaries.filter((d) => d.itemCount > 0 && !d.isRest).length;
  const { protectedRestDates } = analyzeRestDayDistribution(orderedSummaries);

  let longestStreak = 0;
  let running = 0;
  let consecutiveMissed = 0;
  for (const day of orderedSummaries) {
    if (day.itemCount > 0) {
      running += 1;
      consecutiveMissed = 0;
      if (running > longestStreak) longestStreak = running;
    } else if (day.isRest && protectedRestDates.has(day.date)) {
      // Planned recovery within consecutive (<= 2) & weekly (<= 3) limits preserves streak
      continue;
    } else if (running > 0) {
      consecutiveMissed += 1;
      if (consecutiveMissed > 3) {
        running = 0;
        consecutiveMissed = 0;
      }
    }
  }

  // Current streak counting backwards from today with a 3-day unlogged grace window
  let currentStreak = 0;
  let backwardMissed = 0;
  for (let i = orderedSummaries.length - 1; i >= 0; i--) {
    const day = orderedSummaries[i];
    if (day.itemCount > 0) {
      currentStreak += 1;
      backwardMissed = 0;
    } else if (day.isRest && protectedRestDates.has(day.date)) {
      continue;
    } else if (day.date === todayIso && currentStreak === 0) {
      // Today hasn't ended yet; don't consume a grace day for today itself
      continue;
    } else {
      backwardMissed += 1;
      if (backwardMissed > 3) {
        break;
      }
    }
  }

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  return { activeDaysYear, currentStreak, longestStreak };
}

// Unit conversion helpers (FR-4)
export function formatWeight(weightKg: number, unit: WeightUnit): string {
  if (unit === "lb") {
    return `${(weightKg * 2.20462).toFixed(1)} lb`;
  }
  return `${Number(weightKg.toFixed(1))} kg`;
}

export function convertWeightToKg(value: number, unit: WeightUnit): number {
  if (unit === "lb") {
    return Number((value / 2.20462).toFixed(2));
  }
  return Number(value.toFixed(2));
}

export function formatHeight(heightCm: number, unit: HeightUnit): string {
  if (unit === "ft-in") {
    const totalInches = Math.round(heightCm / 2.54);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}'${inches}"`;
  }
  return `${Math.round(heightCm)} cm`;
}

export function formatDistance(distanceKm: number, weightUnit: WeightUnit): string {
  if (weightUnit === "lb") {
    return `${(distanceKm * 0.621371).toFixed(1)} mi`;
  }
  return `${Number(distanceKm.toFixed(1))} km`;
}

/**
 * Computes personal Progress (% change vs. own prior baseline per exercise/cardio)
 * and Consistency (% of days active or declared Rest since first log in the window).
 * Missing history or optional fields (like RIR) are never penalized.
 */
export function computeProgressAndConsistency(params: {
  exerciseLogs: ExerciseLog[];
  cardioLogs: CardioLog[];
  summaries30: DaySummary[];
}): {
  progressPercent: number | null;
  progressStatus: "Calibrating" | "Scored";
  consistencyPercent: number;
  consistencyWindowDays: number;
} {
  const { exerciseLogs, cardioLogs, summaries30 } = params;

  const deltas: number[] = [];

  // 1. Strength progression: evaluated strictly per-exercise (e.g. Bench Press vs Bench Press,
  // Leg Press vs Leg Press). Different exercises and different muscle groups (e.g. Legs vs. Chest)
  // are NEVER cross-compared. Requires at least 3 sessions (2 prior baseline + 1 latest)
  // to establish a dependable baseline before scoring progress.
  const byExercise = new Map<string, ExerciseLog[]>();
  for (const log of exerciseLogs) {
    const key = log.exerciseName.trim().toLowerCase();
    const list = byExercise.get(key) ?? [];
    list.push(log);
    byExercise.set(key, list);
  }
  for (const list of byExercise.values()) {
    if (list.length < 2) continue; // Requires at least 2 sessions of the same exercise
    const sorted = [...list].sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.createdAt.localeCompare(b.createdAt)
    );
    const latest = sorted[sorted.length - 1];
    const prior = sorted.slice(0, -1).slice(-8);
    const baseline = prior.reduce((s, item) => s + item.work, 0) / prior.length;
    if (baseline > 0) {
      deltas.push(((latest.work - baseline) / baseline) * 100);
    }
  }

  // Set of dates that include strength exercise sets (to identify warm-up/cooldown cardio)
  const strengthDates = new Set(exerciseLogs.filter((e) => e.sets && e.sets.length > 0).map((e) => e.date));

  // 2. Cardio progression:
  // First consolidate daily cardio by date so multi-split walks on the same day (e.g. 3 splits on Sunday)
  // are combined into the day's total volume rather than comparing individual partial splits.
  // Also, light warm-up walks (< 15 mins on days with strength training) are not penalized as cardio regressions.
  const cardioByDate = new Map<string, Map<string, { date: string; minutes: number; work: number }>>();
  for (const log of cardioLogs) {
    const key = log.activityType.trim().toLowerCase();
    const dateMap = cardioByDate.get(key) ?? new Map<string, { date: string; minutes: number; work: number }>();
    const existing = dateMap.get(log.date);
    if (existing) {
      existing.minutes += log.minutes;
      existing.work += log.work;
    } else {
      dateMap.set(log.date, { date: log.date, minutes: log.minutes, work: log.work });
    }
    cardioByDate.set(key, dateMap);
  }

  for (const dateMap of cardioByDate.values()) {
    if (dateMap.size < 2) continue;
    const sortedDays = [...dateMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((e) => e[1]);
    const latest = sortedDays[sortedDays.length - 1];
    // If the latest cardio session is a short warm-up (< 15 min) on a day with strength lifting,
    // do not penalize it as a negative cardio progression.
    const isWarmupOnStrengthDay = latest.minutes < 15 && strengthDates.has(latest.date);
    const prior = sortedDays.slice(0, -1).slice(-8);
    const baseline = prior.reduce((s, item) => s + item.work, 0) / prior.length;
    if (baseline > 0) {
      const delta = ((latest.work - baseline) / baseline) * 100;
      if (!(isWarmupOnStrengthDay && delta < 0)) {
        deltas.push(delta);
      }
    }
  }

  const progressStatus: "Calibrating" | "Scored" = deltas.length > 0 ? "Scored" : "Calibrating";
  const progressPercent =
    deltas.length > 0 ? Number((deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1)) : null;

  const firstActiveIdx = summaries30.findIndex((d) => d.itemCount > 0 || d.isRest);
  if (firstActiveIdx === -1) {
    return {
      progressPercent,
      progressStatus,
      consistencyPercent: 0,
      consistencyWindowDays: 0,
    };
  }

  const window = summaries30.slice(firstActiveIdx);
  const { protectedRestDates } = analyzeRestDayDistribution(window);
  const adherentDays = window.filter(
    (d) => d.itemCount > 0 || (d.isRest && protectedRestDates.has(d.date))
  ).length;
  const consistencyWindowDays = window.length;
  const consistencyPercent = Math.round((adherentDays / consistencyWindowDays) * 100);

  return {
    progressPercent,
    progressStatus,
    consistencyPercent,
    consistencyWindowDays,
  };
}

export function cmToFeetInches(heightCm: number): { feet: number; inches: number } {
  const safeCm = Math.max(90, Math.min(260, Number(heightCm) || 175));
  const totalInches = Math.round(safeCm / 2.54);
  return {
    feet: Math.floor(totalInches / 12),
    inches: totalInches % 12,
  };
}

export function feetInchesToCm(feet: number, inches: number): number {
  const safeFeet = Math.max(3, Math.min(8, Math.floor(Number(feet) || 0)));
  const safeInches = Math.max(0, Math.min(24, Number(inches) || 0));
  const totalInches = safeFeet * 12 + safeInches;
  return Number((totalInches * 2.54).toFixed(1));
}

export function convertWeightBetweenUnits(
  value: number,
  fromUnit: WeightUnit,
  toUnit: WeightUnit
): number {
  const num = Number(value);
  if (Number.isNaN(num) || num <= 0) return 0;
  if (fromUnit === toUnit) return Number(num.toFixed(1));
  if (fromUnit === "kg" && toUnit === "lb") {
    return Number((num * 2.20462).toFixed(1));
  }
  return Number((num / 2.20462).toFixed(1));
}

export function convertDistanceToKm(value: number, weightUnit: WeightUnit): number {
  const num = Number(value);
  if (Number.isNaN(num) || num <= 0) return 0;
  if (weightUnit === "lb") {
    return Number((num * 1.60934).toFixed(2));
  }
  return Number(num.toFixed(2));
}

export function convertKmToDisplayDistance(km: number, weightUnit: WeightUnit): number {
  const num = Number(km);
  if (Number.isNaN(num) || num <= 0) return 0;
  if (weightUnit === "lb") {
    return Number((num * 0.621371).toFixed(1));
  }
  return Number(num.toFixed(2));
}

export function validateUsernameInput(raw: string): {
  cleaned: string;
  valid: boolean;
  hint: string;
} {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9_]/g, "");
  if (cleaned.length === 0) {
    return { cleaned, valid: false, hint: "3–24 lowercase letters, numbers, or _" };
  }
  if (cleaned.length < 3) {
    return { cleaned, valid: false, hint: "At least 3 characters required" };
  }
  if (cleaned.length > 24) {
    return { cleaned: cleaned.slice(0, 24), valid: true, hint: `@${cleaned.slice(0, 24)}` };
  }
  return { cleaned, valid: true, hint: `@${cleaned}` };
}

export function getCalibrationProgress(
  name: string,
  kind: "strength" | "cardio",
  logs: Array<ExerciseLog | CardioLog>,
  upToDate?: string,
  upToCreatedAt?: string
): { sessionCount: number; targetSessions: 3; label: string } {
  const targetKey =
    kind === "cardio" ? normalizeCardioActivityKey(name) : name.trim().toLowerCase();

  if (kind === "strength") {
    const matching = (logs as ExerciseLog[]).filter((l) => {
      if (l.exerciseName.trim().toLowerCase() !== targetKey) return false;
      if (!upToDate) return true;
      if (l.date < upToDate) return true;
      if (l.date > upToDate) return false;
      return upToCreatedAt ? l.createdAt <= upToCreatedAt : true;
    });
    const count = Math.max(1, Math.min(2, matching.length));
    return {
      sessionCount: count,
      targetSessions: 3,
      label: `Calibrating ${count}/2`,
    };
  }

  const dates = new Set<string>();
  for (const c of logs as CardioLog[]) {
    if (c.isRestActivity) continue;
    if (normalizeCardioActivityKey(c.activityType) !== targetKey) continue;
    if (upToDate && c.date > upToDate) continue;
    dates.add(c.date);
  }
  const count = Math.max(1, Math.min(2, dates.size));
  return {
    sessionCount: count,
    targetSessions: 3,
    label: `Calibrating ${count}/2`,
  };
}

export function getExerciseLastSessionHint(
  exerciseName: string,
  history: ExerciseLog[],
  weightUnit: WeightUnit
): {
  lastDate: string;
  lastSetsSummary: string;
  lastEffortScore: number | null;
  usualWorkTarget: number | null;
  targetHint: string;
} | null {
  const key = exerciseName.trim().toLowerCase();
  if (!key) return null;
  const matching = history
    .filter((l) => l.exerciseName.trim().toLowerCase() === key)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  if (matching.length === 0) return null;
  const latest = matching[0];
  const lastSetsSummary = latest.sets
    .slice(0, 4)
    .map((s) => `${formatWeight(s.weightKg, weightUnit)} × ${s.reps}`)
    .join(" · ");

  // Usual baseline for next session:
  // If >= 2 prior logs exist, 3rd+ session is scored!
  let usualWorkTarget: number | null = null;
  let targetHint = `Session ${Math.min(2, matching.length + 1)}/2 calibration`;
  if (matching.length >= 2) {
    const avgWorkKg = matching.reduce((sum, l) => sum + l.work, 0) / matching.length;
    usualWorkTarget = Number(avgWorkKg.toFixed(1));
    const displayVol =
      weightUnit === "lb" ? Math.round(avgWorkKg * 2.20462) : Math.round(avgWorkKg);
    targetHint = `Usual (50) ≈ ${displayVol.toLocaleString()} ${weightUnit} vol`;
  } else {
    targetHint = "1 more session unlocks Effort score";
  }

  return {
    lastDate: latest.date,
    lastSetsSummary,
    lastEffortScore: latest.effortScore,
    usualWorkTarget,
    targetHint,
  };
}

export function getSuggestedRoutineExercises(
  sessionGroups: string[],
  history: ExerciseLog[],
  visibleExercises: ExerciseLibraryItem[],
  excludeDate?: string
): string[] {
  if (!sessionGroups || sessionGroups.length === 0) return [];
  const targetSet = new Set(sessionGroups.map((g) => g.trim().toLowerCase()));
  const visibleMap = new Map(
    visibleExercises.map((e) => [e.name.trim().toLowerCase(), e.name])
  );

  // Group history by date (descending) excluding today
  const byDate = new Map<string, ExerciseLog[]>();
  const sorted = [...history].sort(
    (a, b) => b.date.localeCompare(a.date) || a.createdAt.localeCompare(b.createdAt)
  );
  for (const log of sorted) {
    if (excludeDate && log.date === excludeDate) continue;
    const list = byDate.get(log.date) ?? [];
    list.push(log);
    byDate.set(log.date, list);
  }

  for (const [, dayLogs] of byDate.entries()) {
    const matchingLogs = dayLogs.filter((l) =>
      targetSet.has(l.muscleGroup.trim().toLowerCase())
    );
    if (matchingLogs.length >= 1) {
      const ordered = [...matchingLogs].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
      );
      const uniqueNames: string[] = [];
      for (const l of ordered) {
        const canonical = visibleMap.get(l.exerciseName.trim().toLowerCase()) || l.exerciseName;
        if (!uniqueNames.some((u) => u.toLowerCase() === canonical.toLowerCase())) {
          uniqueNames.push(canonical);
        }
      }
      if (uniqueNames.length > 0) return uniqueNames.slice(0, 8);
    }
  }
  return [];
}

export function buildAlignedMonthCalendar(
  summaries365: DaySummary[],
  monthPrefix: string
): {
  monthLabel: string;
  cells: Array<DaySummary | null>;
  prevMonthPrefix: string | null;
  nextMonthPrefix: string | null;
} {
  const fullMonths = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const availablePrefixes = Array.from(
    new Set(summaries365.map((d) => d.date.slice(0, 7)))
  ).sort();
  const activePrefix =
    availablePrefixes.includes(monthPrefix) || summaries365.length === 0
      ? monthPrefix
      : availablePrefixes[availablePrefixes.length - 1] || monthPrefix;

  const idx = availablePrefixes.indexOf(activePrefix);
  const prevMonthPrefix = idx > 0 ? availablePrefixes[idx - 1] : null;
  const nextMonthPrefix =
    idx >= 0 && idx < availablePrefixes.length - 1 ? availablePrefixes[idx + 1] : null;

  const [yStr, mStr] = activePrefix.split("-");
  const year = Number(yStr) || 2026;
  const monthIdx = Math.max(0, Math.min(11, (Number(mStr) || 1) - 1));
  const monthLabel = `${fullMonths[monthIdx]} ${year}`;

  const summaryByDate = new Map(summaries365.map((d) => [d.date, d]));
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const firstDayMonOffset = (new Date(year, monthIdx, 1).getDay() + 6) % 7;

  const cells: Array<DaySummary | null> = Array.from(
    { length: firstDayMonOffset },
    () => null
  );

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push(
      summaryByDate.get(iso) ?? {
        date: iso,
        dayLetter: getDayLetter(iso),
        shortLabel: formatShortMonthDay(iso),
        sessionGroups: [],
        isRest: false,
        status: "No log",
        effortScore: null,
        band: "No log",
        itemCount: 0,
        loggedItems: [],
      }
    );
  }

  return {
    monthLabel,
    cells,
    prevMonthPrefix,
    nextMonthPrefix,
  };
}
