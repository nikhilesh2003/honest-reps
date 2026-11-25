import { AppStatePayload, LeaderboardEntry } from "./client-types";
import { DaySummary } from "./types";
import { evaluateMonthlyRecoveryHealth } from "./recovery";

export interface ScoreReasonData {
  title: string;
  subtitle?: string;
  scoreLabel: string;
  badgeText: string;
  isEstimated?: boolean;
  items: Array<{
    label: string;
    points: string;
    detail: string;
  }>;
  formulaNote: string;
}

export function buildDayScoreReason(
  day: DaySummary,
  options?: {
    hidePrivateDetails?: boolean;
    shareDetailsEnabled?: boolean;
    ownerName?: string;
  }
): ScoreReasonData {
  const hidePrivate = Boolean(options?.hidePrivateDetails && !options?.shareDetailsEnabled);
  const who = options?.ownerName ? `${options.ownerName} · ` : "";

  if (day.status === "Rest" || day.isRest) {
    return {
      title: `${who}${day.shortLabel}`,
      subtitle: day.date,
      scoreLabel: "Rest",
      badgeText: "Streak Protected",
      items: [
        {
          label: "Declared Rest Day",
          points: "No penalty",
          detail: "Rest days protect your streak and never count against your effort average.",
        },
      ],
      formulaNote: "Rest days are excluded from active-day effort averages.",
    };
  }

  if (day.status === "No log" || day.effortScore === null) {
    return {
      title: `${who}${day.shortLabel}`,
      subtitle: day.date,
      scoreLabel: day.status === "Calibrating" ? "Calibrating" : "No log",
      badgeText: day.status === "Calibrating" ? "Building Baseline" : "Inactive",
      isEstimated: day.status === "Calibrating",
      items: [
        {
          label: day.status === "Calibrating" ? "Calibration Phase" : "No Activity Logged",
          points: "—",
          detail:
            day.status === "Calibrating"
              ? "First 2 logs establish your personal 50 = usual baseline."
              : "No strength or cardio session recorded on this day.",
        },
      ],
      formulaNote:
        day.status === "Calibrating"
          ? "Log 3 sessions of the same workout to unlock calibrated scoring."
          : "Missing days never generate fake scores.",
    };
  }

  const isEst = day.status === "Calibrating";
  const scoreLabel = `${day.effortScore} / 100`;

  if (hidePrivate) {
    return {
      title: `${who}${day.shortLabel}`,
      subtitle: day.sessionGroups.join(" · ") || day.date,
      scoreLabel,
      badgeText: isEst ? "Est. 5-Category Model" : `50 = Usual · ${day.band}`,
      isEstimated: isEst,
      items: [
        {
          label: "Muscle Focus",
          points: day.sessionGroups.join(" · ") || "Workout",
          detail: `${day.itemCount} logged ${day.itemCount === 1 ? "activity" : "activities"}`,
        },
        {
          label: isEst ? "Estimated Effort" : "Calibrated Effort",
          points: scoreLabel,
          detail: isEst
            ? "Scored using the 5-category provisional model (missing optional metrics excluded)."
            : "Scored relative to their own historical baseline (50 = usual).",
        },
      ],
      formulaNote: "Workout exercises, weights & reps are kept private by this member.",
    };
  }

  if (day.effortBreakdown && day.effortBreakdown.items.length > 0) {
    return {
      title: `${who}${day.shortLabel}`,
      subtitle: day.sessionGroups.join(" · ") || day.date,
      scoreLabel,
      badgeText:
        day.effortBreakdown.mode === "provisional"
          ? "Est. 5-Category Model"
          : `50 = Usual · ${day.band}`,
      isEstimated: day.effortBreakdown.mode === "provisional",
      items: day.effortBreakdown.items,
      formulaNote: day.effortBreakdown.formulaNote,
    };
  }

  return {
    title: `${who}${day.shortLabel}`,
    subtitle: day.sessionGroups.join(" · ") || day.date,
    scoreLabel,
    badgeText: isEst ? "Est. · Calibrating" : `50 = Usual · ${day.band}`,
    isEstimated: isEst,
    items: [
      {
        label: "Session Summary",
        points: scoreLabel,
        detail: `${day.itemCount} ${day.itemCount === 1 ? "activity" : "activities"} (${
          day.sessionGroups.join(" · ") || "Workout"
        })`,
      },
    ],
    formulaNote: isEst
      ? "Provisional day-1 effort score until 3 same-focus sessions are logged."
      : "Compared against personal historical baseline (50 = usual).",
  };
}

