import { CardioLog, DaySummary, ExerciseLog, WeightUnit } from "./types";
import {
  analyzeRestDayDistribution,
  estimateOneRepMax,
  getExerciseLoadMode,
} from "./effort";

export type MilestoneCategory =
  | "all"
  | "monthly"
  | "yearly"
  | "plates"
  | "strength"
  | "cardio"
  | "streak";
export type MilestoneTier = "bronze" | "silver" | "gold" | "diamond";

export interface MilestoneBadge {
  id: string;
  category: "monthly" | "yearly" | "strength" | "cardio" | "streak";
  subCategory?: "plate" | "calendar-month" | "yearly-goal";
  plateWeightKg?: number;
  basePlateKg?: number;
  plateCount?: number;
  plateLabel?: string;
  monthNumber?: number;
  monthLabel?: string;
  yearNumber?: number;
  monthPrefix?: string;
  earnedMonthPrefix?: string;
  detailNote?: string;
  tier: MilestoneTier;
  title: string;
  description: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  isUnlocked: boolean;
  progressPercent: number;
  iconType:
    | "dumbbell"
    | "weight"
    | "plate"
    | "calendar"
    | "yearly"
    | "flame"
    | "footprints"
    | "timer"
    | "trophy"
    | "zap";
}

export interface UserMilestoneSummary {
  totalUnlocked: number;
  totalAvailable: number;
  strengthUnlocked: number;
  platesUnlocked: number;
  platesTotal: number;
  monthlyUnlocked: number;
  monthlyTotal: number;
  yearlyUnlocked: number;
  yearlyTotal: number;
  cardioUnlocked: number;
  streakUnlocked: number;
  highestWeightKg: number;
  highestWeightExercise: string | null;
  currentMonthPrefix: string;
  badges: MilestoneBadge[];
  recentUnlocks: MilestoneBadge[];
  earnedThisMonth: MilestoneBadge[];
}

interface ComputeMilestoneOptions {
  exerciseLogs: ExerciseLog[];
  cardioLogs: CardioLog[];
  summaries365?: DaySummary[];
  currentStreak?: number;
  weightUnit?: WeightUnit;
  todayIso?: string;
  includeWorkoutDetailMedals?: boolean;
}

/**
 * Milestone weight plates from 25 kg to 200 kg.
 * Trivial starter weights (5-20 kg) are intentionally excluded so every plate medal is earned.
 */
export const WEIGHT_PLATES_KG: Array<{
  kg: number;
  baseKg: number;
  count: number;
  label: string;
  tier: MilestoneTier;
  title: string;
  description: string;
}> = [
  {
    kg: 25,
    baseKg: 25,
    count: 1,
    label: "25",
    tier: "bronze",
    title: "25 kg Plate",
    description: "Lift at least 25 kg on a non-assisted strength set.",
  },
  {
    kg: 50,
    baseKg: 25,
    count: 2,
    label: "25",
    tier: "bronze",
    title: "50 kg (2×25)",
    description: "Lift 50 kg or more in a single non-assisted strength set.",
  },
  {
    kg: 75,
    baseKg: 25,
    count: 3,
    label: "25",
    tier: "silver",
    title: "75 kg (3×25)",
    description: "Lift 75 kg or more in a single non-assisted strength set.",
  },
  {
    kg: 100,
    baseKg: 25,
    count: 4,
    label: "25",
    tier: "silver",
    title: "100 kg (4×25)",
    description: "Join the 100 kg club on a single strength set.",
  },
  {
    kg: 125,
    baseKg: 25,
    count: 5,
    label: "25",
    tier: "gold",
    title: "125 kg (5×25)",
    description: "Lift 125 kg or more on a single non-assisted strength set.",
  },
  {
    kg: 150,
    baseKg: 25,
    count: 6,
    label: "25",
    tier: "gold",
    title: "150 kg (6×25)",
    description: "Lift 150 kg or more on a single strength set.",
  },
  {
    kg: 175,
    baseKg: 25,
    count: 7,
    label: "25",
    tier: "diamond",
    title: "175 kg (7×25)",
    description: "Push 175 kg or more on a single strength set.",
  },
  {
    kg: 200,
    baseKg: 25,
    count: 8,
    label: "25",
    tier: "diamond",
    title: "200 kg (8×25)",
    description: "Reach the elite 200 kg strength plate milestone.",
  },
];

