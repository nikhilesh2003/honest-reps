"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { AppStatePayload } from "@/lib/client-types";
import { apiDeleteLog } from "@/lib/client-engine";
import { CardioLog, ExerciseLog } from "@/lib/types";
import {
  detectPersonalRecords,
  formatDistance,
  formatFullDate,
  formatLogTime,
  formatRestDuration,
  formatWeight,
  normalizeCardioActivityKey,
} from "@/lib/effort";
import { BottomSheet } from "../ui/BottomSheet";

interface LogsTabProps {
  state: AppStatePayload;
  onOpenBackfillStrength: () => void;
  onOpenBackfillCardio: () => void;
  onEditStrength: (log: ExerciseLog) => void;
  onEditCardio: (log: CardioLog) => void;
  onDeleted: (msg: string) => void;
}

type FilterKey = "all" | "strength" | "cardio" | "calibrating" | "rest" | "backfilled";

interface UnifiedLogRow {
  id: string;
  kind: "strength" | "cardio";
  date: string;
  title: string;
  subtitle: string;
  details: string;
  kcal?: number;
  effortScore: number | null;
  status: "Calibrating" | "Scored" | "Rest";
  addedLater: boolean;
  kcalIsEstimated?: boolean;
  source: string;
  createdAt: string;
  isPr?: boolean;
  prDetails?: string;
  splits?: Array<{
    id: string;
    splitNumber: number;
    minutes: number;
    distanceKm?: number;
    kcal: number;
    createdAt: string;
  }>;
}

