"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Zap,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Bell,
  X,
  Dumbbell,
  Check,
  Pencil,
} from "lucide-react";
import { AppStatePayload } from "@/lib/client-types";
import { CardioLog, DaySummary, EffortBand, ExerciseLog } from "@/lib/types";
import {
  formatDistance,
  formatFullDate,
  formatLogTime,
  getCalibrationProgress,
  getSuggestedRoutineExercises,
} from "@/lib/effort";
import {
  buildDayScoreReason,
  buildLeaderboardScoreReason,
  buildLoggedItemScoreReason,
  buildMonthScoreReason,
  ScoreReasonData,
} from "@/lib/score-reason";
import { ScoreReasonSheet } from "../ui/ScoreReasonSheet";

interface HomeTabProps {
  state: AppStatePayload;
  dayShift: number;
  inGym: boolean;
  gymStartedAt: string | null;
  onToggleInGym: () => void;
  onChangeDayShift: (next: number) => void;
  onOpenCheckin: () => void;
  onOpenStrength: (exerciseName?: string) => void;
  onOpenCardio: () => void;
  onEditStrength: (log: ExerciseLog) => void;
  onEditCardio: (log: CardioLog) => void;
  onNavigateTab: (tab: "logs" | "friends" | "leaderboard" | "analytics" | "profile") => void;
}