const CALENDAR_MONTHS: ReadonlyArray<{ num: number; code: string; name: string }> = [
  { num: 1, code: "JAN", name: "January" },
  { num: 2, code: "FEB", name: "February" },
  { num: 3, code: "MAR", name: "March" },
  { num: 4, code: "APR", name: "April" },
  { num: 5, code: "MAY", name: "May" },
  { num: 6, code: "JUN", name: "June" },
  { num: 7, code: "JUL", name: "July" },
  { num: 8, code: "AUG", name: "August" },
  { num: 9, code: "SEP", name: "September" },
  { num: 10, code: "OCT", name: "October" },
  { num: 11, code: "NOV", name: "November" },
  { num: 12, code: "DEC", name: "December" },
];

export const CALENDAR_MONTH_ACTIVE_TARGET = 18;
export const CALENDAR_YEAR_ACTIVE_TARGET = 180;

export function formatPlateMultiplierBreakdown(weightKg: number): string {
  const safe = Math.max(0, Number(weightKg) || 0);
  if (safe < 25) return "Under 25 kg plate minimum";

  const count25 = Math.floor((safe + 0.001) / 25);
  const rem = Number((safe - count25 * 25).toFixed(1));
  if (rem <= 0.1) {
    return count25 === 1 ? "1 × 25 kg" : `${count25} × 25 kg`;
  }
  return `${count25} × 25 kg + ${rem} kg`;
}