export function buildLoggedItemScoreReason(
  item: DaySummary["loggedItems"][number],
  options?: {
    hidePrivateDetails?: boolean;
    shareDetailsEnabled?: boolean;
    ownerName?: string;
  }
): ScoreReasonData {
  const hidePrivate = Boolean(options?.hidePrivateDetails && !options?.shareDetailsEnabled);
  const who = options?.ownerName ? `${options.ownerName} · ` : "";

  if (item.status === "Rest") {
    return {
      title: `${who}${item.title}`,
      subtitle: hidePrivate ? "Rest activity" : item.detail,
      scoreLabel: "Rest",
      badgeText: "Active Recovery",
      items: [
        {
          label: "Rest Day Activity",
          points: "No penalty",
          detail: "Logged on a declared Rest day — never scored against workout days.",
        },
      ],
      formulaNote: "Rest day activities keep your streak safe without affecting averages.",
    };
  }

  if (item.status === "Calibrating" || item.effortScore === null) {
    return {
      title: `${who}${item.title}`,
      subtitle: hidePrivate ? "Calibrating exercise" : item.detail,
      scoreLabel: "Calibrating",
      badgeText: "Baseline Building",
      isEstimated: true,
      items: [
        {
          label: item.kind === "strength" ? "Strength Baseline" : "Cardio Baseline",
          points: "1–2 logs",
          detail: "Your first 2 logs of an exercise/activity build your personal 'usual' work.",
        },
      ],
      formulaNote: "On the 3rd log, this item unlocks its 0–100 score where 50 = your usual.",
    };
  }

  const ratioLabel =
    item.effortScore === 50
      ? "Right at your usual (1.0×)"
      : item.effortScore > 50
      ? "Above your personal usual"
      : "Lighter than your personal usual";

  const reasonItems: ScoreReasonData["items"] = [
    {
      label: item.kind === "strength" ? "Volume vs. Usual" : "Intensity × Time vs. Usual",
      points: `${item.effortScore} / 100`,
      detail: ratioLabel,
    },
  ];

  if (item.splits && item.splits.length > 1) {
    reasonItems.unshift({
      label: `${item.splits.length} Splits Combined`,
      points: `${item.splits.reduce((acc, s) => acc + s.minutes, 0)} min total`,
      detail: item.splits
        .map((s) => `Split ${s.splitNumber}: ${s.minutes}m (${s.kcal} kcal)`)
        .join(" · "),
    });
  }

  return {
    title: `${who}${item.title}`,
    subtitle: hidePrivate ? "Workout item" : item.detail,
    scoreLabel: `${item.effortScore} / 100`,
    badgeText: "50 = Usual Baseline",
    items: reasonItems,
    formulaNote:
      item.kind === "strength"
        ? "Scored from sum(weight × reps) compared to your prior sessions of this exercise."
        : "Scored once per day from combined daily cardio work (duration × HR or pace) compared to prior days.",
  };
}

