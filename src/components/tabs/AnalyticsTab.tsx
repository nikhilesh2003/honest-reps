"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, HeartPulse, Search, Trophy } from "lucide-react";
import { AppStatePayload } from "@/lib/client-types";
import { DaySummary } from "@/lib/types";
import {
  addDaysIso,
  buildAlignedMonthCalendar,
  estimateOneRepMax,
  formatDistance,
  formatFullDate,
  formatShortMonthDay,
  formatWeight,
  getExerciseLoadMode,
} from "@/lib/effort";
import { computeUserMilestones } from "@/lib/milestones";
import {
  buildDayScoreReason,
  buildLoggedItemScoreReason,
  buildMonthScoreReason,
  ScoreReasonData,
} from "@/lib/score-reason";
import {
  evaluateMonthlyRecoveryHealth,
  getMuscleRecoveryStatus,
} from "@/lib/recovery";
import { BottomSheet } from "../ui/BottomSheet";
import { ScoreReasonSheet } from "../ui/ScoreReasonSheet";
import { MilestoneBadgesCard } from "../ui/MilestoneBadgesCard";

interface AnalyticsTabProps {
  state: AppStatePayload;
}

const SPLIT_GREENS = ["#30d158", "#2ab356", "#228b46", "#175c31", "#103820", "#3a3a3c"];

type StrengthMetric = "weight" | "1rm" | "volume";
type WeightRange = "30d" | "90d" | "all";