export function computeUserMilestones({
  exerciseLogs,
  cardioLogs,
  summaries365 = [],
  currentStreak = 0,
  weightUnit = "kg",
  todayIso,
  includeWorkoutDetailMedals = true,
}: ComputeMilestoneOptions): UserMilestoneSummary {
  const isLb = weightUnit === "lb";

  const resolvedTodayIso =
    todayIso ||
    summaries365[summaries365.length - 1]?.date ||
    exerciseLogs[0]?.date ||
    cardioLogs[0]?.date ||
    new Date().toISOString().slice(0, 10);
  const activeYear = Number(resolvedTodayIso.slice(0, 4)) || new Date().getFullYear();
  const currentMonthPrefix = resolvedTodayIso.slice(0, 7);

  const monthActiveDates = new Map<string, Set<string>>();
  const yearActiveDates = new Map<number, Set<string>>();

  const addActiveDate = (dateStr: string | undefined) => {
    if (!dateStr || dateStr.length < 10) return;
    const mPrefix = dateStr.slice(0, 7);
    const yr = Number(dateStr.slice(0, 4));
    if (!mPrefix || !yr) return;

    const mSet = monthActiveDates.get(mPrefix) ?? new Set<string>();
    mSet.add(dateStr);
    monthActiveDates.set(mPrefix, mSet);

    const ySet = yearActiveDates.get(yr) ?? new Set<string>();
    ySet.add(dateStr);
    yearActiveDates.set(yr, ySet);
  };

  for (const day of summaries365) {
    if (day.itemCount > 0 && !day.isRest) {
      addActiveDate(day.date);
    }
  }

  const sortedExercises = [...exerciseLogs].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
  );

  let totalVolumeKg = 0;
  let totalSets = 0;
  let max1RMKg = 0;
  let highestWeightKg = 0;
  let highestWeightExercise: string | null = null;
  let highestWeightDate: string | null = null;

  const plateUnlockedMonth = new Map<number, string>();
  const volUnlockedMonth = new Map<number, string>();
  const setsUnlockedMonth = new Map<number, string>();
  const oneRmUnlockedMonth = new Map<number, string>();

  const volTargetsKg = [25000, 50000, 100000, 250000];
  const setTargets = [100, 300, 1000];
  const oneRmTargets = [100, 140];

  for (const log of sortedExercises) {
    addActiveDate(log.date);
    if (!includeWorkoutDetailMedals) continue;

    const logMonth = log.date ? log.date.slice(0, 7) : undefined;
    const mode = getExerciseLoadMode(log.exerciseName);
    const isAssisted = mode === "assisted";

    let logVolKg = 0;
    for (const set of log.sets || []) {
      const w = Math.max(0, Number(set.weightKg) || 0);
      const r = Math.max(0, Number(set.reps) || 0);
      totalSets += 1;

      if (logMonth) {
        for (const st of setTargets) {
          if (totalSets >= st && !setsUnlockedMonth.has(st)) {
            setsUnlockedMonth.set(st, logMonth);
          }
        }
      }

      if (!isAssisted) {
        logVolKg += w * r;
        const est1RM = estimateOneRepMax(w, r, log.exerciseName);
        if (est1RM > max1RMKg) {
          max1RMKg = est1RM;
        }
        if (logMonth) {
          for (const rt of oneRmTargets) {
            if (est1RM >= rt && !oneRmUnlockedMonth.has(rt)) {
              oneRmUnlockedMonth.set(rt, logMonth);
            }
          }
        }
        if (w > highestWeightKg && r > 0) {
          highestWeightKg = w;
          highestWeightExercise = log.exerciseName;
          highestWeightDate = log.date || null;
        }
        if (r > 0 && logMonth) {
          for (const plate of WEIGHT_PLATES_KG) {
            if (w >= plate.kg && !plateUnlockedMonth.has(plate.kg)) {
              plateUnlockedMonth.set(plate.kg, logMonth);
            }
          }
        }
      }
    }

    if (isAssisted) {
      logVolKg = Math.max(0, Number(log.work) || 0);
    }

    totalVolumeKg += logVolKg;
    if (logMonth) {
      for (const vt of volTargetsKg) {
        if (totalVolumeKg >= vt && !volUnlockedMonth.has(vt)) {
          volUnlockedMonth.set(vt, logMonth);
        }
      }
    }
  }

  const sortedCardio = [...cardioLogs].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
  );

  let totalDistanceKm = 0;
  let totalMinutes = 0;
  let totalKcal = 0;

  const distUnlockedMonth = new Map<number, string>();
  const minsUnlockedMonth = new Map<number, string>();
  const kcalUnlockedMonth = new Map<number, string>();

  const distTargets = [21.1, 42.2, 100];
  const minsTargets = [180, 600, 1200];
  const kcalTargets = [5000, 10000, 25000];

  for (const c of sortedCardio) {
    if (!c.isRestActivity) {
      addActiveDate(c.date);
    }
    if (!includeWorkoutDetailMedals) continue;

    const cMonth = c.date ? c.date.slice(0, 7) : undefined;
    totalDistanceKm += Math.max(0, Number(c.distanceKm) || 0);
    totalMinutes += Math.max(0, Number(c.minutes) || 0);
    totalKcal += Math.max(0, Number(c.kcal) || 0);

    if (cMonth) {
      for (const dt of distTargets) {
        if (totalDistanceKm >= dt && !distUnlockedMonth.has(dt)) {
          distUnlockedMonth.set(dt, cMonth);
        }
      }
      for (const mt of minsTargets) {
        if (totalMinutes >= mt && !minsUnlockedMonth.has(mt)) {
          minsUnlockedMonth.set(mt, cMonth);
        }
      }
      for (const kt of kcalTargets) {
        if (totalKcal >= kt && !kcalUnlockedMonth.has(kt)) {
          kcalUnlockedMonth.set(kt, cMonth);
        }
      }
    }
  }

  const streakUnlockedMonth = new Map<number, string>();
  const streakTargets = [7, 14, 30, 60];
  if (summaries365.length > 0) {
    const { protectedRestDates } = analyzeRestDayDistribution(summaries365);
    let running = 0;
    let consecutiveMissed = 0;
    for (const day of summaries365) {
      if (day.itemCount > 0) {
        running += 1;
        consecutiveMissed = 0;
        for (const st of streakTargets) {
          if (running >= st && !streakUnlockedMonth.has(st)) {
            streakUnlockedMonth.set(st, day.date.slice(0, 7));
          }
        }
      } else if (day.isRest && protectedRestDates.has(day.date)) {
        continue;
      } else if (running > 0) {
        consecutiveMissed += 1;
        if (consecutiveMissed > 3) {
          running = 0;
          consecutiveMissed = 0;
        }
      }
    }
  } else {
    for (const st of streakTargets) {
      if (currentStreak >= st) {
        streakUnlockedMonth.set(st, currentMonthPrefix);
      }
    }
  }

  // Monthly Medals (one by one, with Year; unearned past months removed automatically)
  const candidateMonths = Array.from(
    new Set([...monthActiveDates.keys(), currentMonthPrefix])
  )
    .filter((mPrefix) => mPrefix <= currentMonthPrefix)
    .sort();

  type BadgeDef = Omit<MilestoneBadge, "isUnlocked" | "progressPercent">;
  const monthlyBadges: BadgeDef[] = [];

  for (const mPrefix of candidateMonths) {
    const activeDates = [...(monthActiveDates.get(mPrefix) ?? new Set<string>())].sort();
    const activeCount = activeDates.length;
    const isEarned = activeCount >= CALENDAR_MONTH_ACTIVE_TARGET;
    const isCurrentMonth = mPrefix === currentMonthPrefix;

    if (!isCurrentMonth && !isEarned) continue;

    const [yStr, mStr] = mPrefix.split("-");
    const yearNum = Number(yStr);
    const monthNum = Number(mStr);
    const calInfo = CALENDAR_MONTHS.find((c) => c.num === monthNum);
    const monthCode = calInfo?.code ?? mStr;
    const monthName = calInfo?.name ?? mPrefix;

    monthlyBadges.push({
      id: `monthly_cal_${yStr}_${mStr}`,
      category: "monthly",
      subCategory: "calendar-month",
      monthNumber: monthNum,
      monthLabel: monthCode,
      yearNumber: yearNum,
      monthPrefix: mPrefix,
      earnedMonthPrefix: isEarned ? mPrefix : undefined,
      detailNote: isCurrentMonth
        ? `Current Month · ${activeCount} of ${CALENDAR_MONTH_ACTIVE_TARGET} active days in ${monthName} ${yearNum}`
        : `Earned in ${monthName} ${yearNum} · ${activeCount} active days`,
      tier: "gold",
      title: `${monthName} ${yearNum}`,
      description: `Complete ${CALENDAR_MONTH_ACTIVE_TARGET} active workout days in ${monthName} ${yearNum}.`,
      targetValue: CALENDAR_MONTH_ACTIVE_TARGET,
      currentValue: activeCount,
      unit: "days",
      iconType: "calendar",
    });
  }

  // Yearly Medals (one by one; unearned past years removed automatically)
  const candidateYears = Array.from(
    new Set([...yearActiveDates.keys(), activeYear])
  )
    .filter((yr) => yr <= activeYear)
    .sort((a, b) => a - b);

  const yearlyBadges: BadgeDef[] = [];

  for (const yr of candidateYears) {
    const activeDates = [...(yearActiveDates.get(yr) ?? new Set<string>())].sort();
    const activeCount = activeDates.length;
    const isEarned = activeCount >= CALENDAR_YEAR_ACTIVE_TARGET;
    const isCurrentYear = yr === activeYear;

    if (!isCurrentYear && !isEarned) continue;

    const unlockDate = isEarned ? activeDates[CALENDAR_YEAR_ACTIVE_TARGET - 1] : undefined;

    yearlyBadges.push({
      id: `yearly_cal_${yr}`,
      category: "yearly",
      subCategory: "yearly-goal",
      yearNumber: yr,
      earnedMonthPrefix: unlockDate ? unlockDate.slice(0, 7) : undefined,
      detailNote: isCurrentYear
        ? `Active Year · ${activeCount} of ${CALENDAR_YEAR_ACTIVE_TARGET} active days in ${yr}`
        : `Earned in ${yr} · ${activeCount} active days`,
      tier: "diamond",
      title: `${yr} Yearly`,
      description: `Log ${CALENDAR_YEAR_ACTIVE_TARGET} active workout days during ${yr}.`,
      targetValue: CALENDAR_YEAR_ACTIVE_TARGET,
      currentValue: activeCount,
      unit: "days",
      iconType: "yearly",
    });
  }

  const displayVolume = isLb ? Math.round(totalVolumeKg * 2.20462) : Math.round(totalVolumeKg);
  const display1RM = isLb ? Math.round(max1RMKg * 2.20462) : max1RMKg;
  const volUnit = isLb ? "lb" : "kg";
  const weightUnitLabel = isLb ? "lb" : "kg";

  const targetVol = (kgTarget: number) => (isLb ? Math.round(kgTarget * 2.20462) : kgTarget);
  const targetWeight = (kgTarget: number) => (isLb ? Math.round(kgTarget * 2.20462) : kgTarget);

  const highestWeightDetail =
    highestWeightKg > 0 && highestWeightExercise
      ? `Peak Set: ${
          isLb ? Math.round(highestWeightKg * 2.20462) : Number(highestWeightKg.toFixed(1))
        } ${weightUnitLabel} · ${highestWeightExercise}${
          highestWeightDate ? ` (${highestWeightDate})` : ""
        }`
      : "Lift 25 kg+ on a non-assisted set to start unlocking weight plates.";

  const workoutDetailBadges: BadgeDef[] = includeWorkoutDetailMedals
    ? [
        // --- Matte Weight Plates from 25 kg to 200 kg (no easy <25 kg plates) ---
        ...WEIGHT_PLATES_KG.map(
          (plate): BadgeDef => ({
            id: `strength_plate_${plate.kg}`,
            category: "strength",
            subCategory: "plate",
            plateWeightKg: plate.kg,
            basePlateKg: plate.baseKg,
            plateCount: plate.count,
            plateLabel: plate.label,
            earnedMonthPrefix:
              highestWeightKg >= plate.kg ? plateUnlockedMonth.get(plate.kg) : undefined,
            detailNote: highestWeightDetail,
            tier: plate.tier,
            title: plate.title,
            description: isLb
              ? `${plate.description} (${targetWeight(plate.kg)} lb equivalent).`
              : plate.description,
            targetValue: plate.kg,
            currentValue: Number(highestWeightKg.toFixed(1)),
            unit: "kg",
            iconType: "plate",
          })
        ),

        // --- Strength Volume Milestones ---
        {
          id: "strength_vol_25k",
          category: "strength",
          earnedMonthPrefix: totalVolumeKg >= 25000 ? volUnlockedMonth.get(25000) : undefined,
          tier: "bronze",
          title: "25 Ton Club",
          description: `Lift a cumulative total of ${targetVol(25000).toLocaleString()} ${volUnit} in strength volume.`,
          targetValue: targetVol(25000),
          currentValue: displayVolume,
          unit: volUnit,
          iconType: "weight",
        },
        {
          id: "strength_vol_50k",
          category: "strength",
          earnedMonthPrefix: totalVolumeKg >= 50000 ? volUnlockedMonth.get(50000) : undefined,
          tier: "silver",
          title: "50 Ton Club",
          description: `Lift a cumulative total of ${targetVol(50000).toLocaleString()} ${volUnit} in strength volume.`,
          targetValue: targetVol(50000),
          currentValue: displayVolume,
          unit: volUnit,
          iconType: "weight",
        },
        {
          id: "strength_vol_100k",
          category: "strength",
          earnedMonthPrefix: totalVolumeKg >= 100000 ? volUnlockedMonth.get(100000) : undefined,
          tier: "gold",
          title: "100 Ton Club",
          description: `Lift a cumulative total of ${targetVol(100000).toLocaleString()} ${volUnit} in strength volume.`,
          targetValue: targetVol(100000),
          currentValue: displayVolume,
          unit: volUnit,
          iconType: "weight",
        },
        {
          id: "strength_vol_250k",
          category: "strength",
          earnedMonthPrefix: totalVolumeKg >= 250000 ? volUnlockedMonth.get(250000) : undefined,
          tier: "diamond",
          title: "Quarter Million",
          description: `Lift a cumulative total of ${targetVol(250000).toLocaleString()} ${volUnit} in strength volume.`,
          targetValue: targetVol(250000),
          currentValue: displayVolume,
          unit: volUnit,
          iconType: "trophy",
        },

        // --- Strength Sets Milestones ---
        {
          id: "strength_sets_100",
          category: "strength",
          earnedMonthPrefix: totalSets >= 100 ? setsUnlockedMonth.get(100) : undefined,
          tier: "bronze",
          title: "100 Sets Club",
          description: "Complete 100 non-assisted working strength sets.",
          targetValue: 100,
          currentValue: totalSets,
          unit: "sets",
          iconType: "dumbbell",
        },
        {
          id: "strength_sets_300",
          category: "strength",
          earnedMonthPrefix: totalSets >= 300 ? setsUnlockedMonth.get(300) : undefined,
          tier: "silver",
          title: "Iron Grinder (300)",
          description: "Complete 300 total strength sets.",
          targetValue: 300,
          currentValue: totalSets,
          unit: "sets",
          iconType: "dumbbell",
        },
        {
          id: "strength_sets_1000",
          category: "strength",
          earnedMonthPrefix: totalSets >= 1000 ? setsUnlockedMonth.get(1000) : undefined,
          tier: "diamond",
          title: "1,000 Sets Elite",
          description: "Log 1,000 total completed strength sets.",
          targetValue: 1000,
          currentValue: totalSets,
          unit: "sets",
          iconType: "zap",
        },

        // --- Strength 1RM Milestones ---
        {
          id: "strength_1rm_century",
          category: "strength",
          earnedMonthPrefix: max1RMKg >= 100 ? oneRmUnlockedMonth.get(100) : undefined,
          tier: "gold",
          title: `Century 1RM (${targetWeight(100)}${weightUnitLabel})`,
          description: `Hit an estimated 1-Rep Max of ${targetWeight(100)} ${weightUnitLabel} or more on any exercise.`,
          targetValue: targetWeight(100),
          currentValue: display1RM,
          unit: weightUnitLabel,
          iconType: "trophy",
        },
        {
          id: "strength_1rm_elite",
          category: "strength",
          earnedMonthPrefix: max1RMKg >= 140 ? oneRmUnlockedMonth.get(140) : undefined,
          tier: "diamond",
          title: `Elite 1RM (${targetWeight(140)}${weightUnitLabel})`,
          description: `Hit an estimated 1-Rep Max of ${targetWeight(140)} ${weightUnitLabel} or more on any exercise.`,
          targetValue: targetWeight(140),
          currentValue: display1RM,
          unit: weightUnitLabel,
          iconType: "trophy",
        },

        // --- Cardio Distance Milestones ---
        {
          id: "cardio_dist_half",
          category: "cardio",
          earnedMonthPrefix: totalDistanceKm >= 21.1 ? distUnlockedMonth.get(21.1) : undefined,
          tier: "bronze",
          title: "Half Marathon (21.1 km)",
          description: "Accumulate 21.1 kilometers across cardio sessions.",
          targetValue: 21.1,
          currentValue: Number(totalDistanceKm.toFixed(1)),
          unit: "km",
          iconType: "footprints",
        },
        {
          id: "cardio_dist_full",
          category: "cardio",
          earnedMonthPrefix: totalDistanceKm >= 42.2 ? distUnlockedMonth.get(42.2) : undefined,
          tier: "silver",
          title: "Full Marathon (42.2 km)",
          description: "Accumulate 42.2 kilometers across cardio sessions.",
          targetValue: 42.2,
          currentValue: Number(totalDistanceKm.toFixed(1)),
          unit: "km",
          iconType: "trophy",
        },
        {
          id: "cardio_dist_100k",
          category: "cardio",
          earnedMonthPrefix: totalDistanceKm >= 100 ? distUnlockedMonth.get(100) : undefined,
          tier: "diamond",
          title: "Century Runner (100 km)",
          description: "Conquer 100 kilometers of cardio endurance.",
          targetValue: 100,
          currentValue: Number(totalDistanceKm.toFixed(1)),
          unit: "km",
          iconType: "trophy",
        },

        // --- Cardio Minutes Milestones ---
        {
          id: "cardio_mins_180",
          category: "cardio",
          earnedMonthPrefix: totalMinutes >= 180 ? minsUnlockedMonth.get(180) : undefined,
          tier: "bronze",
          title: "3 Hours Endurance",
          description: "Log 180 cumulative minutes of cardio workouts.",
          targetValue: 180,
          currentValue: totalMinutes,
          unit: "min",
          iconType: "timer",
        },
        {
          id: "cardio_mins_600",
          category: "cardio",
          earnedMonthPrefix: totalMinutes >= 600 ? minsUnlockedMonth.get(600) : undefined,
          tier: "silver",
          title: "10 Hours Endurance",
          description: "Log 600 cumulative minutes (10 hours) of aerobic training.",
          targetValue: 600,
          currentValue: totalMinutes,
          unit: "min",
          iconType: "timer",
        },
        {
          id: "cardio_mins_1200",
          category: "cardio",
          earnedMonthPrefix: totalMinutes >= 1200 ? minsUnlockedMonth.get(1200) : undefined,
          tier: "gold",
          title: "20 Hours Engine",
          description: "Accumulate 1,200 minutes (20 hours) of cardio sessions.",
          targetValue: 1200,
          currentValue: totalMinutes,
          unit: "min",
          iconType: "zap",
        },

        // --- Cardio Calories Milestones ---
        {
          id: "cardio_kcal_5000",
          category: "cardio",
          earnedMonthPrefix: totalKcal >= 5000 ? kcalUnlockedMonth.get(5000) : undefined,
          tier: "bronze",
          title: "Furnace (5k kcal)",
          description: "Burn 5,000 total calories across your cardio sessions.",
          targetValue: 5000,
          currentValue: Math.round(totalKcal),
          unit: "kcal",
          iconType: "flame",
        },
        {
          id: "cardio_kcal_10000",
          category: "cardio",
          earnedMonthPrefix: totalKcal >= 10000 ? kcalUnlockedMonth.get(10000) : undefined,
          tier: "silver",
          title: "Inferno (10k kcal)",
          description: "Burn 10,000 total calories across your cardio sessions.",
          targetValue: 10000,
          currentValue: Math.round(totalKcal),
          unit: "kcal",
          iconType: "flame",
        },
        {
          id: "cardio_kcal_25000",
          category: "cardio",
          earnedMonthPrefix: totalKcal >= 25000 ? kcalUnlockedMonth.get(25000) : undefined,
          tier: "gold",
          title: "Afterburner (25k kcal)",
          description: "Burn 25,000 total calories across your cardio sessions.",
          targetValue: 25000,
          currentValue: Math.round(totalKcal),
          unit: "kcal",
          iconType: "flame",
        },
      ]
    : [];

  const streakBadges: BadgeDef[] = [
    {
      id: "streak_7",
      category: "streak",
      earnedMonthPrefix: currentStreak >= 7 ? streakUnlockedMonth.get(7) : undefined,
      tier: "bronze",
      title: "7-Day Warrior",
      description: "Maintain a 7-day active gym/cardio consistency streak.",
      targetValue: 7,
      currentValue: currentStreak,
      unit: "days",
      iconType: "zap",
    },
    {
      id: "streak_14",
      category: "streak",
      earnedMonthPrefix: currentStreak >= 14 ? streakUnlockedMonth.get(14) : undefined,
      tier: "silver",
      title: "Fortnight Beast",
      description: "Maintain a 14-day active consistency streak.",
      targetValue: 14,
      currentValue: currentStreak,
      unit: "days",
      iconType: "zap",
    },
    {
      id: "streak_30",
      category: "streak",
      earnedMonthPrefix: currentStreak >= 30 ? streakUnlockedMonth.get(30) : undefined,
      tier: "gold",
      title: "30-Day Ironclad",
      description: "Maintain an unbroken 30-day streak of effort and dedication.",
      targetValue: 30,
      currentValue: currentStreak,
      unit: "days",
      iconType: "trophy",
    },
    {
      id: "streak_60",
      category: "streak",
      earnedMonthPrefix: currentStreak >= 60 ? streakUnlockedMonth.get(60) : undefined,
      tier: "diamond",
      title: "60-Day Relentless",
      description: "Maintain a 60-day active consistency streak.",
      targetValue: 60,
      currentValue: currentStreak,
      unit: "days",
      iconType: "trophy",
    },
  ];

  const badgeDefinitions: BadgeDef[] = [
    ...monthlyBadges,
    ...yearlyBadges,
    ...workoutDetailBadges,
    ...streakBadges,
  ];

  const badges: MilestoneBadge[] = badgeDefinitions.map((def) => {
    const isUnlocked = def.currentValue >= def.targetValue;
    const progressPercent = isUnlocked
      ? 100
      : def.targetValue > 0
      ? Math.max(0, Math.min(99, Math.round((def.currentValue / def.targetValue) * 100)))
      : 0;

    return {
      ...def,
      isUnlocked,
      progressPercent,
    };
  });

  const totalUnlocked = badges.filter((b) => b.isUnlocked).length;
  const strengthUnlocked = badges.filter((b) => b.category === "strength" && b.isUnlocked).length;
  const platesUnlocked = badges.filter((b) => b.subCategory === "plate" && b.isUnlocked).length;
  const platesTotal = badges.filter((b) => b.subCategory === "plate").length;
  const monthlyUnlocked = badges.filter((b) => b.category === "monthly" && b.isUnlocked).length;
  const monthlyTotal = badges.filter((b) => b.category === "monthly").length;
  const yearlyUnlocked = badges.filter((b) => b.category === "yearly" && b.isUnlocked).length;
  const yearlyTotal = badges.filter((b) => b.category === "yearly").length;
  const cardioUnlocked = badges.filter((b) => b.category === "cardio" && b.isUnlocked).length;
  const streakUnlocked = badges.filter((b) => b.category === "streak" && b.isUnlocked).length;

  const recentUnlocks = badges.filter((b) => b.isUnlocked);
  const earnedThisMonth = badges.filter(
    (b) => b.isUnlocked && b.earnedMonthPrefix === currentMonthPrefix
  );

  return {
    totalUnlocked,
    totalAvailable: badges.length,
    strengthUnlocked,
    platesUnlocked,
    platesTotal,
    monthlyUnlocked,
    monthlyTotal,
    yearlyUnlocked,
    yearlyTotal,
    cardioUnlocked,
    streakUnlocked,
    highestWeightKg: Number(highestWeightKg.toFixed(1)),
    highestWeightExercise,
    currentMonthPrefix,
    badges,
    recentUnlocks,
    earnedThisMonth,
  };
}
