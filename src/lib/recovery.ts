import {
  analyzeRestDayDistribution,
  daysBetweenIso,
  REST_DAY_POLICY,
} from "./effort";
import { ExerciseLog } from "./types";

export type RecoveryZone = "red" | "yellow" | "green";

export interface MuscleRecoveryInfo {
  name: string;
  recommendedHours: string;
  isLargeGroup: boolean;
  lastTrainedDate: string | null;
  daysAgo: number | null;
  status: "Ready" | "Recovering";
  recoveryZone: RecoveryZone;
  statusText: string;
}

export interface MonthlyRecoveryHealth {
  status: "optimal" | "acceptable" | "risk-overtraining" | "risk-detraining";
  badge: string;
  title: string;
  detail: string;
  projectedRestDays: number;
  maxConsecutiveRest?: number;
  maxWeeklyRest?: number;
}

export const MUSCLE_RECOVERY_GUIDELINES: Record<
  string,
  { hours: string; isLarge: boolean; label: string }
> = {
  legs: { hours: "48–72h", isLarge: true, label: "Quads, Hamstrings, Glutes" },
  chest: { hours: "48–72h", isLarge: true, label: "Chest (Pectorals)" },
  back: { hours: "48–72h", isLarge: true, label: "Back & Lats" },
  shoulders: { hours: "48h", isLarge: false, label: "Deltoids" },
  arms: { hours: "24–48h", isLarge: false, label: "Biceps & Triceps" },
  core: { hours: "24–48h", isLarge: false, label: "Abs & Core" },
  cardio: { hours: "24–48h", isLarge: false, label: "Cardio & Endurance" },
};

/**
 * Returns science-backed recovery guidelines and current readiness for muscle groups.
 */
export function getMuscleRecoveryStatus(
  muscleGroup: string,
  recentLogs: ExerciseLog[],
  todayIso: string
): MuscleRecoveryInfo {
  const key = muscleGroup.toLowerCase();
  const rule = MUSCLE_RECOVERY_GUIDELINES[key] || {
    hours: "48h",
    isLarge: false,
    label: muscleGroup,
  };

  let matchingLog: ExerciseLog | null = null;
  for (const log of recentLogs) {
    if (log.muscleGroup.toLowerCase() !== key) continue;
    if (!matchingLog || log.date > matchingLog.date) {
      matchingLog = log;
    }
  }

  if (!matchingLog) {
    return {
      name: muscleGroup,
      recommendedHours: rule.hours,
      isLargeGroup: rule.isLarge,
      lastTrainedDate: null,
      daysAgo: null,
      status: "Ready",
      recoveryZone: "green",
      statusText: "Ready to train",
    };
  }

  const daysAgo = Math.max(0, daysBetweenIso(matchingLog.date, todayIso));

  if (daysAgo === 0) {
    return {
      name: muscleGroup,
      recommendedHours: rule.hours,
      isLargeGroup: rule.isLarge,
      lastTrainedDate: matchingLog.date,
      daysAgo: 0,
      status: "Recovering",
      recoveryZone: "red",
      statusText: `Trained today · Needs ${rule.hours}`,
    };
  }

  if (daysAgo === 1) {
    // 24 hours elapsed: large groups (48-72h) & shoulders (48h) remain in yellow recovery;
    // small groups (24-48h like Arms/Core) enter green readiness.
    const stillRepairing = rule.isLarge || rule.hours === "48h";
    const status = stillRepairing ? "Recovering" : "Ready";
    const recoveryZone: RecoveryZone = stillRepairing ? "yellow" : "green";
    return {
      name: muscleGroup,
      recommendedHours: rule.hours,
      isLargeGroup: rule.isLarge,
      lastTrainedDate: matchingLog.date,
      daysAgo: 1,
      status,
      recoveryZone,
      statusText: stillRepairing
        ? `Trained yesterday (~24h) · Needs ${rule.hours}`
        : "Trained yesterday (~24h) · Ready",
    };
  }

  if (daysAgo === 2) {
    // 48 hours elapsed: both small and large muscles enter green readiness
    return {
      name: muscleGroup,
      recommendedHours: rule.hours,
      isLargeGroup: rule.isLarge,
      lastTrainedDate: matchingLog.date,
      daysAgo: 2,
      status: "Ready",
      recoveryZone: "green",
      statusText: "Trained 2d ago (~48h) · Recovered & Ready",
    };
  }

  return {
    name: muscleGroup,
    recommendedHours: rule.hours,
    isLargeGroup: rule.isLarge,
    lastTrainedDate: matchingLog.date,
    daysAgo,
    status: "Ready",
    recoveryZone: "green",
    statusText: `Trained ${daysAgo}d ago · Ready`,
  };
}

