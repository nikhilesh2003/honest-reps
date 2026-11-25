"use client";

import { useMemo, useState } from "react";
import { HeartPulse, Trophy } from "lucide-react";
import { AppStatePayload } from "@/lib/client-types";
import { estimateOneRepMax, formatDistance, formatWeight, getExerciseLoadMode } from "@/lib/effort";
import { computeUserMilestones } from "@/lib/milestones";
import {
  buildDayScoreReason,
  buildMonthScoreReason,
  ScoreReasonData,
} from "@/lib/score-reason";
import {
  evaluateMonthlyRecoveryHealth,
  getMuscleRecoveryStatus,
} from "@/lib/recovery";
import { ScoreReasonSheet } from "../ui/ScoreReasonSheet";
import { MilestoneBadgesCard } from "../ui/MilestoneBadgesCard";

interface AnalyticsTabProps {
  state: AppStatePayload;
}

const SPLIT_GREENS = ["#10e760", "#25d658", "#1ca645", "#145a27", "#0a3318", "#3f3f46"];

export function AnalyticsTab({ state }: AnalyticsTabProps) {
  const [scoreReason, setScoreReason] = useState<ScoreReasonData | null>(null);
  const [showAllAwards, setShowAllAwards] = useState(false);
  const exerciseNames = useMemo(
    () => Object.keys(state.strengthProgression),
    [state.strengthProgression]
  );
  const [selectedEx, setSelectedEx] = useState<string>(
    exerciseNames.includes("Bench Press") ? "Bench Press" : exerciseNames[0] || ""
  );

  const muscleGroupNames = useMemo(
    () => Object.keys(state.muscleGroupProgression || {}),
    [state.muscleGroupProgression]
  );
  const [selectedMg, setSelectedMg] = useState<string>(
    muscleGroupNames.includes("Chest") ? "Chest" : muscleGroupNames[0] || ""
  );

  const unit = state.profile.weightUnit;
  const progression = state.strengthProgression[selectedEx] || [];
  const mgProgression = (state.muscleGroupProgression || {})[selectedMg] || [];
  const maxMgVolume = Math.max(...mgProgression.map((m) => m.totalVolume), 1);
  const latestMgVol = mgProgression[mgProgression.length - 1]?.totalVolume ?? 0;
  const firstMgVol = mgProgression[0]?.totalVolume ?? 0;
  const mgVolDelta = Math.round(latestMgVol - firstMgVol);

  const isSelectedAssisted = getExerciseLoadMode(selectedEx) === "assisted";

  const maxSessionWeight = Math.max(
    ...progression.map((p) => p.maxWeightKg),
    1
  );
  const latestWeightEx = progression[progression.length - 1]?.maxWeightKg ?? 0;
  const firstWeightEx = progression[0]?.maxWeightKg ?? 0;
  const weightGain = isSelectedAssisted
    ? firstWeightEx > 0 && latestWeightEx > 0
      ? firstWeightEx - latestWeightEx
      : 0
    : latestWeightEx - firstWeightEx;

  const selectedExLogs = useMemo(() => {
    return state.recentExerciseLogs.filter(
      (l) => l.exerciseName.trim().toLowerCase() === selectedEx.trim().toLowerCase()
    );
  }, [state.recentExerciseLogs, selectedEx]);

  const allTimePr = useMemo(() => {
    if (!selectedEx || selectedExLogs.length === 0) return null;
    const allSets = selectedExLogs.flatMap((l) => l.sets || []);
    const isAssisted = getExerciseLoadMode(selectedEx) === "assisted";

    if (isAssisted) {
      const validWeights = allSets.map((s) => Number(s.weightKg) || 0).filter((w) => w > 0);
      const bestWeight = validWeights.length > 0 ? Math.min(...validWeights) : 0;
      const valid1RMs = allSets
        .map((s) => estimateOneRepMax(Number(s.weightKg) || 0, Number(s.reps) || 0, selectedEx))
        .filter((r) => r > 0);
      const best1RM = valid1RMs.length > 0 ? Math.min(...valid1RMs) : 0;
      return { bestWeight, best1RM, isAssisted: true };
    }

    const bestWeight = allSets.reduce((max, s) => Math.max(max, Number(s.weightKg) || 0), 0);
    const best1RM = allSets.reduce(
      (max, s) => Math.max(max, estimateOneRepMax(Number(s.weightKg) || 0, Number(s.reps) || 0, selectedEx)),
      0
    );
    return { bestWeight, best1RM, isAssisted: false };
  }, [selectedEx, selectedExLogs]);

  // Weight trend sparkline geometry (FR-26)
  const weightPoints = state.weightLogs.slice(-10);
  const minW = Math.min(...weightPoints.map((w) => w.weightKg), 70) - 0.5;
  const maxW = Math.max(...weightPoints.map((w) => w.weightKg), 75) + 0.5;
  const svgPoints = weightPoints
    .map((w, idx) => {
      const x =
        weightPoints.length <= 1
          ? 150
          : 12 + (idx / (weightPoints.length - 1)) * 276;
      const y = 78 - ((w.weightKg - minW) / Math.max(0.1, maxW - minW)) * 64;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const firstBodyW = weightPoints[0]?.weightKg;
  const lastBodyW = weightPoints[weightPoints.length - 1]?.weightKg;
  const bodyDelta =
    firstBodyW !== undefined && lastBodyW !== undefined
      ? Number((lastBodyW - firstBodyW).toFixed(1))
      : null;

  const muscleRecoveryList = useMemo(() => {
    const trackedGroups = ["Legs", "Chest", "Back", "Shoulders", "Arms", "Core"];
    return trackedGroups.map((group) =>
      getMuscleRecoveryStatus(group, state.recentExerciseLogs, state.realTodayIso)
    );
  }, [state.recentExerciseLogs, state.realTodayIso]);

  const monthlyRecovery = useMemo(() => {
    const now = new Date(state.realTodayIso);
    const dayOfMonth = now.getDate() || 1;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() || 30;
    const restDates = state.summaries365
      .filter((d) => d.date.startsWith(state.monthStats.monthPrefix) && d.isRest)
      .map((d) => d.date);
    return evaluateMonthlyRecoveryHealth({
      activeDays: state.monthStats.activeDaysThisMonth,
      restDays: state.monthStats.restDaysThisMonth,
      dayOfMonth,
      daysInMonth,
      restDates,
    });
  }, [state.monthStats, state.summaries365, state.realTodayIso]);

  const milestoneSummary = useMemo(() => {
    return (
      state.milestones ??
      computeUserMilestones({
        exerciseLogs: state.recentExerciseLogs,
        cardioLogs: state.recentCardioLogs,
        summaries365: state.summaries365,
        currentStreak: state.monthStats.currentStreak,
        weightUnit: state.profile.weightUnit,
        todayIso: state.realTodayIso,
      })
    );
  }, [
    state.milestones,
    state.recentExerciseLogs,
    state.recentCardioLogs,
    state.summaries365,
    state.monthStats.currentStreak,
    state.profile.weightUnit,
    state.realTodayIso,
  ]);

  const progressReason: ScoreReasonData = useMemo(() => {
    const isCal = state.progressAndConsistency.progressPercent === null;
    return {
      title: "Personal Progress",
      subtitle: "Tracked per-exercise & per-activity",
      scoreLabel: isCal
        ? "Calibrating"
        : `${state.progressAndConsistency.progressPercent! > 0 ? "+" : ""}${state.progressAndConsistency.progressPercent}%`,
      badgeText: isCal ? "Building Baseline" : "Same-Exercise Delta",
      isEstimated: isCal,
      items: [
        {
          label: "Same-Exercise Isolation",
          points: "Per Exercise",
          detail:
            "Strength progress strictly compares identical exercises (e.g. Bench Press vs. previous Bench Press). Leg workouts are never compared against Chest or upper body sessions.",
        },
        {
          label: "Assisted Exercises",
          points: "Less Assist = PR",
          detail:
            "For counterweight movements (like Assisted Pull-Ups), lower assistance weight (e.g. 65 kg vs 75 kg) is recognized as strength gain and personal records.",
        },
        {
          label: "Consolidated Daily Splits",
          points: "Daily Total",
          detail:
            "Multiple walks logged in a single day are consolidated into the day's total walk volume. Light warm-up walks are never penalized against long cardio sessions.",
        },
        {
          label: "Baseline Requirement",
          points: isCal ? "1–2 Sessions" : "Calibrated",
          detail: isCal
            ? "Requires multiple completed sessions of the same exercise to establish your personal 50 = usual baseline."
            : "Computed across exercises with completed sessions in your history.",
        },
      ],
      formulaNote: "Progress = ((Latest Work - Baseline Work) / Baseline Work) × 100% per exercise.",
    };
  }, [state.progressAndConsistency.progressPercent]);

  return (
    <div className="space-y-4 pb-6">
      <div className="pt-1">
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white">
          Analytics
        </h1>
      </div>

      {/* Milestone Awards Snapshot (Tap to expand Plates & Monthly Medals) */}
      <button
        type="button"
        onClick={() => setShowAllAwards((prev) => !prev)}
        className="apple-card w-full px-3.5 py-3 flex items-center justify-between text-left hover:border-white/20 active:scale-[0.99] transition-all cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-[#10e760] shrink-0">
            <Trophy className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-[13px] font-medium text-white tracking-tight">
              Awards · {milestoneSummary.totalUnlocked} of {milestoneSummary.totalAvailable}
            </div>
            <div className="text-[11px] text-[#86868b]">
              {milestoneSummary.monthlyUnlocked} Monthly · {milestoneSummary.yearlyUnlocked} Yearly · {milestoneSummary.platesUnlocked}/{milestoneSummary.platesTotal} Plates
            </div>
          </div>
        </div>
        <span className="text-[11px] font-mono text-[#86868b] tabular-nums">
          {Math.round((milestoneSummary.totalUnlocked / Math.max(1, milestoneSummary.totalAvailable)) * 100)}%
        </span>
      </button>

      {showAllAwards && <MilestoneBadgesCard summary={milestoneSummary} initialFilter="plates" />}

      {/* FR-23: Today & This Month Effort + Active & Rest days */}
      <div className="grid grid-cols-2 gap-3">
        <div className="apple-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            Today
          </div>
          <div className="mt-1.5">
            {state.todaySummary.effortScore !== null ? (
              <button
                type="button"
                onClick={() =>
                  setScoreReason(
                    buildDayScoreReason(state.todaySummary, {
                      hidePrivateDetails: false,
                      shareDetailsEnabled: true,
                    })
                  )
                }
                className={`text-[36px] font-bold tabular-nums leading-none hover:opacity-80 active:scale-95 transition-all cursor-pointer ${
                  state.todaySummary.status === "Calibrating"
                    ? "text-amber-400"
                    : "text-[#10e760]"
                }`}
              >
                {state.todaySummary.effortScore}
              </button>
            ) : (
              <div className="text-[18px] font-semibold text-[#a1a1a6] leading-tight pt-1">
                {state.todaySummary.status === "No log"
                  ? "No activity"
                  : state.todaySummary.status}
              </div>
            )}
          </div>
          <div className="text-[12px] text-[#86868b] mt-2">
            {state.todaySummary.status === "Calibrating"
              ? "Est. · Calibrating"
              : state.todaySummary.band}
          </div>
        </div>

        <div className="apple-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            This Month
          </div>
          <div className="mt-1.5">
            {state.monthStats.monthEffort !== null ? (
              <button
                type="button"
                onClick={() => setScoreReason(buildMonthScoreReason(state))}
                className="text-[36px] font-bold text-[#10e760] tabular-nums leading-none hover:opacity-80 active:scale-95 transition-all cursor-pointer"
                title="Tap for Monthly Effort & Recovery breakdown"
              >
                {state.monthStats.monthEffort}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setScoreReason(buildMonthScoreReason(state))}
                className="text-[18px] font-semibold text-amber-400 leading-tight pt-1 hover:underline cursor-pointer"
                title="Tap for Monthly Effort & Recovery breakdown"
              >
                {state.monthStats.isMonthCalibrating ? "Calibrating" : "—"}
              </button>
            )}
          </div>
          <div className="text-[12px] text-[#86868b] mt-2 tabular-nums">
            {state.monthStats.activeDaysThisMonth} active · {state.monthStats.restDaysThisMonth} rest
          </div>
        </div>
      </div>

      {/* Apple-Style Minimal Recovery & Readiness Card */}
      <button
        type="button"
        onClick={() => setScoreReason(buildMonthScoreReason(state))}
        className="apple-card p-4 text-left w-full hover:border-white/20 active:scale-[0.99] transition-all cursor-pointer block"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-[#10e760]/12 flex items-center justify-center text-[#10e760]">
              <HeartPulse className="w-3.5 h-3.5" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Monthly Recovery
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border ${
              monthlyRecovery.status === "optimal"
                ? "bg-[#10e760]/10 text-[#10e760] border-[#10e760]/25"
                : monthlyRecovery.status === "risk-overtraining"
                ? "bg-[#ff453a]/12 text-[#ff453a] border-[#ff453a]/30"
                : "bg-[#ffd60a]/10 text-[#ffd60a] border-[#ffd60a]/25"
            }`}
          >
            {monthlyRecovery.badge}
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-3 mb-2">
          <div>
            <span className="text-[24px] font-bold text-white tabular-nums">
              {state.monthStats.restDaysThisMonth}
            </span>
            <span className="text-[13px] text-[#86868b] ml-1.5">
              rest days this month
            </span>
          </div>
          <span className="text-[11px] text-[#86868b] tabular-nums">
            Target: 8–12d/mo
          </span>
        </div>

        {/* Minimal Apple-Style Segmented Bar */}
        <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden flex mb-3.5">
          <div
            className="h-full bg-white/[0.3] rounded-l-full transition-all"
            style={{
              width: `${Math.min(
                100,
                (state.monthStats.activeDaysThisMonth / 30) * 100
              )}%`,
            }}
          />
          <div
            className="h-full bg-[#10e760] rounded-r-full transition-all"
            style={{
              width: `${Math.min(
                100,
                (state.monthStats.restDaysThisMonth / 30) * 100
              )}%`,
            }}
          />
        </div>

        {/* Minimal 3-Color Muscle Readiness Chips (Red · Yellow · Green) */}
        <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-white/[0.06]">
          {muscleRecoveryList.map((m) => {
            const zoneStyle =
              m.recoveryZone === "red"
                ? {
                    chip: "bg-[#ff453a]/[0.07] border border-[#ff453a]/25",
                    dot: "bg-[#ff453a]",
                    text: "text-[#ff453a]",
                  }
                : m.recoveryZone === "yellow"
                ? {
                    chip: "bg-[#ffd60a]/[0.07] border border-[#ffd60a]/25",
                    dot: "bg-[#ffd60a]",
                    text: "text-[#ffd60a]",
                  }
                : {
                    chip: "bg-[#10e760]/[0.05] border border-[#10e760]/20",
                    dot: "bg-[#10e760]",
                    text: "text-[#10e760]",
                  };
            return (
              <div
                key={m.name}
                className={`px-2.5 py-1.5 rounded-xl flex items-center justify-between text-[11px] ${zoneStyle.chip}`}
              >
                <span className="text-white font-medium truncate">{m.name}</span>
                <span className="flex items-center gap-1 shrink-0 ml-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${zoneStyle.dot}`} />
                  <span className={`text-[10px] font-medium tabular-nums ${zoneStyle.text}`}>
                    {m.recommendedHours}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Minimal 3-Color Legend */}
        <div className="flex items-center justify-between pt-2.5 text-[10px] text-[#86868b]">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ff453a]" />
            Rest (&lt;24h)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffd60a]" />
            Recovering
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10e760]" />
            Ready
          </span>
        </div>
      </button>

      {/* 3-Metric Strip: Effort · Progress · Consistency */}
      <div className="apple-card p-3.5 grid grid-cols-3 divide-x divide-white/[0.08]">
        <div className="text-center px-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            Effort
          </div>
          <div
            className={`text-[20px] font-bold tabular-nums mt-0.5 ${
              state.todaySummary.status === "Calibrating"
                ? "text-amber-400"
                : "text-[#10e760]"
            }`}
          >
            {state.todaySummary.effortScore !== null
              ? state.todaySummary.effortScore
              : state.todaySummary.status === "Rest"
              ? "Rest"
              : "—"}
          </div>
          <div className="text-[11px] text-[#86868b] mt-0.5">
            {state.todaySummary.status === "Calibrating"
              ? "Est. · Day 1"
              : state.todaySummary.band !== "No log"
              ? state.todaySummary.band
              : "Effort score"}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setScoreReason(progressReason)}
          className="text-center px-1.5 hover:opacity-80 active:scale-95 transition-all cursor-pointer block"
          title="Tap to see how Progress is evaluated"
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            Progress
          </div>
          <div
            className={`text-[20px] font-bold tabular-nums mt-0.5 ${
              state.progressAndConsistency.progressPercent === null
                ? "text-amber-400 text-[14px] pt-1"
                : state.progressAndConsistency.progressPercent >= 0
                ? "text-[#10e760]"
                : "text-white"
            }`}
          >
            {state.progressAndConsistency.progressPercent === null
              ? "Calibrating"
              : `${state.progressAndConsistency.progressPercent > 0 ? "+" : ""}${state.progressAndConsistency.progressPercent}%`}
          </div>
          <div className="text-[11px] text-[#86868b] mt-0.5">
            {state.progressAndConsistency.progressPercent === null ? "Building baseline" : "vs. baseline"}
          </div>
        </button>

        <div className="text-center px-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            Consistency
          </div>
          <div className="text-[20px] font-bold text-white tabular-nums mt-0.5">
            {state.progressAndConsistency.consistencyWindowDays > 0
              ? `${state.progressAndConsistency.consistencyPercent}%`
              : "—"}
          </div>
          <div className="text-[11px] text-[#86868b] mt-0.5">
            {state.progressAndConsistency.consistencyWindowDays > 0
              ? `${state.progressAndConsistency.consistencyWindowDays}d window`
              : "No data"}
          </div>
        </div>
      </div>

      {/* FR-24: Per-Exercise Strength Progression — Sliding Bars Style */}
      <div className="apple-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Strength Progression
            </div>
            <div className="flex items-center gap-4 mt-1">
              <div>
                <div className="text-[10px] uppercase font-semibold text-[#86868b]">
                  {isSelectedAssisted ? "Latest Assist" : "Latest"}
                </div>
                <div className="text-[19px] font-bold text-white tabular-nums">
                  {selectedEx ? formatWeight(latestWeightEx, unit) : "—"}
                  {weightGain !== 0 && (
                    <span className="text-[12px] font-medium text-[#10e760] ml-1.5">
                      {weightGain > 0 ? "+" : ""}
                      {formatWeight(weightGain, unit)}
                      {isSelectedAssisted ? " less assist" : ""}
                    </span>
                  )}
                </div>
              </div>

              {allTimePr && allTimePr.best1RM > 0 && (
                <div className="border-l border-white/10 pl-4">
                  <div className="text-[10px] uppercase font-semibold text-[#86868b] flex items-center gap-1">
                    <span>{isSelectedAssisted ? "Est. 1RM Assist" : "Est. 1RM Best"}</span>
                    <span className="text-amber-400 font-bold">★</span>
                  </div>
                  <div className="text-[19px] font-bold text-amber-300 font-mono tabular-nums">
                    {formatWeight(allTimePr.best1RM, unit)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Exercise Selector Pills */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {exerciseNames.slice(0, 8).map((name) => {
            const active = selectedEx === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setSelectedEx(name)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer border ${
                  active
                    ? "bg-[#10e760] text-black border-[#10e760]"
                    : "bg-white/[0.04] text-[#86868b] border-white/[0.08] hover:text-white"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>

        {/* Sliding Vertical Pill Bars */}
        {progression.length > 0 ? (
          <div className="grid grid-cols-6 gap-2 pt-1">
            {progression.map((pt, idx) => {
              const isLatest = idx === progression.length - 1;
              const pct = isSelectedAssisted
                ? (() => {
                    const positiveWeights = progression.map((p) => p.maxWeightKg).filter((w) => w > 0);
                    const minAssist = positiveWeights.length > 0 ? Math.min(...positiveWeights) : 1;
                    return Math.max(22, Math.min(100, Math.round((minAssist / Math.max(pt.maxWeightKg, 1)) * 100)));
                  })()
                : Math.max(22, Math.round((pt.maxWeightKg / maxSessionWeight) * 100));
              const shade = isLatest
                ? "var(--effort-very-high)"
                : idx >= progression.length - 2
                ? "var(--effort-high)"
                : idx >= progression.length - 4
                ? "var(--effort-steady)"
                : "var(--effort-low)";
              return (
                <div key={`${pt.date}-${idx}`} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-full h-[96px] rounded-[12px] p-[2px] flex flex-col justify-end bg-[#050506] border ${
                      isLatest ? "border-[#10e760]/60" : "border-white/[0.08]"
                    }`}
                  >
                    <div
                      className="w-full rounded-[9px] flex items-start justify-center pt-1.5 transition-all duration-500"
                      style={{ height: `${pct}%`, backgroundColor: shade }}
                    >
                      <span
                        className={`text-[9px] font-bold tabular-nums leading-none ${
                          idx >= progression.length - 3 ? "text-black" : "text-[#bbf7d0]"
                        }`}
                      >
                        {unit === "lb"
                          ? Math.round(pt.maxWeightKg * 2.20462)
                          : pt.maxWeightKg}
                      </span>
                    </div>
                  </div>
                  <span className="text-[9px] text-[#86868b] tabular-nums truncate max-w-full">
                    {pt.shortDate}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-[13px] text-[#86868b]">
            Log strength sessions to track progression.
          </div>
        )}
      </div>

      {/* Strength Progress by Muscle Group */}
      <div className="apple-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Muscle Group Strength
            </div>
            <div className="text-[20px] font-bold text-white tabular-nums mt-0.5">
              {selectedMg ? `${Math.round(latestMgVol).toLocaleString()} ${unit} vol` : "—"}
              {mgVolDelta !== 0 && (
                <span className="text-[13px] font-medium text-[#10e760] ml-2">
                  {mgVolDelta > 0 ? "+" : ""}
                  {mgVolDelta.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {muscleGroupNames.map((mg) => {
            const active = selectedMg === mg;
            return (
              <button
                key={mg}
                type="button"
                onClick={() => setSelectedMg(mg)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer border ${
                  active
                    ? "bg-[#10e760] text-black border-[#10e760]"
                    : "bg-white/[0.04] text-[#86868b] border-white/[0.08] hover:text-white"
                }`}
              >
                {mg}
              </button>
            );
          })}
        </div>

        {mgProgression.length > 0 ? (
          <div className="grid grid-cols-6 gap-2 pt-1">
            {mgProgression.map((pt, idx) => {
              const isLatest = idx === mgProgression.length - 1;
              const pct = Math.max(22, Math.round((pt.totalVolume / maxMgVolume) * 100));
              const shade = isLatest
                ? "var(--effort-very-high)"
                : idx >= mgProgression.length - 2
                ? "var(--effort-high)"
                : idx >= mgProgression.length - 4
                ? "var(--effort-steady)"
                : "var(--effort-low)";
              return (
                <div key={`${pt.date}-${idx}`} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-full h-[96px] rounded-[12px] p-[2px] flex flex-col justify-end bg-[#050506] border ${
                      isLatest ? "border-[#10e760]/60" : "border-white/[0.08]"
                    }`}
                  >
                    <div
                      className="w-full rounded-[9px] flex items-start justify-center pt-1.5 transition-all duration-500"
                      style={{ height: `${pct}%`, backgroundColor: shade }}
                    >
                      <span
                        className={`text-[9px] font-bold tabular-nums leading-none ${
                          idx >= mgProgression.length - 3 ? "text-black" : "text-[#bbf7d0]"
                        }`}
                      >
                        {pt.totalVolume >= 1000
                          ? `${(pt.totalVolume / 1000).toFixed(1)}k`
                          : Math.round(pt.totalVolume)}
                      </span>
                    </div>
                  </div>
                  <span className="text-[9px] text-[#86868b] tabular-nums truncate max-w-full">
                    {pt.shortDate}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-[13px] text-[#86868b]">
            Log strength sessions to track muscle group volume.
          </div>
        )}
      </div>

      {/* FR-25: Cardio Totals (distinguishing Logged vs Estimated calories) */}
      <div className="apple-card p-4 space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
          Cardio · This Month
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="text-[11px] text-[#86868b]">Distance</div>
            <div className="text-[20px] font-bold text-white tabular-nums mt-0.5">
              {formatDistance(state.cardioTotals.totalDistanceKm, unit)}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="text-[11px] text-[#86868b]">Duration</div>
            <div className="text-[20px] font-bold text-white tabular-nums mt-0.5">
              {state.cardioTotals.totalMinutes} min
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="text-[11px] text-[#86868b]">Logged Energy</div>
            <div className="text-[18px] font-bold text-[#10e760] tabular-nums mt-0.5">
              {state.cardioTotals.loggedKcal.toLocaleString()} kcal
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#86868b]">Energy</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.08] text-[#a1a1a6]">
                Estimated
              </span>
            </div>
            <div className="text-[18px] font-bold text-[#d1d1d6] tabular-nums mt-0.5">
              {state.cardioTotals.estimatedKcal.toLocaleString()} kcal
            </div>
          </div>
        </div>
      </div>

      {/* FR-26: Weight Trend Chart */}
      <div className="apple-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Weight Trend
            </div>
            <div className="text-[20px] font-bold text-white tabular-nums mt-0.5">
              {lastBodyW !== undefined ? formatWeight(lastBodyW, unit) : "—"}
              {bodyDelta !== null && bodyDelta !== 0 && (
                <span className="text-[13px] font-medium text-[#10e760] ml-2">
                  {bodyDelta > 0 ? "+" : ""}
                  {formatWeight(bodyDelta, unit)}
                </span>
              )}
            </div>
          </div>
          <span className="text-[11px] text-[#86868b] tabular-nums">
            {weightPoints.length} entries
          </span>
        </div>

        {weightPoints.length >= 2 ? (
          <svg viewBox="0 0 300 92" className="w-full h-24 overflow-visible">
            <polyline
              fill="none"
              stroke="#10e760"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={svgPoints}
            />
            {weightPoints.map((w, idx) => {
              const x = 12 + (idx / (weightPoints.length - 1)) * 276;
              const y = 78 - ((w.weightKg - minW) / Math.max(0.1, maxW - minW)) * 64;
              return (
                <circle
                  key={w.id}
                  cx={x}
                  cy={y}
                  r={idx === weightPoints.length - 1 ? 4 : 2.5}
                  fill={idx === weightPoints.length - 1 ? "#10e760" : "#1ca645"}
                />
              );
            })}
          </svg>
        ) : (
          <div className="py-4 text-center text-[12px] text-[#86868b]">
            Add weight entries in Profile to chart trend.
          </div>
        )}
      </div>

      {/* FR-27: Muscle Group Split */}
      <div className="apple-card p-4 space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
          Muscle Split
        </div>
        {state.muscleGroupSplit.length > 0 ? (
          <>
            <div className="w-full h-3 rounded-full overflow-hidden flex gap-[2px] bg-black">
              {state.muscleGroupSplit.map((m, idx) => (
                <div
                  key={m.group}
                  style={{
                    width: `${m.percent}%`,
                    backgroundColor: SPLIT_GREENS[idx % SPLIT_GREENS.length],
                  }}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {state.muscleGroupSplit.map((m, idx) => (
                <div
                  key={m.group}
                  className="flex items-center justify-between text-[13px] px-2.5 py-1.5 rounded-xl bg-white/[0.02]"
                >
                  <span className="flex items-center gap-2 text-[#d1d1d6]">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: SPLIT_GREENS[idx % SPLIT_GREENS.length],
                      }}
                    />
                    {m.group}
                  </span>
                  <span className="font-semibold text-white tabular-nums">
                    {m.percent}%
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-[13px] text-[#86868b]">No sessions this month yet.</div>
        )}
      </div>

      {/* FR-27: Monthly Calendar marking Workout, Rest, Calibrating, and No Log days */}
      <div className="apple-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            Month Calendar
          </span>
          <span className="text-[11px] text-[#86868b] tabular-nums">
            {state.monthStats.monthPrefix}
          </span>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {state.monthCalendar.map((day) => {
            const dayNum = Number(day.date.slice(8));
            const styleClass =
              day.status === "Scored"
                ? "bg-[#1ca645]/25 border-[#10e760]/60 text-[#10e760]"
                : day.status === "Calibrating"
                ? "tile-calibrating text-amber-300"
                : day.status === "Rest"
                ? "tile-rest text-[#a1a1a6]"
                : "bg-[#070709] border-white/[0.07] text-[#525257]";

            return (
              <div
                key={day.date}
                title={`${day.date} · ${day.band}`}
                className={`aspect-square rounded-xl border flex flex-col items-center justify-center text-[11px] font-semibold tabular-nums ${styleClass}`}
              >
                <span>{dayNum}</span>
                {day.effortScore !== null && (
                  <span className="text-[8px] font-medium opacity-80 leading-none mt-0.5">
                    {day.effortScore}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-[10px] text-[#86868b]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#1ca645]/50 border border-[#10e760]/60" />
            Workout
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded tile-calibrating" />
            Calibrating
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded tile-rest" />
            Rest
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#070709] border border-white/15" />
            No log
          </span>
        </div>
      </div>

      <ScoreReasonSheet reason={scoreReason} onClose={() => setScoreReason(null)} />
    </div>
  );
}