export function LogsTab({
  state,
  onOpenBackfillStrength,
  onOpenBackfillCardio,
  onEditStrength,
  onEditCardio,
  onDeleted,
}: LogsTabProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [backfillPickerOpen, setBackfillPickerOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const unit = state.profile.weightUnit;

  const unifiedLogs = useMemo<UnifiedLogRow[]>(() => {
    const strengthRows: UnifiedLogRow[] = state.recentExerciseLogs.map((e) => {
      // Find earlier logs for this exercise to detect if this session achieved a PR
      const priorHistory = state.recentExerciseLogs.filter(
        (l) =>
          l.exerciseName.trim().toLowerCase() === e.exerciseName.trim().toLowerCase() &&
          (l.date < e.date || (l.date === e.date && l.createdAt < e.createdAt))
      );
      const prCheck = detectPersonalRecords(e.exerciseName, e.sets, priorHistory);
      const isPr = prCheck.isWeightPr || prCheck.isOneRepMaxPr;

      const restValues = e.sets
        .map((s) => s.restSeconds)
        .filter((r): r is number => typeof r === "number" && r > 0);
      const avgRest =
        restValues.length > 0
          ? Math.round(restValues.reduce((acc, r) => acc + r, 0) / restValues.length)
          : 0;

      return {
        id: e.id,
        kind: "strength",
        date: e.date,
        title: e.exerciseName,
        subtitle: e.muscleGroup,
        details:
          e.sets
            .map((s) => `${formatWeight(s.weightKg, unit)} × ${s.reps}`)
            .join(" · ") +
          (avgRest > 0 ? ` · avg ${formatRestDuration(avgRest)} rest` : "") +
          (e.optionalMinutes ? ` · ${e.optionalMinutes} min` : "") +
          (typeof e.rir === "number" ? ` · RIR ${e.rir === 4 ? "4+" : e.rir}` : ""),
        effortScore: e.effortScore,
        status: e.status,
        addedLater: e.addedLater,
        source: e.source,
        createdAt: e.createdAt,
        isPr,
        prDetails:
          prCheck.isWeightPr && prCheck.isOneRepMaxPr
            ? "Weight & 1RM PR"
            : prCheck.isWeightPr
            ? "Max Weight PR"
            : prCheck.isOneRepMaxPr
            ? "1RM PR"
            : undefined,
      };
    });

    const cardioByDate = new Map<string, typeof state.recentCardioLogs>();
    for (const c of state.recentCardioLogs) {
      const list = cardioByDate.get(c.date) || [];
      list.push(c);
      cardioByDate.set(c.date, list);
    }

    const cardioRows: UnifiedLogRow[] = [];

    for (const [date, logs] of cardioByDate.entries()) {
      const activityGroups = new Map<string, typeof state.recentCardioLogs>();
      for (const c of logs) {
        const groupKey = `${c.isRestActivity ? "rest" : "active"}__${normalizeCardioActivityKey(
          c.activityType
        )}`;
        const group = activityGroups.get(groupKey) || [];
        group.push(c);
        activityGroups.set(groupKey, group);
      }

      for (const groupLogs of activityGroups.values()) {
        const sorted = [...groupLogs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (sorted.length > 1) {
          const splits = sorted.map((c, idx) => ({
            id: c.id,
            splitNumber: idx + 1,
            minutes: c.minutes,
            distanceKm: c.distanceKm,
            kcal: c.kcal,
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

          cardioRows.push({
            id: `splits_${sorted[0].id}`,
            kind: "cardio",
            date,
            title: `${displayTitle} (${splits.length} Splits)`,
            subtitle: `${allRest ? "Rest" : "Cardio"} · ${splits.length} splits on ${date}`,
            details: [
              `${totalMins} min`,
              totalDist > 0 ? formatDistance(totalDist, unit) : null,
              weightedHr ? `${weightedHr} bpm` : null,
              `${totalKcal} kcal`,
              `${splits.length} splits`,
            ]
              .filter(Boolean)
              .join(" · "),
            effortScore: dailyCardioScore,
            status: allRest ? "Rest" : allScored ? "Scored" : "Calibrating",
            kcal: totalKcal,
            addedLater: sorted.some((c) => c.addedLater),
            kcalIsEstimated: sorted.some((c) => c.kcalIsEstimated),
            source: sorted[0].source,
            createdAt: sorted[sorted.length - 1].createdAt,
            splits,
          });
        } else {
          const c = sorted[0];
          cardioRows.push({
            id: c.id,
            kind: "cardio",
            date: c.date,
            title: c.activityType,
            subtitle: c.isRestActivity ? "Rest" : "Cardio",
            details: [
              `${c.minutes} min`,
              c.distanceKm ? formatDistance(c.distanceKm, unit) : null,
              c.avgHeartRate ? `${c.avgHeartRate} bpm` : null,
              `${c.kcal} kcal`,
            ]
              .filter(Boolean)
              .join(" · "),
            effortScore: c.effortScore,
            status: c.status,
            kcal: c.kcal,
            addedLater: c.addedLater,
            kcalIsEstimated: c.kcalIsEstimated,
            source: c.source,
            createdAt: c.createdAt,
          });
        }
      }
    }

    return [...strengthRows, ...cardioRows].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    );
  }, [state.recentExerciseLogs, state.recentCardioLogs, unit]);

  const filtered = useMemo(() => {
    return unifiedLogs.filter((row) => {
      if (filter === "all") return true;
      if (filter === "strength") return row.kind === "strength";
      if (filter === "cardio") return row.kind === "cardio" && row.status !== "Rest";
      if (filter === "calibrating") return row.status === "Calibrating";
      if (filter === "rest") return row.status === "Rest";
      if (filter === "backfilled") return row.addedLater;
      return true;
    });
  }, [unifiedLogs, filter]);

  // Group chronologically by date
  const groupedByDate = useMemo(() => {
    const map = new Map<string, UnifiedLogRow[]>();
    for (const row of filtered.slice(0, 45)) {
      const list = map.get(row.date) ?? [];
      list.push(row);
      map.set(row.date, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const totalSetsMonth = state.recentExerciseLogs
    .filter((e) => e.date.startsWith(state.monthStats.monthPrefix))
    .reduce((acc, e) => acc + e.sets.length, 0);

  const handleDelete = async (row: UnifiedLogRow) => {
    setDeletingId(row.id);
    try {
      if (row.splits && row.splits.length > 0) {
        let anyDeleted = false;
        for (const s of row.splits) {
          const res = await apiDeleteLog("cardio", s.id);
          if (res.ok) anyDeleted = true;
        }
        if (anyDeleted) {
          onDeleted(`Removed ${row.title}`);
        }
      } else {
        const res = await apiDeleteLog(row.kind, row.id);
        if (res.ok) {
          onDeleted(`Removed ${row.title}`);
        }
      }
    } finally {
      setDeletingId(null);
    }
  };

  const chips: Array<{ key: FilterKey; label: string }> = [
    { key: "all", label: "All" },
    { key: "strength", label: "Strength" },
    { key: "cardio", label: "Cardio" },
    { key: "calibrating", label: "Calibrating" },
    { key: "rest", label: "Rest" },
    { key: "backfilled", label: "Added later" },
  ];

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white">Logs</h1>
        <button
          type="button"
          onClick={() => setBackfillPickerOpen(true)}
          className="px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[12px] font-medium text-[#10e760] flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <CalendarPlus className="w-3.5 h-3.5" />
          Backfill
        </button>
      </div>

      {/* Minimal 4-Stat Strip */}
      <div className="apple-card grid grid-cols-4 divide-x divide-white/[0.06] py-3.5">
        <div className="text-center px-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            Active
          </div>
          <div className="text-[18px] font-bold text-white tabular-nums mt-0.5">
            {state.monthStats.activeDaysThisMonth}
          </div>
        </div>
        <div className="text-center px-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            Effort
          </div>
          <div className="text-[18px] font-bold text-[#10e760] tabular-nums mt-0.5">
            {state.monthStats.monthEffort ?? "—"}
          </div>
        </div>
        <div className="text-center px-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            Sets
          </div>
          <div className="text-[18px] font-bold text-white tabular-nums mt-0.5">
            {totalSetsMonth}
          </div>
        </div>
        <div className="text-center px-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            Cardio
          </div>
          <div className="text-[16px] font-bold text-white tabular-nums mt-0.5">
            {formatDistance(state.cardioTotals.totalDistanceKm, unit)}
          </div>
        </div>
      </div>

      {/* Clean Scrollbar-Free Filter Chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
        {chips.map((c) => {
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer border ${
                active
                  ? "bg-white text-black border-white"
                  : "bg-[#0a0a0c] text-[#86868b] border-white/[0.08] hover:text-white"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Grouped History List */}
      {groupedByDate.length === 0 ? (
        <div className="apple-card p-8 text-center text-[13px] text-[#86868b]">
          No logs match this filter.
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByDate.map(([date, items]) => {
            const daySummary = state.summaries365.find((d) => d.date === date);
            const dayKcal = state.recentCardioLogs
              .filter((c) => c.date === date)
              .reduce((sum, c) => sum + (c.kcal || 0), 0);
            return (
              <div key={date} className="apple-card p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                  <div>
                    <div className="text-[13px] font-semibold text-white">
                      {date === state.realTodayIso
                        ? "Today"
                        : formatFullDate(date).replace(/,\s*\d{4}$/, "")}
                    </div>
                    <div className="text-[11px] text-[#86868b] tabular-nums">
                      {daySummary?.isRest
                        ? "Rest day"
                        : daySummary?.sessionGroups.join(" · ") || "Workout"}
                      {dayKcal > 0 ? ` · ${dayKcal.toLocaleString()} kcal` : ""}
                    </div>
                  </div>
                  <div>
                    {daySummary?.status === "Scored" && daySummary.effortScore !== null ? (
                      <span className="px-2.5 py-1 rounded-full text-[12px] font-semibold tabular-nums bg-[#10e760]/12 text-[#10e760] border border-[#10e760]/25">
                        {daySummary.effortScore} · {daySummary.band}
                      </span>
                    ) : daySummary?.status === "Calibrating" ? (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        Calibrating
                      </span>
                    ) : daySummary?.status === "Rest" ? (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.06] text-[#a1a1a6] border border-white/10">
                        Rest
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="divide-y divide-white/[0.05]">
                  {items.map((row) => (
                    <div
                      key={row.id}
                      className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[14px] font-medium text-[#f5f5f7]">
                            {row.title}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[#86868b]">
                            {row.subtitle}
                          </span>
                          {row.isPr && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30 font-semibold tracking-wide flex items-center gap-1">
                              <span>★ PR</span>
                              {row.prDetails && (
                                <span className="font-normal opacity-85 text-[9px]">{row.prDetails}</span>
                              )}
                            </span>
                          )}
                          {row.addedLater && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.09] text-[#d1d1d6]">
                              Added later
                            </span>
                          )}
                          {row.kcalIsEstimated && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.09] text-[#d1d1d6]">
                              Estimated
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-[#86868b] mt-0.5 tabular-nums">
                          {row.details}
                          {formatLogTime(row.createdAt) ? ` · ${formatLogTime(row.createdAt)}` : ""}
                        </div>
                        {row.splits && row.splits.length > 1 && (
                          <div className="mt-1.5 pl-2 border-l border-white/15 space-y-0.5">
                            {row.splits.map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] text-[#86868b] tabular-nums leading-tight"
                              >
                                <span className="font-semibold text-white/90 whitespace-nowrap shrink-0">
                                  Split {s.splitNumber}:
                                </span>
                                <span className="whitespace-nowrap">{s.minutes}m</span>
                                {s.distanceKm && (
                                  <span className="whitespace-nowrap">· {formatDistance(s.distanceKm, unit)}</span>
                                )}
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

                      <div className="flex items-center gap-2.5 shrink-0">
                        {row.status === "Calibrating" ? (
                          <span className="text-[11px] font-medium text-amber-400">
                            Calibrating
                          </span>
                        ) : row.status === "Rest" ? (
                          <span className="text-[11px] font-medium text-[#86868b]">
                            Rest
                          </span>
                        ) : (
                          <span className="text-[15px] font-semibold text-[#10e760] tabular-nums">
                            {row.effortScore}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (row.kind === "strength") {
                              const found = state.recentExerciseLogs.find((e) => e.id === row.id);
                              if (found) onEditStrength(found);
                            } else {
                              const targetId = row.splits?.length
                                ? row.splits[row.splits.length - 1].id
                                : row.id;
                              const found = state.recentCardioLogs.find((c) => c.id === targetId);
                              if (found) onEditCardio(found);
                            }
                          }}
                          aria-label={`Edit ${row.title}`}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#525257] hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          disabled={deletingId === row.id}
                          onClick={() => handleDelete(row)}
                          aria-label={`Delete ${row.title}`}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#525257] hover:text-red-400 hover:bg-white/[0.05] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Backfill Type Selector Sheet (FR-34) */}
      <BottomSheet
        open={backfillPickerOpen}
        onClose={() => setBackfillPickerOpen(false)}
        title="Backfill Entry"
        subtitle={`Up to ${state.appSettings.backfillWindowDays} days back · Labeled "Added later"`}
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setBackfillPickerOpen(false);
              onOpenBackfillStrength();
            }}
            className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-left cursor-pointer"
          >
            <div className="text-[15px] font-semibold text-white">Strength</div>
            <div className="text-[12px] text-[#86868b] mt-0.5">Sets & reps</div>
          </button>
          <button
            type="button"
            onClick={() => {
              setBackfillPickerOpen(false);
              onOpenBackfillCardio();
            }}
            className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-left cursor-pointer"
          >
            <div className="text-[15px] font-semibold text-white">Cardio</div>
            <div className="text-[12px] text-[#86868b] mt-0.5">Text or photo</div>
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