export function buildLeaderboardScoreReason(
  entry: LeaderboardEntry,
  period: "today" | "month"
): ScoreReasonData {
  const who = entry.isMe ? "You" : entry.name;

  if (period === "today") {
    const syntheticDay: DaySummary = {
      date: "Today",
      dayLetter: "T",
      shortLabel: "Today",
      sessionGroups: entry.todayGroups,
      isRest: entry.todayStatus === "Rest",
      status: entry.todayStatus,
      effortScore: entry.todayScore,
      band:
        entry.todayScore === null
          ? entry.todayStatus === "Rest"
            ? "Rest"
            : "No log"
          : entry.todayScore >= 90
          ? "Very high"
          : entry.todayScore >= 75
          ? "High"
          : entry.todayScore >= 65
          ? "Steady"
          : entry.todayScore >= 50
          ? "Low"
          : "Very low",
      itemCount: entry.todayItemCount ?? (entry.todayGroups.length || 1),
      loggedItems: [],
      effortBreakdown: entry.todayBreakdown,
    };

    return buildDayScoreReason(syntheticDay, {
      hidePrivateDetails: !entry.isMe,
      shareDetailsEnabled: entry.shareWorkoutDetails,
      ownerName: who,
    });
  }

  if (entry.monthEffort === null) {
    return {
      title: `${who} · This Month`,
      subtitle: `@${entry.username}`,
      scoreLabel: entry.isMonthCalibrating ? "Calibrating" : "No log",
      badgeText: entry.isMonthCalibrating ? "Calibrating" : "Unranked",
      isEstimated: entry.isMonthCalibrating,
      items: [
        {
          label: "Monthly Average",
          points: "—",
          detail: `${entry.activeDaysThisMonth} active ${
            entry.activeDaysThisMonth === 1 ? "day" : "days"
          } logged this month.`,
        },
      ],
      formulaNote: "Average effort across active workout days only (Rest days excluded).",
    };
  }

  return {
    title: `${who} · This Month`,
    subtitle: `@${entry.username}`,
    scoreLabel: `${entry.monthEffort} / 100`,
    badgeText: entry.isMonthCalibrating ? "Est. Monthly Average" : "Calibrated Monthly Average",
    isEstimated: entry.isMonthCalibrating,
    items: [
      {
        label: "Active days averaged",
        points: `${entry.activeDaysThisMonth}d`,
        detail: "Only active training days count toward your monthly average.",
      },
      {
        label: "Rest days",
        points: `${entry.restDaysThisMonth ?? 0}d`,
        detail: "Rest days are never penalized and protect your streak.",
      },
      {
        label: "Current streak",
        points: `${entry.currentStreak}d`,
        detail: "Includes 3-day streak protection grace window.",
      },
    ],
    formulaNote: entry.isMonthCalibrating
      ? `Mean of ${entry.activeDaysThisMonth} provisional day scores this month.`
      : `Mean of ${entry.activeDaysThisMonth} scored active days this month (50 = usual).`,
  };
}

export function buildMonthScoreReason(state: AppStatePayload): ScoreReasonData {
  const { monthStats, realTodayIso } = state;
  const now = new Date(realTodayIso);
  const dayOfMonth = now.getDate() || 1;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() || 30;

  const restDates = state.summaries365
    .filter((d) => d.date.startsWith(monthStats.monthPrefix) && d.isRest)
    .map((d) => d.date);

  const recoveryHealth = evaluateMonthlyRecoveryHealth({
    activeDays: monthStats.activeDaysThisMonth,
    restDays: monthStats.restDaysThisMonth,
    dayOfMonth,
    daysInMonth,
    restDates,
  });

  return {
    title: "This Month",
    subtitle: `${monthStats.monthPrefix} · Effort & Recovery`,
    scoreLabel: monthStats.monthEffort !== null ? `${monthStats.monthEffort} / 100` : "—",
    badgeText: monthStats.isMonthCalibrating
      ? "Est. Monthly Average"
      : "Calibrated Monthly Average",
    isEstimated: monthStats.isMonthCalibrating,
    items: [
      {
        label: "Active days averaged",
        points: `${monthStats.activeDaysThisMonth}d`,
        detail: "Only active training days count toward your monthly effort average.",
      },
      {
        label: "Rest days logged",
        points: `${monthStats.restDaysThisMonth}d`,
        detail:
          "Up to 2 consecutive & 3 rest days/week protect your streak without affecting effort scores.",
      },
      {
        label: `Monthly Recovery (${recoveryHealth.badge})`,
        points: `${recoveryHealth.projectedRestDays}d/mo`,
        detail: `${recoveryHealth.detail} Optimal: 8–12 rest days/month (max 2 consecutive · max 3/week).`,
      },
      {
        label: "Muscle Recovery Timeline",
        points: "48–72h / 24–48h",
        detail:
          "Large muscle groups (Legs, Chest, Back) require 48–72h. Small muscle groups (Shoulders, Arms, Core) recover in 24–48h.",
      },
    ],
    formulaNote: `Mean of ${monthStats.activeDaysThisMonth} scored active days this month. Healthy strength training balances progressive overload with 8–12 rest days/month.`,
  };
}