export function AnalyticsTab({ state }: AnalyticsTabProps) {
  const [scoreReason, setScoreReason] = useState<ScoreReasonData | null>(null);
  const [showAllAwards, setShowAllAwards] = useState(false);
  const [strengthMetric, setStrengthMetric] = useState<StrengthMetric>("weight");
  const [exSearch, setExSearch] = useState("");
  const [selectedBarIdx, setSelectedBarIdx] = useState<number | null>(null);
  const [weightRange, setWeightRange] = useState<WeightRange>("90d");
  const [selectedWeightIdx, setSelectedWeightIdx] = useState<number | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<string>(state.monthStats.monthPrefix);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<DaySummary | null>(null);

  const exerciseNames = useMemo(
    () => Object.keys(state.strengthProgression),
    [state.strengthProgression]
  );
  const filteredExerciseNames = useMemo(() => {
    const q = exSearch.trim().toLowerCase();
    if (!q) return exerciseNames;
    return exerciseNames.filter((n) => n.toLowerCase().includes(q));
  }, [exerciseNames, exSearch]);

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

  const getPointMetricKgOrVol = (pt: (typeof progression)[number]) => {
    if (strengthMetric === "1rm") return pt.best1RMKg || 0;
    if (strengthMetric === "volume") return pt.totalVolume || 0;
    return pt.maxWeightKg || 0;
  };

  const maxSessionMetric = Math.max(
    ...progression.map((p) => getPointMetricKgOrVol(p)),
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
      (max, s) =>
        Math.max(
          max,
          estimateOneRepMax(Number(s.weightKg) || 0, Number(s.reps) || 0, selectedEx)
        ),
      0
    );
    return { bestWeight, best1RM, isAssisted: false };
  }, [selectedEx, selectedExLogs]);

  const weightPoints = useMemo(() => {
    if (weightRange === "all") return state.weightLogs;
    const cutoff = addDaysIso(state.realTodayIso, weightRange === "30d" ? -30 : -90);
    const inRange = state.weightLogs.filter((w) => w.date >= cutoff);
    return inRange.length >= 2 ? inRange : state.weightLogs.slice(-12);
  }, [state.weightLogs, weightRange, state.realTodayIso]);

  const minW =
    weightPoints.length > 0
      ? Math.min(...weightPoints.map((w) => w.weightKg)) - 0.6
      : 69.5;
  const maxW =
    weightPoints.length > 0
      ? Math.max(...weightPoints.map((w) => w.weightKg)) + 0.6
      : 75.5;
  const svgPoints = weightPoints
    .map((w, idx) => {
      const x =
        weightPoints.length <= 1
          ? 150
          : 14 + (idx / (weightPoints.length - 1)) * 272;
      const y = 78 - ((w.weightKg - minW) / Math.max(0.2, maxW - minW)) * 62;
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

  const alignedCalendar = useMemo(
    () => buildAlignedMonthCalendar(state.summaries365, calendarMonth),
    [state.summaries365, calendarMonth]
  );

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
            "Strength progress strictly compares identical exercises (e.g. Bench Press vs. previous Bench Press).",
        },
        {
          label: "Assisted Exercises",
          points: "Less Assist = PR",
          detail:
            "For counterweight movements, lower assistance weight is recognized as strength gain.",
        },
        {
          label: "Consolidated Daily Splits",
          points: "Daily Total",
          detail:
            "Multiple walks logged in a single day are consolidated into the day's total walk volume.",
        },
      ],
      formulaNote:
        "Progress = ((Latest Work - Baseline Work) / Baseline Work) × 100% per exercise.",
    };
  }, [state.progressAndConsistency.progressPercent]);

  const inspectedBar =
    selectedBarIdx !== null && progression[selectedBarIdx]
      ? progression[selectedBarIdx]
      : null;

  const inspectedWeight =
    selectedWeightIdx !== null && weightPoints[selectedWeightIdx]
      ? weightPoints[selectedWeightIdx]
      : null;

  return (
    <div className="space-y-4 pb-6">
      <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-white">
        Analytics
      </h1>

      {/* Awards Row */}
      <button
        type="button"
        onClick={() => setShowAllAwards((prev) => !prev)}
        className="apple-card w-full px-4 py-3.5 flex items-center justify-between text-left hover:border-white/15 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#30d158]/15 flex items-center justify-center text-[#30d158] shrink-0">
            <Trophy className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-white">
              Awards · {milestoneSummary.totalUnlocked} of {milestoneSummary.totalAvailable}
            </div>
            <div className="text-[12px] text-[#86868b] tabular-nums">
              {milestoneSummary.monthlyUnlocked} monthly · {milestoneSummary.yearlyUnlocked} yearly ·{" "}
              {milestoneSummary.platesUnlocked}/{milestoneSummary.platesTotal} plates
            </div>
          </div>
        </div>
        <span className="text-[12px] font-medium text-[#86868b] tabular-nums">
          {Math.round(
            (milestoneSummary.totalUnlocked / Math.max(1, milestoneSummary.totalAvailable)) * 100
          )}
          %
        </span>
      </button>

      {showAllAwards && <MilestoneBadgesCard summary={milestoneSummary} initialFilter="plates" />}

      {/* Today & This Month Effort */}
      <div className="grid grid-cols-2 gap-3">
        <div className="apple-card p-4">
          <div className="apple-section-label">Today</div>
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
                className={`text-[36px] font-semibold tracking-[-0.03em] tabular-nums leading-none hover:opacity-80 active:scale-95 transition-all cursor-pointer ${
                  state.todaySummary.status === "Calibrating"
                    ? "text-amber-400 glow-amber"
                    : "text-[#30d158] glow-score"
                }`}
              >
                {state.todaySummary.effortScore}
              </button>
            ) : (
              <div className="text-[19px] font-medium text-[#a1a1a6] leading-tight pt-1">
                {state.todaySummary.status === "No log"
                  ? "No activity"
                  : state.todaySummary.status}
              </div>
            )}
          </div>
          <div className="text-[12px] text-[#86868b] mt-2">
            {state.todaySummary.status === "Calibrating"
              ? "Estimated"
              : state.todaySummary.band}
          </div>
        </div>

        <div className="apple-card p-4">
          <div className="apple-section-label">This Month</div>
          <div className="mt-1.5">
            {state.monthStats.monthEffort !== null ? (
              <button
                type="button"
                onClick={() => setScoreReason(buildMonthScoreReason(state))}
                className="text-[36px] font-semibold tracking-[-0.03em] text-[#30d158] glow-score tabular-nums leading-none hover:opacity-80 active:scale-95 transition-all cursor-pointer"
              >
                {state.monthStats.monthEffort}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setScoreReason(buildMonthScoreReason(state))}
                className="text-[19px] font-medium text-amber-400 leading-tight pt-1 hover:underline cursor-pointer"
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

      {/* Recovery & Readiness Card */}
      <button
        type="button"
        onClick={() => setScoreReason(buildMonthScoreReason(state))}
        className="apple-card p-4 text-left w-full hover:border-white/15 transition-colors cursor-pointer block"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-[#30d158]" />
            <span className="apple-section-label">Recovery</span>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
              monthlyRecovery.status === "optimal"
                ? "bg-[#30d158]/12 text-[#30d158]"
                : monthlyRecovery.status === "risk-overtraining"
                ? "bg-[#ff453a]/12 text-[#ff453a]"
                : "bg-amber-400/12 text-amber-300"
            }`}
          >
            {monthlyRecovery.badge}
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-3 mb-2.5">
          <div>
            <span className="text-[24px] font-semibold text-white tabular-nums">
              {state.monthStats.restDaysThisMonth}
            </span>
            <span className="text-[13px] text-[#86868b] ml-1.5">rest days this month</span>
          </div>
          <span className="text-[11px] text-[#86868b] tabular-nums">Target 8–12d</span>
        </div>

        <div className="w-full h-1.5 rounded-full bg-[#1c1c1e] overflow-hidden flex mb-3.5">
          <div
            className="h-full bg-white/30 rounded-l-full transition-all"
            style={{
              width: `${Math.min(100, (state.monthStats.activeDaysThisMonth / 30) * 100)}%`,
            }}
          />
          <div
            className="h-full bg-[#30d158] rounded-r-full transition-all"
            style={{
              width: `${Math.min(100, (state.monthStats.restDaysThisMonth / 30) * 100)}%`,
            }}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5 pt-2.5 border-t border-white/[0.06]">
          {muscleRecoveryList.map((m) => {
            const dotCls =
              m.recoveryZone === "red"
                ? "bg-[#ff453a]"
                : m.recoveryZone === "yellow"
                ? "bg-amber-400"
                : "bg-[#30d158]";
            const textCls =
              m.recoveryZone === "red"
                ? "text-[#ff453a]"
                : m.recoveryZone === "yellow"
                ? "text-amber-300"
                : "text-[#30d158]";
            return (
              <div
                key={m.name}
                className="px-2.5 py-1.5 rounded-xl bg-[#1c1c1e] flex items-center justify-between text-[11px]"
              >
                <span className="text-white font-medium truncate">{m.name}</span>
                <span className="flex items-center gap-1 shrink-0 ml-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
                  <span className={`text-[10px] font-medium tabular-nums ${textCls}`}>
                    {m.recommendedHours}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </button>

      {/* 3-Metric Strip: Effort · Progress · Consistency */}
      <div className="apple-card p-3.5 grid grid-cols-3 divide-x divide-white/[0.06]">
        <div className="text-center px-1.5">
          <div className="text-[11px] font-medium text-[#86868b]">Effort</div>
          <div
            className={`text-[20px] font-semibold tabular-nums mt-0.5 ${
              state.todaySummary.status === "Calibrating"
                ? "text-amber-400"
                : "text-[#30d158]"
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
              ? "Estimated"
              : state.todaySummary.band !== "No log"
              ? state.todaySummary.band
              : "Score"}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setScoreReason(progressReason)}
          className="text-center px-1.5 hover:opacity-80 active:scale-95 transition-all cursor-pointer block"
        >
          <div className="text-[11px] font-medium text-[#86868b]">Progress</div>
          <div
            className={`text-[20px] font-semibold tabular-nums mt-0.5 ${
              state.progressAndConsistency.progressPercent === null
                ? "text-amber-400 text-[14px] pt-1"
                : state.progressAndConsistency.progressPercent >= 0
                ? "text-[#30d158]"
                : "text-white"
            }`}
          >
            {state.progressAndConsistency.progressPercent === null
              ? "Calibrating"
              : `${state.progressAndConsistency.progressPercent > 0 ? "+" : ""}${state.progressAndConsistency.progressPercent}%`}
          </div>
          <div className="text-[11px] text-[#86868b] mt-0.5">
            {state.progressAndConsistency.progressPercent === null
              ? "Building baseline"
              : "vs. baseline"}
          </div>
        </button>

        <div className="text-center px-1.5">
          <div className="text-[11px] font-medium text-[#86868b]">Consistency</div>
          <div className="text-[20px] font-semibold text-white tabular-nums mt-0.5">
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

      {/* Per-Exercise Strength Progression */}
      <div className="apple-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="apple-section-label">Strength Progression</div>
            <div className="flex items-center gap-4 mt-1.5">
              <div>
                <div className="text-[11px] text-[#86868b]">
                  {isSelectedAssisted ? "Latest Assist" : "Latest"}
                </div>
                <div className="text-[19px] font-semibold text-white tabular-nums">
                  {selectedEx ? formatWeight(latestWeightEx, unit) : "—"}
                  {weightGain !== 0 && (
                    <span className="text-[12px] font-medium text-[#30d158] ml-1.5">
                      {weightGain > 0 ? "+" : ""}
                      {formatWeight(weightGain, unit)}
                    </span>
                  )}
                </div>
              </div>

              {allTimePr && allTimePr.best1RM > 0 && (
                <div className="border-l border-white/[0.08] pl-4">
                  <div className="text-[11px] text-[#86868b]">
                    {isSelectedAssisted ? "Best 1RM Assist" : "Best 1RM"}
                  </div>
                  <div className="text-[19px] font-semibold text-white tabular-nums">
                    {formatWeight(allTimePr.best1RM, unit)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Native Segmented Metric Switcher */}
          <div className="apple-segmented w-[156px]">
            {(
              [
                { id: "weight", label: "Max" },
                { id: "1rm", label: "1RM" },
                { id: "volume", label: "Vol" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                data-active={strengthMetric === m.id}
                onClick={() => setStrengthMetric(m.id)}
                className="apple-segmented-btn h-7"
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {exerciseNames.length > 8 && (
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-[#86868b] absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={exSearch}
              onChange={(e) => setExSearch(e.target.value)}
              placeholder={`Search ${exerciseNames.length} exercises...`}
              className="apple-input w-full h-9 pl-8.5 pr-3 text-[12px]"
            />
          </div>
        )}

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {filteredExerciseNames.map((name) => {
            const active = selectedEx === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setSelectedEx(name);
                  setSelectedBarIdx(null);
                }}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-[#30d158] text-black font-semibold"
                    : "bg-[#1c1c1e] text-[#86868b] hover:text-white"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>

        {progression.length > 0 ? (
          <div className="space-y-2.5">
            <div
              className="grid gap-1.5 pt-1"
              style={{
                gridTemplateColumns: `repeat(${Math.min(8, Math.max(4, progression.length))}, minmax(0, 1fr))`,
              }}
            >
              {progression.map((pt, idx) => {
                const isLatest = idx === progression.length - 1;
                const isSelected = selectedBarIdx === idx;
                const rawVal = getPointMetricKgOrVol(pt);
                const pct =
                  isSelectedAssisted && strengthMetric !== "volume"
                    ? (() => {
                        const positives = progression
                          .map((p) => getPointMetricKgOrVol(p))
                          .filter((w) => w > 0);
                        const minAssist = positives.length > 0 ? Math.min(...positives) : 1;
                        return Math.max(
                          22,
                          Math.min(100, Math.round((minAssist / Math.max(rawVal, 1)) * 100))
                        );
                      })()
                    : Math.max(22, Math.round((rawVal / maxSessionMetric) * 100));

                const shade = isLatest
                  ? "var(--effort-very-high)"
                  : idx >= progression.length - 2
                  ? "var(--effort-high)"
                  : idx >= progression.length - 4
                  ? "var(--effort-steady)"
                  : "var(--effort-low)";

                const barText =
                  strengthMetric === "volume"
                    ? rawVal >= 1000
                      ? `${(rawVal / 1000).toFixed(1)}k`
                      : String(Math.round(rawVal))
                    : String(
                        unit === "lb" ? Math.round(rawVal * 2.20462) : Math.round(rawVal)
                      );

                return (
                  <button
                    key={`${pt.date}-${idx}`}
                    type="button"
                    onClick={() => setSelectedBarIdx(isSelected ? null : idx)}
                    className="flex flex-col items-center gap-1.5 cursor-pointer group"
                  >
                    <div
                      className={`w-full h-[92px] rounded-[11px] p-[2px] flex flex-col justify-end bg-[#1c1c1e] transition-all ${
                        isSelected
                          ? "ring-1 ring-white shadow-[0_0_18px_rgba(255,255,255,0.28)]"
                          : isLatest
                          ? "ring-1 ring-[#30d158]/60 shadow-[0_0_16px_rgba(48,209,88,0.28)]"
                          : ""
                      }`}
                    >
                      <div
                        className="w-full rounded-[9px] flex items-start justify-center pt-1.5 transition-all duration-500 shadow-[0_0_10px_rgba(48,209,88,0.3)]"
                        style={{ height: `${pct}%`, backgroundColor: shade }}
                      >
                        <span
                          className={`text-[9px] font-semibold tabular-nums leading-none ${
                            idx >= progression.length - 3 ? "text-black" : "text-[#dcfce7]"
                          }`}
                        >
                          {barText}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-[9px] tabular-nums truncate max-w-full ${
                        isSelected ? "text-white font-semibold" : "text-[#86868b]"
                      }`}
                    >
                      {pt.shortDate}
                    </span>
                  </button>
                );
              })}
            </div>

            {inspectedBar && (
              <div className="px-3.5 py-2 rounded-xl bg-[#1c1c1e] flex items-center justify-between text-[11px] tabular-nums">
                <span className="text-white font-medium">{inspectedBar.date}</span>
                <span className="text-[#86868b]">
                  Max {formatWeight(inspectedBar.maxWeightKg, unit)} · 1RM{" "}
                  {formatWeight(inspectedBar.best1RMKg, unit)} · {inspectedBar.totalReps} reps
                  {inspectedBar.effortScore !== null
                    ? ` · Effort ${inspectedBar.effortScore}`
                    : ""}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-[13px] text-[#86868b]">
            Log strength sessions to track progression.
          </div>
        )}
      </div>

      {/* Muscle Group Volume */}
      <div className="apple-card p-4 space-y-4">
        <div>
          <div className="apple-section-label">Muscle Group Volume</div>
          <div className="text-[20px] font-semibold text-white tabular-nums mt-0.5">
            {selectedMg ? `${Math.round(latestMgVol).toLocaleString()} ${unit}` : "—"}
            {mgVolDelta !== 0 && (
              <span className="text-[13px] font-medium text-[#30d158] ml-2">
                {mgVolDelta > 0 ? "+" : ""}
                {mgVolDelta.toLocaleString()}
              </span>
            )}
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
                className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-[#30d158] text-black font-semibold"
                    : "bg-[#1c1c1e] text-[#86868b] hover:text-white"
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
                    className={`w-full h-[92px] rounded-[11px] p-[2px] flex flex-col justify-end bg-[#1c1c1e] ${
                      isLatest ? "ring-1 ring-[#30d158]/50" : ""
                    }`}
                  >
                    <div
                      className="w-full rounded-[9px] flex items-start justify-center pt-1.5 transition-all duration-500"
                      style={{ height: `${pct}%`, backgroundColor: shade }}
                    >
                      <span
                        className={`text-[9px] font-semibold tabular-nums leading-none ${
                          idx >= mgProgression.length - 3 ? "text-black" : "text-[#dcfce7]"
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

      {/* Cardio Totals */}
      <div className="apple-card p-4 space-y-3">
        <div className="apple-section-label">Cardio · This Month</div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3.5 rounded-2xl bg-[#1c1c1e]">
            <div className="text-[11px] text-[#86868b]">Distance</div>
            <div className="text-[20px] font-semibold text-white tabular-nums mt-0.5">
              {formatDistance(state.cardioTotals.totalDistanceKm, unit)}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#1c1c1e]">
            <div className="text-[11px] text-[#86868b]">Duration</div>
            <div className="text-[20px] font-semibold text-white tabular-nums mt-0.5">
              {state.cardioTotals.totalMinutes} min
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#1c1c1e]">
            <div className="text-[11px] text-[#86868b]">Logged Energy</div>
            <div className="text-[18px] font-semibold text-[#30d158] tabular-nums mt-0.5">
              {state.cardioTotals.loggedKcal.toLocaleString()} kcal
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#1c1c1e]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#86868b]">Estimated</span>
              <span className="text-[10px] text-[#636366]">Est.</span>
            </div>
            <div className="text-[18px] font-semibold text-[#d1d1d6] tabular-nums mt-0.5">
              {state.cardioTotals.estimatedKcal.toLocaleString()} kcal
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Weight Trend Chart */}
      <div className="apple-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="apple-section-label">Weight Trend</div>
            <div className="text-[20px] font-semibold text-white tabular-nums mt-0.5">
              {lastBodyW !== undefined ? formatWeight(lastBodyW, unit) : "—"}
              {bodyDelta !== null && bodyDelta !== 0 && (
                <span className="text-[13px] font-medium text-[#30d158] ml-2">
                  {bodyDelta > 0 ? "+" : ""}
                  {formatWeight(bodyDelta, unit)}
                </span>
              )}
            </div>
          </div>

          <div className="apple-segmented w-[138px]">
            {(["30d", "90d", "all"] as WeightRange[]).map((r) => (
              <button
                key={r}
                type="button"
                data-active={weightRange === r}
                onClick={() => {
                  setWeightRange(r);
                  setSelectedWeightIdx(null);
                }}
                className="apple-segmented-btn h-7 capitalize"
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {weightPoints.length >= 2 ? (
          <div className="space-y-2">
            <svg viewBox="0 0 300 92" className="w-full h-24 overflow-visible">
              <polyline
                fill="none"
                stroke="#30d158"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: "drop-shadow(0 0 6px rgba(48, 209, 88, 0.65))" }}
                points={svgPoints}
              />
              {weightPoints.map((w, idx) => {
                const x = 14 + (idx / (weightPoints.length - 1)) * 272;
                const y =
                  78 - ((w.weightKg - minW) / Math.max(0.2, maxW - minW)) * 62;
                const isSelected = selectedWeightIdx === idx;
                return (
                  <g
                    key={w.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedWeightIdx(isSelected ? null : idx)}
                  >
                    <circle cx={x} cy={y} r={11} fill="transparent" />
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? 5 : idx === weightPoints.length - 1 ? 4 : 2.8}
                      fill={
                        isSelected
                          ? "#ffffff"
                          : idx === weightPoints.length - 1
                          ? "#30d158"
                          : "#228b46"
                      }
                    />
                  </g>
                );
              })}
            </svg>
            <div className="flex items-center justify-between text-[11px] text-[#86868b] tabular-nums">
              <span>{formatShortMonthDay(weightPoints[0].date)}</span>
              {inspectedWeight ? (
                <span className="text-white font-medium">
                  {inspectedWeight.date}: {formatWeight(inspectedWeight.weightKg, unit)}
                </span>
              ) : (
                <span>Tap dot to inspect</span>
              )}
              <span>{formatShortMonthDay(weightPoints[weightPoints.length - 1].date)}</span>
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-[12px] text-[#86868b]">
            Add weight entries in Profile to chart trend.
          </div>
        )}
      </div>

      {/* Muscle Group Split */}
      <div className="apple-card p-4 space-y-3">
        <div className="apple-section-label">Muscle Split</div>
        {state.muscleGroupSplit.length > 0 ? (
          <>
            <div className="w-full h-2.5 rounded-full overflow-hidden flex gap-[2px] bg-[#1c1c1e]">
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
                  className="flex items-center justify-between text-[13px] px-3 py-2 rounded-xl bg-[#1c1c1e]"
                >
                  <span className="flex items-center gap-2 text-[#d1d1d6]">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
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

      {/* Aligned Interactive Monthly Calendar */}
      <div className="apple-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="apple-section-label">Calendar</div>
            <div className="text-[15px] font-semibold text-white mt-0.5">
              {alignedCalendar.monthLabel}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!alignedCalendar.prevMonthPrefix}
              onClick={() =>
                alignedCalendar.prevMonthPrefix &&
                setCalendarMonth(alignedCalendar.prevMonthPrefix)
              }
              aria-label="Previous month"
              className="w-7 h-7 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] disabled:opacity-25 flex items-center justify-center text-[#86868b] hover:text-white cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!alignedCalendar.nextMonthPrefix}
              onClick={() =>
                alignedCalendar.nextMonthPrefix &&
                setCalendarMonth(alignedCalendar.nextMonthPrefix)
              }
              aria-label="Next month"
              className="w-7 h-7 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] disabled:opacity-25 flex items-center justify-center text-[#86868b] hover:text-white cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium text-[#86868b] select-none">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((wd) => (
            <span key={wd}>{wd}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {alignedCalendar.cells.map((day, idx) => {
            if (!day) {
              return <div key={`empty-${idx}`} className="aspect-square" />;
            }
            const dayNum = Number(day.date.slice(8));
            const isToday = day.date === state.realTodayIso;
            const styleClass =
              day.status === "Scored"
                ? "bg-[#30d158]/20 text-[#30d158] shadow-[0_0_12px_rgba(48,209,88,0.26)] border border-[#30d158]/35"
                : day.status === "Calibrating"
                ? "bg-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.22)] border border-amber-400/30"
                : day.status === "Rest"
                ? "bg-[#2c2c2e] text-[#a1a1a6] border border-white/[0.06]"
                : "bg-[#1c1c1e] text-[#636366] border border-transparent";

            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedCalendarDay(day)}
                title={`${day.date} · ${day.band}`}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center text-[11px] font-semibold tabular-nums transition-transform hover:scale-105 active:scale-95 cursor-pointer ${styleClass} ${
                  isToday ? "ring-1 ring-[#30d158]" : ""
                }`}
              >
                <span>{dayNum}</span>
                {day.effortScore !== null && (
                  <span className="text-[8px] font-medium opacity-85 leading-none mt-0.5">
                    {day.effortScore}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.05] text-[10px] text-[#86868b]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#30d158]/40" />
            Workout
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-500/40" />
            Calibrating
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#2c2c2e]" />
            Rest
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#1c1c1e]" />
            Empty
          </span>
        </div>
      </div>

      {/* Calendar Day Detail Sheet */}
      <BottomSheet
        open={Boolean(selectedCalendarDay)}
        onClose={() => setSelectedCalendarDay(null)}
        title={selectedCalendarDay ? formatFullDate(selectedCalendarDay.date) : ""}
        subtitle={
          selectedCalendarDay
            ? selectedCalendarDay.isRest
              ? "Rest day"
              : selectedCalendarDay.status === "No log"
              ? "No activity logged"
              : selectedCalendarDay.sessionGroups.join(" · ") || "Workout"
            : undefined
        }
      >
        {selectedCalendarDay && (
          <div className="space-y-3">
            {selectedCalendarDay.effortScore !== null && (
              <div className="p-4 rounded-2xl bg-[#1c1c1e] flex items-center justify-between">
                <span className="text-[13px] text-[#86868b]">Day Effort</span>
                <button
                  type="button"
                  onClick={() =>
                    setScoreReason(
                      buildDayScoreReason(selectedCalendarDay, {
                        hidePrivateDetails: false,
                        shareDetailsEnabled: true,
                      })
                    )
                  }
                  className={`text-[24px] font-semibold tabular-nums cursor-pointer ${
                    selectedCalendarDay.status === "Calibrating"
                      ? "text-amber-400"
                      : "text-[#30d158]"
                  }`}
                >
                  {selectedCalendarDay.effortScore}
                  <span className="text-[12px] text-[#86868b] font-medium">/100</span>
                </button>
              </div>
            )}
            {selectedCalendarDay.loggedItems.length > 0 ? (
              <div className="rounded-2xl bg-[#1c1c1e] divide-y divide-white/[0.06]">
                {selectedCalendarDay.loggedItems.map((item) => (
                  <div
                    key={item.id}
                    className="px-4 py-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-white truncate">
                        {item.title}
                      </div>
                      <div className="text-[12px] text-[#86868b] tabular-nums truncate">
                        {item.detail}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setScoreReason(
                          buildLoggedItemScoreReason(item, {
                            hidePrivateDetails: false,
                            shareDetailsEnabled: true,
                          })
                        )
                      }
                      className="text-[15px] font-semibold text-[#30d158] tabular-nums shrink-0 cursor-pointer"
                    >
                      {item.status === "Calibrating" ? (
                        <span className="text-[11px] text-amber-400">Calibrating</span>
                      ) : item.status === "Rest" ? (
                        <span className="text-[12px] text-[#86868b]">Rest</span>
                      ) : (
                        item.effortScore
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-[13px] text-[#86868b]">
                {selectedCalendarDay.isRest ? "Planned rest day." : "No logs recorded."}
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <ScoreReasonSheet reason={scoreReason} onClose={() => setScoreReason(null)} />
    </div>
  );
}