function formatGymElapsed(startedAt: string | null, nowMs: number): string {
  if (!startedAt) return "";
  const startMs = Date.parse(startedAt);
  if (Number.isNaN(startMs)) return "";
  const totalMin = Math.max(0, Math.floor((nowMs - startMs) / 60_000));
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function getBarColorStyle(
  band: EffortBand,
  isToday: boolean,
  status?: DaySummary["status"]
): string {
  if (band === "Rest") return "var(--effort-rest)";
  if (band === "No log") return "transparent";
  if (status === "Calibrating") {
    switch (band) {
      case "Very low":
        return "var(--est-very-low)";
      case "Low":
        return "var(--est-low)";
      case "Steady":
        return "var(--est-steady)";
      case "High":
        return "var(--est-high)";
      case "Very high":
        return "var(--est-very-high)";
      default:
        return "var(--est-steady)";
    }
  }
  if (isToday) return "var(--effort-very-high)";
  switch (band) {
    case "Very low":
      return "var(--effort-very-low)";
    case "Low":
      return "var(--effort-low)";
    case "Steady":
      return "var(--effort-steady)";
    case "High":
      return "var(--effort-high)";
    case "Very high":
      return "var(--effort-very-high)";
    default:
      return "var(--effort-steady)";
  }
}

export function HomeTab({
  state,
  dayShift,
  inGym,
  gymStartedAt,
  onToggleInGym,
  onChangeDayShift,
  onOpenCheckin,
  onOpenStrength,
  onOpenCardio,
  onEditStrength,
  onEditCardio,
  onNavigateTab,
}: HomeTabProps) {
  const { profile, todaySummary, previousScoredDay, rolling7Days, monthStats, todaySession } =
    state;
  const [scoreReason, setScoreReason] = useState<ScoreReasonData | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [dismissedAnnIds, setDismissedAnnIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const legacy = localStorage.getItem("hr_dismissed_ann");
      const raw = localStorage.getItem("hr_dismissed_anns_v1");
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      return Array.from(new Set([...(legacy ? [legacy] : []), ...parsed]));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!inGym) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, [inGym, gymStartedAt]);

  const todayScore = todaySummary.effortScore;
  const prevScore = previousScoredDay?.effortScore ?? 50;
  const delta = todayScore !== null ? todayScore - prevScore : null;
  const firstName = profile.name.split(" ")[0] || profile.name;

  const sessionGroups = useMemo(
    () => (todaySession && !todaySession.isRest ? todaySession.muscleGroups : []),
    [todaySession]
  );

  const suggestedRoutine = useMemo(
    () =>
      getSuggestedRoutineExercises(
        sessionGroups,
        state.recentExerciseLogs,
        state.visibleExercises,
        state.todayIso
      ),
    [sessionGroups, state.recentExerciseLogs, state.visibleExercises, state.todayIso]
  );

  const loggedTodayNames = useMemo(
    () =>
      new Set(
        todaySummary.loggedItems
          .filter((i) => i.kind === "strength")
          .map((i) => i.title.trim().toLowerCase())
      ),
    [todaySummary.loggedItems]
  );

  const quickPills = useMemo(() => {
    const base = (
      sessionGroups.length > 0
        ? state.visibleExercises.filter((e) => sessionGroups.includes(e.muscleGroup))
        : state.visibleExercises
    ).slice(0, 8);
    const routineSet = new Set(suggestedRoutine.map((n) => n.toLowerCase()));
    return base.filter((e) => !routineSet.has(e.name.toLowerCase()));
  }, [sessionGroups, state.visibleExercises, suggestedRoutine]);

  const sessionLabel = todaySession
    ? todaySession.isRest
      ? "Rest Day"
      : todaySession.muscleGroups.join(" & ")
    : "Choose Focus";

  const topFriends = [...state.leaderboard]
    .filter((f) => f.monthEffort !== null)
    .sort((a, b) => (b.monthEffort ?? 0) - (a.monthEffort ?? 0))
    .slice(0, 3);

  const dismissedSet = new Set(dismissedAnnIds);
  const matchingAnns = state.announcements.filter((a) => {
    const t = (a.target || "all").trim().toLowerCase();
    if (t === "all") return true;
    if (t === "calibrating") {
      return todaySummary.status === "Calibrating" || monthStats.isMonthCalibrating;
    }
    if (t === "inactive_2d") {
      return todaySummary.itemCount === 0 && !todaySummary.isRest;
    }
    if (t === "active_streak") {
      return monthStats.currentStreak > 0;
    }
    if (t.startsWith("@")) {
      return t.slice(1) === profile.username.toLowerCase();
    }
    return t === profile.username.toLowerCase();
  });
  const latestAnn = matchingAnns.find((a) => !dismissedSet.has(a.id));

  const elapsedLabel = inGym ? formatGymElapsed(gymStartedAt, nowMs) : "";

  const handleEditTodayItem = (item: DaySummary["loggedItems"][number]) => {
    if (item.kind === "strength") {
      const found = state.recentExerciseLogs.find((e) => e.id === item.id);
      if (found) onEditStrength(found);
    } else {
      const targetId = item.splits?.length
        ? item.splits[item.splits.length - 1].id
        : item.id;
      const found = state.recentCardioLogs.find((c) => c.id === targetId);
      if (found) onEditCardio(found);
    }
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Admin Broadcast / Targeted Notification Banner */}
      {latestAnn && (
        <div className="apple-card px-4 py-3.5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Bell className="w-4 h-4 text-[#30d158] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white">{latestAnn.title}</div>
              <div className="text-[12px] text-[#86868b] mt-0.5 leading-snug">
                {latestAnn.body}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => {
              const next = Array.from(
                new Set([...dismissedAnnIds, ...matchingAnns.map((a) => a.id)])
              );
              setDismissedAnnIds(next);
              try {
                localStorage.setItem("hr_dismissed_anns_v1", JSON.stringify(next));
              } catch {}
            }}
            className="w-7 h-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-[#86868b] hover:text-white shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Calm Apple Fitness Summary Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-[#86868b]">
            {formatFullDate(state.todayIso).replace(/,\s*\d{4}$/, "")}
          </div>
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-white leading-tight mt-0.5">
            {firstName}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => onNavigateTab("profile")}
          className="text-right cursor-pointer group pb-0.5"
        >
          <div className="text-[13px] font-medium text-[#86868b] group-hover:text-white transition-colors">
            @{profile.username}
          </div>
          <div className="text-[12px] text-[#30d158] font-medium tabular-nums">
            {monthStats.currentStreak}d streak
          </div>
        </button>
      </div>

      {/* Luminous 2-Tile Status Row: In the Gym & Today's Session */}
      <div className="grid grid-cols-2 gap-3 items-stretch">
        <div className="relative flex">
          {inGym && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-1 rounded-[22px] bg-[#30d158]/30 blur-xl animate-pulse"
            />
          )}
          <button
            type="button"
            role="switch"
            aria-checked={inGym}
            onClick={onToggleInGym}
            className={`relative w-full p-3.5 rounded-[20px] border text-left flex flex-col justify-between gap-3 transition-all active:scale-[0.98] cursor-pointer ${
              inGym
                ? "bg-[#0d2214] border-[#30d158]/70 shadow-[0_0_28px_rgba(48,209,88,0.4)]"
                : "apple-card"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                  inGym
                    ? "bg-[#30d158] text-black"
                    : "bg-[#1c1c1e] text-[#30d158] shadow-[0_0_12px_rgba(48,209,88,0.18)]"
                }`}
              >
                <Dumbbell className="w-4 h-4" />
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${
                  inGym
                    ? "bg-[#30d158] text-black"
                    : "bg-[#1c1c1e] text-[#86868b]"
                }`}
              >
                {inGym ? "Live" : "Off"}
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-semibold text-white truncate">
                  In the Gym
                </span>
                {inGym && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-ping shrink-0" />
                )}
              </div>
              <div className="text-[12px] text-[#86868b] tabular-nums mt-0.5 truncate">
                {inGym ? `${elapsedLabel || "0m"} · Screen awake` : "Tap to check in"}
              </div>
            </div>
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenCheckin}
          className="apple-card p-3.5 text-left flex flex-col justify-between gap-3 transition-all active:scale-[0.98] cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                todaySession?.isRest
                  ? "bg-[#1c1c1e] text-[#86868b]"
                  : "bg-[#30d158]/15 text-[#30d158] shadow-[0_0_14px_rgba(48,209,88,0.28)]"
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  todaySession?.isRest
                    ? "bg-[#86868b]"
                    : "bg-[#30d158] shadow-[0_0_10px_rgba(48,209,88,0.85)]"
                }`}
              />
            </span>
            <ChevronRight className="w-4 h-4 text-[#636366]" />
          </div>

          <div className="min-w-0">
            <div className="text-[12px] text-[#86868b] truncate">Focus</div>
            <div className="text-[14px] font-semibold text-white truncate mt-0.5">
              {sessionLabel}
            </div>
          </div>
        </button>
      </div>

      {/* Hero Effort Card + 7-Day Rolling Bars */}
      <div className="apple-card p-5 space-y-5 relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[20px] overflow-hidden"
        >
          <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-[#30d158]/12 blur-3xl" />
        </div>
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <div className="apple-section-label">Effort</div>
            {(todaySummary.status === "Scored" || todaySummary.status === "Calibrating") &&
            todayScore !== null ? (
              <button
                type="button"
                onClick={() =>
                  setScoreReason(
                    buildDayScoreReason(todaySummary, {
                      hidePrivateDetails: false,
                      shareDetailsEnabled: true,
                    })
                  )
                }
                title="Tap score to see why"
                className="flex items-baseline gap-1.5 mt-1 rounded-xl px-1.5 py-0.5 -mx-1.5 hover:bg-white/[0.04] active:scale-95 transition-all cursor-pointer"
              >
                <span
                  className={`text-[50px] font-semibold tracking-[-0.04em] leading-none tabular-nums ${
                    todaySummary.status === "Calibrating"
                      ? "text-amber-400 glow-amber"
                      : "text-[#30d158] glow-score"
                  }`}
                >
                  {todayScore}
                </span>
                <span className="text-[15px] font-medium text-[#636366] tabular-nums">
                  / 100
                </span>
              </button>
            ) : todaySummary.status === "Rest" ? (
              <button
                type="button"
                onClick={() => setScoreReason(buildDayScoreReason(todaySummary))}
                className="text-[28px] font-semibold tracking-[-0.02em] text-[#a1a1a6] mt-1 hover:text-white cursor-pointer"
              >
                Rest
              </button>
            ) : (
              <div className="text-[22px] font-medium tracking-[-0.02em] text-[#86868b] mt-1.5">
                No workout yet
              </div>
            )}
          </div>

          <div className="text-right space-y-1">
            {delta !== null ? (
              <div
                className={`inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-[12px] font-medium tabular-nums ${
                  delta >= 0
                    ? "bg-[#30d158]/15 text-[#30d158] shadow-[0_0_16px_rgba(48,209,88,0.25)]"
                    : "bg-white/[0.06] text-[#a1a1a6]"
                }`}
              >
                {delta >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {delta >= 0 ? `+${delta}` : delta}
              </div>
            ) : (
              <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#1c1c1e] text-[#86868b]">
                {todaySummary.band}
              </span>
            )}
            {delta !== null && (
              <div className="text-[12px] text-[#86868b]">
                {todaySummary.status === "Calibrating" ? "Estimated" : todaySummary.band}
              </div>
            )}
          </div>
        </div>

        {/* 7-Day Rolling Bars */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-medium text-[#86868b]">Last 7 Days</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onChangeDayShift(dayShift - 1)}
                aria-label="Previous day"
                className="w-7 h-7 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] flex items-center justify-center text-[#86868b] hover:text-white cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {dayShift !== 0 && (
                <button
                  type="button"
                  onClick={() => onChangeDayShift(0)}
                  aria-label="Back to today"
                  className="px-2.5 h-7 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] text-[11px] font-medium text-[#30d158] flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Today
                </button>
              )}
              <button
                type="button"
                onClick={() => onChangeDayShift(Math.min(0, dayShift + 1))}
                disabled={dayShift >= 0}
                aria-label="Next day"
                className="w-7 h-7 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] disabled:opacity-25 flex items-center justify-center text-[#86868b] hover:text-white cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="relative pt-1 pb-1">
            <div
              className="pointer-events-none absolute left-0 right-0 flex items-center"
              style={{ top: "calc(20px + 42px)" }}
            >
              <div className="w-full border-t border-dashed border-white/[0.1]" />
            </div>

            <div className="grid grid-cols-7 gap-2 relative z-10">
              {rolling7Days.map((day: DaySummary, idx: number) => {
                const isToday = idx === rolling7Days.length - 1;
                const heightPct =
                  day.effortScore !== null
                    ? Math.max(18, Math.min(100, day.effortScore))
                    : day.status === "Calibrating"
                    ? 36
                    : 0;

                const fillColor = getBarColorStyle(day.band, isToday, day.status);
                const canInspect = day.status !== "No log";
                const isScored = day.status === "Scored" && day.effortScore !== null;
                const isCal = day.status === "Calibrating";

                const trackGlowClass = isToday
                  ? isCal
                    ? "ring-1 ring-amber-400/80 shadow-[0_0_22px_rgba(255,159,10,0.42)]"
                    : "ring-1 ring-[#30d158]/80 shadow-[0_0_22px_rgba(48,209,88,0.45)]"
                  : isScored
                  ? "ring-1 ring-[#30d158]/55 shadow-[0_0_18px_rgba(48,209,88,0.34)]"
                  : isCal
                  ? "ring-1 ring-amber-400/55 shadow-[0_0_18px_rgba(255,159,10,0.34)]"
                  : day.isRest
                  ? "ring-1 ring-[#30d158]/30 shadow-[0_0_14px_rgba(48,209,88,0.18)]"
                  : "ring-1 ring-[#30d158]/22 shadow-[0_0_12px_rgba(48,209,88,0.14)]";

                return (
                  <div key={day.date} className="flex flex-col items-center gap-1.5">
                    <span
                      className={`text-[11px] font-medium leading-none ${
                        isToday
                          ? isCal
                            ? "text-amber-400 font-semibold glow-amber"
                            : "text-[#30d158] font-semibold glow-score"
                          : isScored
                          ? "text-[#30d158]/90 glow-score"
                          : isCal
                          ? "text-amber-400/90 glow-amber"
                          : "text-[#a1a1a6] glow-score"
                      }`}
                    >
                      {day.dayLetter}
                    </span>

                    <button
                      type="button"
                      disabled={!canInspect}
                      onClick={() => {
                        if (canInspect) {
                          setScoreReason(
                            buildDayScoreReason(day, {
                              hidePrivateDetails: false,
                              shareDetailsEnabled: true,
                            })
                          );
                        }
                      }}
                      className={`w-full h-[84px] rounded-[11px] p-[2px] flex flex-col justify-end overflow-hidden transition-all bg-[#1c1c1e] ${
                        canInspect
                          ? "cursor-pointer hover:brightness-110 active:scale-95"
                          : "cursor-default"
                      } ${trackGlowClass}`}
                    >
                      {isScored ? (
                        <div
                          className="w-full rounded-[9px] flex items-start justify-center pt-1.5 transition-all duration-500 shadow-[0_0_14px_rgba(48,209,88,0.45)]"
                          style={{
                            height: `${heightPct}%`,
                            backgroundColor: fillColor,
                          }}
                        >
                          <span
                            className={`text-[10px] font-semibold tabular-nums leading-none ${
                              (day.effortScore ?? 0) >= 45 || isToday
                                ? "text-black"
                                : "text-[#dcfce7]"
                            }`}
                          >
                            {day.effortScore}
                          </span>
                        </div>
                      ) : isCal ? (
                        <div
                          className="w-full rounded-[9px] flex items-start justify-center pt-1.5 transition-all duration-500 shadow-[0_0_14px_rgba(255,159,10,0.45)]"
                          style={{
                            height: `${heightPct}%`,
                            backgroundColor: fillColor,
                          }}
                        >
                          <span
                            className={`text-[10px] font-semibold tabular-nums leading-none ${
                              (day.effortScore ?? 0) >= 75
                                ? "text-black"
                                : "text-amber-100"
                            }`}
                          >
                            {day.effortScore ?? "Est"}
                          </span>
                        </div>
                      ) : day.isRest ? (
                        <div className="h-full flex items-end justify-center pb-2 w-full">
                          <span className="text-[9px] font-medium text-[#86868b]">
                            Rest
                          </span>
                        </div>
                      ) : null}
                    </button>

                    <span
                      className={`text-[10px] leading-none tabular-nums truncate max-w-full ${
                        isToday
                          ? isCal
                            ? "text-amber-400 font-semibold glow-amber"
                            : "text-[#30d158] font-semibold glow-score"
                          : isScored
                          ? "text-[#30d158]/80"
                          : isCal
                          ? "text-amber-400/80"
                          : "text-[#636366]"
                      }`}
                    >
                      {isToday && dayShift === 0 ? "Today" : day.date.slice(8)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3.5 mt-2 border-t border-white/[0.05] text-[12px] text-[#86868b]">
            <span>Usual 50</span>
            <button
              type="button"
              onClick={() => setScoreReason(buildMonthScoreReason(state))}
              className="tabular-nums hover:text-white transition-colors cursor-pointer text-right group"
              title="Tap for Monthly Effort & Recovery breakdown"
            >
              Month avg{" "}
              <strong className="text-white font-semibold group-hover:underline">
                {monthStats.monthEffort !== null
                  ? monthStats.monthEffort
                  : monthStats.isMonthCalibrating
                  ? "Calibrating"
                  : "—"}
              </strong>
            </button>
          </div>
        </div>
      </div>

      {/* Sleek Horizontal Action Buttons with Accent Glow */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onOpenStrength()}
          className="apple-card p-3.5 text-left active:scale-[0.98] transition-all cursor-pointer flex items-center gap-3 group"
        >
          <div className="w-9 h-9 rounded-full bg-[#30d158]/15 shadow-[0_0_16px_rgba(48,209,88,0.28)] flex items-center justify-center text-[#30d158] shrink-0 group-hover:bg-[#30d158] group-hover:text-black transition-all">
            <Plus className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-white truncate">Strength</div>
            <div className="text-[11px] text-[#86868b] truncate">Sets &amp; timer</div>
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenCardio}
          className="apple-card p-3.5 text-left active:scale-[0.98] transition-all cursor-pointer flex items-center gap-3 group"
        >
          <div className="w-9 h-9 rounded-full bg-[#1c1c1e] shadow-[0_0_14px_rgba(255,255,255,0.12)] flex items-center justify-center text-white shrink-0 group-hover:bg-white group-hover:text-black transition-all">
            <Zap className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-white truncate">Cardio</div>
            <div className="text-[11px] text-[#86868b] truncate">Preset or photo</div>
          </div>
        </button>
      </div>

      {/* Unified Calm Quick Log + Routine Lineup Rail */}
      {!todaySession?.isRest && (suggestedRoutine.length > 0 || quickPills.length > 0) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="apple-section-label">
              {suggestedRoutine.length > 0 ? `${sessionLabel} Lineup` : "Quick Log"}
            </span>
            {suggestedRoutine.length > 0 && (
              <span className="text-[12px] text-[#30d158] glow-score tabular-nums font-medium">
                {suggestedRoutine.filter((n) => loggedTodayNames.has(n.toLowerCase())).length}/
                {suggestedRoutine.length} done
              </span>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {suggestedRoutine.map((exName) => {
              const done = loggedTodayNames.has(exName.toLowerCase());
              return (
                <button
                  key={`routine-${exName}`}
                  type="button"
                  onClick={() => onOpenStrength(exName)}
                  className={`shrink-0 px-3.5 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5 transition-all cursor-pointer border ${
                    done
                      ? "bg-[#30d158]/15 border-[#30d158]/45 text-[#30d158] shadow-[0_0_14px_rgba(48,209,88,0.25)]"
                      : "bg-[#111113] border-[#30d158]/15 text-white hover:border-[#30d158]/40 shadow-[0_0_14px_rgba(48,209,88,0.06)]"
                  }`}
                >
                  {done && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                  <span>{exName}</span>
                </button>
              );
            })}
            {quickPills.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => onOpenStrength(ex.name)}
                className="shrink-0 px-3.5 py-2 rounded-full bg-[#111113] border border-[#30d158]/15 hover:border-[#30d158]/40 shadow-[0_0_14px_rgba(48,209,88,0.06)] hover:shadow-[0_0_16px_rgba(48,209,88,0.18)] text-[13px] font-medium text-[#d1d1d6] hover:text-white transition-all cursor-pointer"
              >
                {ex.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Today's Session Items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <span className="apple-section-label">Today</span>
          <button
            type="button"
            onClick={() => onNavigateTab("logs")}
            className="text-[13px] font-medium text-[#30d158] flex items-center gap-0.5 cursor-pointer"
          >
            History
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="apple-card px-4 py-1">
          {todaySummary.loggedItems.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-[#86868b]">
              {todaySummary.isRest ? "Rest day" : "No workouts logged today"}
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {todaySummary.loggedItems.map((item) => {
                const calInfo =
                  item.status === "Calibrating"
                    ? getCalibrationProgress(
                        item.title.replace(/\s*\(\d+\s*Splits.*\)$/i, ""),
                        item.kind,
                        item.kind === "strength"
                          ? state.recentExerciseLogs
                          : state.recentCardioLogs,
                        state.todayIso,
                        item.createdAt
                      )
                    : null;

                return (
                  <div
                    key={item.id}
                    className="py-3.5 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => handleEditTodayItem(item)}
                      className="min-w-0 flex-1 text-left group cursor-pointer"
                      title="Tap to edit entry"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] font-medium text-white group-hover:text-[#30d158] transition-colors truncate">
                          {item.title}
                        </span>
                        <Pencil className="w-3 h-3 text-[#636366] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        {item.kcalIsEstimated && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#1c1c1e] text-[#86868b]">
                            Est.
                          </span>
                        )}
                        {item.addedLater && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#1c1c1e] text-[#86868b]">
                            Added later
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-[#86868b] mt-0.5 tabular-nums truncate">
                        {item.detail}
                        {formatLogTime(item.createdAt)
                          ? ` · ${formatLogTime(item.createdAt)}`
                          : ""}
                      </div>
                      {item.splits && item.splits.length > 1 && (
                        <div className="mt-1.5 pl-2.5 border-l border-white/[0.08] space-y-0.5">
                          {item.splits.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] text-[#86868b] tabular-nums leading-tight"
                            >
                              <span className="font-medium text-[#d1d1d6] whitespace-nowrap shrink-0">
                                Split {s.splitNumber}:
                              </span>
                              <span className="whitespace-nowrap">{s.minutes}m</span>
                              {s.distanceKm && (
                                <span className="whitespace-nowrap">
                                  · {formatDistance(s.distanceKm, profile.weightUnit)}
                                </span>
                              )}
                              <span className="whitespace-nowrap">· {s.kcal} kcal</span>
                              {formatLogTime(s.createdAt) && (
                                <span className="whitespace-nowrap opacity-75">
                                  · {formatLogTime(s.createdAt)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </button>

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
                      className="shrink-0 px-2 py-1 rounded-lg hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                    >
                      {item.status === "Calibrating" ? (
                        <span className="text-[11px] font-medium text-amber-400 tabular-nums">
                          {calInfo ? calInfo.label : "Calibrating"}
                        </span>
                      ) : item.status === "Rest" ? (
                        <span className="text-[12px] font-medium text-[#86868b]">Rest</span>
                      ) : (
                        <span className="text-[16px] font-semibold text-[#30d158] tabular-nums">
                          {item.effortScore}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Compact Leaderboard Preview */}
      {topFriends.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="apple-section-label">Leaderboard</span>
            <button
              type="button"
              onClick={() => onNavigateTab("leaderboard")}
              className="text-[13px] font-medium text-[#30d158] flex items-center gap-0.5 cursor-pointer"
            >
              See All
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="apple-card px-4 py-1 divide-y divide-white/[0.06]">
            {topFriends.map((member, idx) => (
              <div
                key={member.userId}
                className="py-3 flex items-center justify-between text-[14px]"
              >
                <div className="flex items-center gap-3">
                  <span className="w-4 text-[12px] font-medium text-[#86868b] tabular-nums">
                    {idx + 1}
                  </span>
                  <span className={member.isMe ? "font-semibold text-white" : "text-[#f5f5f7]"}>
                    {member.isMe ? "You" : member.name.split(" ")[0]}
                  </span>
                  <span className="text-[12px] text-[#86868b] tabular-nums">
                    {member.activeDaysThisMonth}d · {member.currentStreak}d streak
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setScoreReason(buildLeaderboardScoreReason(member, "month"))}
                  className="flex items-center gap-1.5 tabular-nums px-2 py-0.5 rounded-lg hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                >
                  {member.isMonthCalibrating && (
                    <span className="text-[10px] font-medium text-amber-400">Est.</span>
                  )}
                  <span
                    className={`font-semibold text-[15px] ${
                      member.isMonthCalibrating ? "text-amber-400" : "text-[#30d158]"
                    }`}
                  >
                    {member.monthEffort}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ScoreReasonSheet reason={scoreReason} onClose={() => setScoreReason(null)} />
    </div>
  );
}
