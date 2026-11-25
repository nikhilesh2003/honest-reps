"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Zap,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
  RotateCcw,
  Bell,
  X,
  Dumbbell,
} from "lucide-react";
import { AppStatePayload } from "@/lib/client-types";
import { DaySummary, EffortBand } from "@/lib/types";
import { formatFullDate, formatLogTime } from "@/lib/effort";
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
  onNavigateTab,
}: HomeTabProps) {
  const { profile, todaySummary, previousScoredDay, rolling7Days, monthStats, todaySession } = state;
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

  // Top 6 exercise pills matching today's Session for instant 2-tap logging (FR-10, NFR-4)
  const sessionGroups =
    todaySession && !todaySession.isRest ? todaySession.muscleGroups : [];
  const quickPills = (
    sessionGroups.length > 0
      ? state.visibleExercises.filter((e) => sessionGroups.includes(e.muscleGroup))
      : state.visibleExercises
  ).slice(0, 6);

  const sessionLabel = todaySession
    ? todaySession.isRest
      ? "Rest Day"
      : todaySession.muscleGroups.join(" & ")
    : "Choose Session";

  const topFriends = [...state.leaderboard]
    .filter((f) => f.monthEffort !== null)
    .sort((a, b) => (b.monthEffort ?? 0) - (a.monthEffort ?? 0))
    .slice(0, 3);

  // Match latest admin notification targeted to this user
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

  return (
    <div className="space-y-4 pb-6">
      {/* Admin Broadcast / Targeted Notification Banner */}
      {latestAnn && (
        <div className="apple-card p-3.5 flex items-start justify-between gap-3 border-[#10e760]/30">
          <div className="flex items-start gap-2.5 min-w-0">
            <Bell className="w-4 h-4 text-[#10e760] shrink-0 mt-0.5" />
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

      {/* Minimal Apple Header */}
      <div className="flex items-start justify-between gap-3 pt-1">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            {formatFullDate(state.todayIso).replace(/,\s*\d{4}$/, "")}
          </div>
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white leading-tight mt-0.5">
            {firstName}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => onNavigateTab("profile")}
          className="text-right cursor-pointer group"
        >
          <div className="text-[13px] font-medium text-[#10e760] group-hover:underline">
            @{profile.username}
          </div>
          <div className="text-[12px] text-[#86868b] tabular-nums">
            {monthStats.currentStreak}d streak
          </div>
        </button>
      </div>

      {/* 2-Card Row: Left = In the Gym Live Toggle, Right = Today's Session */}
      <div className="grid grid-cols-2 gap-3 items-stretch">
        {/* Left Card: In the Gym ON/OFF with Glow Backdrop */}
        <div className="relative flex">
          {inGym && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-1 rounded-[22px] bg-[#10e760]/30 blur-xl animate-pulse"
            />
          )}
          <button
            type="button"
            role="switch"
            aria-checked={inGym}
            onClick={onToggleInGym}
            className={`relative w-full p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-2.5 transition-all active:scale-[0.98] cursor-pointer ${
              inGym
                ? "bg-[#091c10] border-[#10e760]/70 shadow-[0_0_24px_rgba(16,231,96,0.35)]"
                : "bg-[#0a0a0c] border-white/[0.08] hover:border-white/20"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                  inGym
                    ? "bg-[#10e760] text-black shadow-[0_0_14px_rgba(16,231,96,0.6)]"
                    : "bg-white/[0.06] text-[#86868b]"
                }`}
              >
                <Dumbbell className="w-4 h-4" />
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-[0.04em] uppercase transition-colors ${
                  inGym
                    ? "bg-[#10e760] text-black"
                    : "bg-white/[0.07] text-[#86868b]"
                }`}
              >
                {inGym ? "ON" : "OFF"}
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-semibold text-white truncate">
                  In the Gym
                </span>
                {inGym && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10e760] animate-ping shrink-0" />
                )}
              </div>
              <div className="text-[11px] text-[#86868b] tabular-nums mt-0.5 truncate">
                {inGym ? `Live ${elapsedLabel || "0m"} · Auto-off 2h` : "Tap when at gym"}
              </div>
            </div>
          </button>
        </div>

        {/* Right Card: Today's Session Focus (FR-6–FR-8) */}
        <button
          type="button"
          onClick={onOpenCheckin}
          className="w-full p-3.5 rounded-2xl bg-[#0a0a0c] border border-white/[0.08] hover:border-white/20 text-left flex flex-col justify-between gap-2.5 transition-all active:scale-[0.98] cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                todaySession?.isRest
                  ? "bg-white/[0.06] text-[#86868b]"
                  : "bg-[#10e760]/12 text-[#10e760]"
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  todaySession?.isRest ? "bg-[#86868b]" : "bg-[#10e760]"
                }`}
              />
            </span>
            <span className="text-[11px] text-[#86868b] flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" />
              Edit
            </span>
          </div>

          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Today&apos;s Session
            </div>
            <div className="text-[14px] font-semibold text-white truncate mt-0.5">
              {sessionLabel}
            </div>
          </div>
        </button>
      </div>

      {/* HERO EFFORT CARD + 7-DAY ROLLING SLIDING BARS (Reason hidden; tap score number for popup) */}
      <div className="apple-card p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Effort
            </div>
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
                className="flex items-baseline gap-1.5 mt-1 rounded-xl px-1.5 py-0.5 -mx-1.5 hover:bg-white/[0.05] active:scale-95 transition-all cursor-pointer"
              >
                <span
                  className={`text-[48px] font-bold tracking-[-0.04em] leading-none tabular-nums ${
                    todaySummary.status === "Calibrating" ? "text-amber-400" : "text-[#10e760]"
                  }`}
                >
                  {todayScore}
                </span>
                <span className="text-[15px] font-medium text-[#525257] tabular-nums">
                  / 100
                </span>
              </button>
            ) : todaySummary.status === "Rest" ? (
              <button
                type="button"
                onClick={() => setScoreReason(buildDayScoreReason(todaySummary))}
                className="text-[26px] font-semibold tracking-[-0.02em] text-[#a1a1a6] mt-1.5 hover:text-white cursor-pointer"
              >
                Rest
              </button>
            ) : (
              <div className="text-[20px] font-medium tracking-[-0.02em] text-[#86868b] mt-2">
                No activity logged
              </div>
            )}
          </div>

          <div className="text-right space-y-1.5">
            {delta !== null ? (
              <div
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium tabular-nums border ${
                  delta >= 0
                    ? "bg-[#10e760]/12 border-[#10e760]/30 text-[#10e760]"
                    : "bg-[#145a27]/25 border-[#1ca645]/30 text-[#86efac]"
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
              <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.05] text-[#86868b] border border-white/[0.08]">
                {todaySummary.band}
              </span>
            )}
            {delta !== null && (
              <div className="text-[11px] text-[#86868b] tabular-nums">
                {todaySummary.status === "Calibrating"
                  ? "Est. · Calibrating"
                  : todaySummary.band}
              </div>
            )}
          </div>
        </div>

        {/* 7-Day Rolling Sliding Bars (Older left -> Today ALWAYS far right) */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              7 Days
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onChangeDayShift(dayShift - 1)}
                aria-label="Previous day"
                className="w-6 h-6 rounded-full bg-white/[0.05] hover:bg-white/[0.12] flex items-center justify-center text-[#86868b] hover:text-white cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {dayShift !== 0 && (
                <button
                  type="button"
                  onClick={() => onChangeDayShift(0)}
                  aria-label="Back to today"
                  className="px-2 h-6 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-medium text-[#10e760] flex items-center gap-1 cursor-pointer"
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
                className="w-6 h-6 rounded-full bg-white/[0.05] hover:bg-white/[0.12] disabled:opacity-25 flex items-center justify-center text-[#86868b] hover:text-white cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="relative pt-1 pb-1">
            <div
              className="pointer-events-none absolute left-0 right-0 flex items-center"
              style={{ top: "calc(22px + 44px)" }}
            >
              <div className="w-full border-t border-dashed border-white/15" />
            </div>

            <div className="grid grid-cols-7 gap-2 relative z-10">
              {rolling7Days.map((day: DaySummary, idx: number) => {
                const isToday = idx === rolling7Days.length - 1;
                const heightPct =
                  day.effortScore !== null
                    ? Math.max(16, Math.min(100, day.effortScore))
                    : day.status === "Calibrating"
                    ? 36
                    : 0;

                const fillColor = getBarColorStyle(day.band, isToday, day.status);
                const canInspect = day.status !== "No log";

                return (
                  <div key={day.date} className="flex flex-col items-center gap-1.5">
                    <span
                      className={`text-[11px] font-semibold leading-none ${
                        isToday ? "text-[#10e760]" : "text-[#86868b]"
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
                      className={`w-full h-[88px] rounded-[12px] p-[2px] flex flex-col justify-end overflow-hidden transition-all ${
                        canInspect ? "cursor-pointer hover:brightness-110 active:scale-95" : "cursor-default"
                      } ${
                        isToday
                          ? "bg-[#050506] border border-[#10e760]/60 shadow-[0_0_14px_rgba(16,231,96,0.16)]"
                          : day.isRest
                          ? "bg-[#08080b] border border-dashed border-white/15"
                          : "bg-[#050506] border border-white/[0.08]"
                      }`}
                    >
                      {day.status === "Scored" && day.effortScore !== null ? (
                        <div
                          className="w-full rounded-[9px] flex items-start justify-center pt-1 transition-all duration-500"
                          style={{
                            height: `${heightPct}%`,
                            backgroundColor: fillColor,
                          }}
                        >
                          <span
                            className={`text-[10px] font-bold tabular-nums leading-none ${
                              day.effortScore >= 45 || isToday
                                ? "text-black"
                                : "text-[#bbf7d0]"
                            }`}
                          >
                            {day.effortScore}
                          </span>
                        </div>
                      ) : day.status === "Calibrating" ? (
                        <div
                          className="w-full rounded-[9px] flex items-start justify-center pt-1 transition-all duration-500"
                          style={{
                            height: `${heightPct}%`,
                            backgroundColor: fillColor,
                          }}
                        >
                          <span
                            className={`text-[10px] font-bold tabular-nums leading-none ${
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
                          <span className="text-[9px] font-medium text-[#525257]">
                            Rest
                          </span>
                        </div>
                      ) : (
                        <div className="h-full flex items-end justify-center pb-2 w-full">
                          <span className="text-[10px] text-[#2c2c30]">—</span>
                        </div>
                      )}
                    </button>

                    <span
                      className={`text-[10px] leading-none tabular-nums truncate max-w-full ${
                        isToday ? "text-[#10e760] font-semibold" : "text-[#525257]"
                      }`}
                    >
                      {isToday && dayShift === 0 ? "Today" : day.date.slice(8)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/[0.06] text-[11px] text-[#86868b]">
            <span>Baseline 50</span>
            <button
              type="button"
              onClick={() => setScoreReason(buildMonthScoreReason(state))}
              className="tabular-nums hover:text-white transition-colors cursor-pointer text-right group"
              title="Tap for Monthly Effort & Recovery Health breakdown"
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

      {/* QUICK ACTIONS RIGHT ON HOME SCREEN (Log Strength & Log Cardio) */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onOpenStrength()}
          className="apple-card p-4 text-left hover:border-[#10e760]/50 active:scale-[0.98] transition-all cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-full bg-[#10e760]/15 flex items-center justify-center text-[#10e760] mb-3 group-hover:bg-[#10e760] group-hover:text-black transition-colors">
            <Plus className="w-5 h-5" />
          </div>
          <div className="text-[15px] font-semibold text-white tracking-[-0.01em]">
            Log Strength
          </div>
          <div className="text-[12px] text-[#86868b] mt-0.5">Sets & reps</div>
        </button>

        <button
          type="button"
          onClick={onOpenCardio}
          className="apple-card p-4 text-left hover:border-white/25 active:scale-[0.98] transition-all cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-full bg-white/[0.07] flex items-center justify-center text-white mb-3 group-hover:bg-white group-hover:text-black transition-colors">
            <Zap className="w-4 h-4" />
          </div>
          <div className="text-[15px] font-semibold text-white tracking-[-0.01em]">
            Log Cardio
          </div>
          <div className="text-[12px] text-[#86868b] mt-0.5">Text or photo</div>
        </button>
      </div>

      {/* Quick Exercise Pills (FR-10) */}
      {!todaySession?.isRest && quickPills.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b] mb-2">
            Quick Log
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {quickPills.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => onOpenStrength(ex.name)}
                className="shrink-0 px-3.5 py-2 rounded-full bg-[#0a0a0c] border border-white/[0.08] hover:border-[#10e760]/60 text-[13px] font-medium text-[#f5f5f7] transition-colors cursor-pointer"
              >
                {ex.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Today's Session Items */}
      <div className="apple-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            Today
          </span>
          <button
            type="button"
            onClick={() => onNavigateTab("logs")}
            className="text-[12px] font-medium text-[#10e760] flex items-center gap-0.5 cursor-pointer"
          >
            History
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {todaySummary.loggedItems.length === 0 ? (
          <div className="py-5 text-center text-[13px] text-[#86868b]">
            {todaySummary.isRest ? "Rest day" : "No activity logged"}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {todaySummary.loggedItems.map((item) => (
              <div
                key={item.id}
                className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium text-white truncate">
                      {item.title}
                    </span>
                    {item.kcalIsEstimated && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.07] text-[#a1a1a6]">
                        Estimated
                      </span>
                    )}
                    {item.addedLater && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.07] text-[#a1a1a6]">
                        Added later
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[#86868b] mt-0.5 tabular-nums truncate">
                    {item.detail}
                    {formatLogTime(item.createdAt) ? ` · ${formatLogTime(item.createdAt)}` : ""}
                  </div>
                  {item.splits && item.splits.length > 1 && (
                    <div className="mt-1.5 pl-2 border-l border-white/15 space-y-0.5">
                      {item.splits.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] text-[#86868b] tabular-nums leading-tight"
                        >
                          <span className="font-semibold text-white/90 whitespace-nowrap shrink-0">
                            Split {s.splitNumber}:
                          </span>
                          <span className="whitespace-nowrap">{s.minutes}m</span>
                          {s.distanceKm && <span className="whitespace-nowrap">· {s.distanceKm}km</span>}
                          <span className="whitespace-nowrap">· {s.kcal}kcal</span>
                          {formatLogTime(s.createdAt) && (
                            <span className="whitespace-nowrap opacity-75">
                              · {formatLogTime(s.createdAt)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
                  className="shrink-0 px-2 py-1 rounded-lg hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                >
                  {item.status === "Calibrating" ? (
                    <span className="text-[11px] font-medium text-amber-400">
                      Calibrating
                    </span>
                  ) : item.status === "Rest" ? (
                    <span className="text-[11px] font-medium text-[#86868b]">Rest</span>
                  ) : (
                    <span className="text-[15px] font-semibold text-[#10e760] tabular-nums">
                      {item.effortScore}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compact Leaderboard Preview */}
      {topFriends.length > 0 && (
        <div className="apple-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Month Leaderboard
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab("leaderboard")}
              className="text-[12px] font-medium text-[#10e760] flex items-center gap-0.5 cursor-pointer"
            >
              All
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2.5">
            {topFriends.map((member, idx) => (
              <div
                key={member.userId}
                className="flex items-center justify-between text-[13px]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-5 text-[12px] font-semibold text-[#86868b] tabular-nums">
                    {idx + 1}
                  </span>
                  <span className={member.isMe ? "font-semibold text-white" : "text-[#d1d1d6]"}>
                    {member.isMe ? "You" : member.name.split(" ")[0]}
                  </span>
                  <span className="text-[11px] text-[#525257] tabular-nums">
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
                    className={`font-semibold ${
                      member.isMonthCalibrating ? "text-amber-400" : "text-[#10e760]"
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