/**
 * Evaluates monthly rest days against evidence-based recovery thresholds.
 * Healthy: 8–12 days/month (max 2 consecutive, max 3 per week).
 * Acceptable: 4–7 days/month or unevenly clustered rest days.
 * Unhealthy: < 4 days/month (elevated CNS fatigue and connective tissue injury risk).
 * Detraining: > 18 days/month.
 */
export function evaluateMonthlyRecoveryHealth(params: {
  activeDays: number;
  restDays: number;
  dayOfMonth: number;
  daysInMonth: number;
  restDates?: string[];
}): MonthlyRecoveryHealth {
  const { restDays, dayOfMonth, daysInMonth, restDates } = params;
  const safeElapsed = Math.max(1, dayOfMonth);
  const projectedRestDays = Math.round((restDays / safeElapsed) * daysInMonth);

  const dist =
    restDates && restDates.length > 0
      ? analyzeRestDayDistribution(restDates.map((date) => ({ date, isRest: true })))
      : null;
  const maxConsecutiveRest = dist?.maxConsecutiveRest ?? 0;
  const maxWeeklyRest = dist?.maxRestIn7Days ?? 0;
  const isClustered =
    Boolean(dist) &&
    (maxConsecutiveRest > REST_DAY_POLICY.maxConsecutiveRestDays ||
      maxWeeklyRest > REST_DAY_POLICY.maxRestDaysPerWeek);

  if (projectedRestDays < 4) {
    return {
      status: "risk-overtraining",
      badge: "High Fatigue Risk",
      title: "< 4 Rest Days / Month (Unhealthy)",
      detail:
        "Sports science indicates fewer than 4 rest days/month starves tendons and nervous system of recovery, elevating injury risk and cortisol.",
      projectedRestDays,
      maxConsecutiveRest,
      maxWeeklyRest,
    };
  }

  if (isClustered && projectedRestDays <= 14) {
    return {
      status: "acceptable",
      badge: "Uneven Rest",
      title: "Spread Rest Across Weeks",
      detail: `Even 8–12 rest days/month should stay within max ${REST_DAY_POLICY.maxConsecutiveRestDays} consecutive and ${REST_DAY_POLICY.maxRestDaysPerWeek} per week (logged ${maxConsecutiveRest} in a row, ${maxWeeklyRest} in 7 days).`,
      projectedRestDays,
      maxConsecutiveRest,
      maxWeeklyRest,
    };
  }

  if (projectedRestDays >= 8 && projectedRestDays <= 14) {
    return {
      status: "optimal",
      badge: "Optimal Healthy Recovery",
      title: "8–12 Rest Days / Month",
      detail: `Optimal balance (max ${REST_DAY_POLICY.maxConsecutiveRestDays} consecutive · max ${REST_DAY_POLICY.maxRestDaysPerWeek}/week). Allows complete muscle protein synthesis, joint remodeling, and CNS recharge.`,
      projectedRestDays,
      maxConsecutiveRest,
      maxWeeklyRest,
    };
  }

  if (projectedRestDays >= 4 && projectedRestDays < 8) {
    return {
      status: "acceptable",
      badge: "High-Frequency Split",
      title: "4–7 Rest Days / Month",
      detail:
        "Sustainable only with strict muscle rotation splits (e.g. PPL). Keep rest spaced (max 2 consecutive) and allow 48–72 hours between muscle sessions.",
      projectedRestDays,
      maxConsecutiveRest,
      maxWeeklyRest,
    };
  }

  return {
    status: "risk-detraining",
    badge: "High Rest Volume",
    title: "> 18 Rest Days / Month",
    detail:
      "Muscle protein synthesis drops after 48h. Aim for at least 2–3 strength sessions per week to sustain progressive overload.",
    projectedRestDays,
    maxConsecutiveRest,
    maxWeeklyRest,
  };
}
