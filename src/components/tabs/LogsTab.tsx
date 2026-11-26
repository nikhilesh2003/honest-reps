"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Pencil, Search, Trash2, X } from "lucide-react";
import { AppStatePayload } from "@/lib/client-types";
import { apiDeleteLog, apiRestoreDeletedLogs } from "@/lib/client-engine";
import { CardioLog, ExerciseLog } from "@/lib/types";
import {
  detectPersonalRecords,
  formatDistance,
  formatFullDate,
  formatLogTime,
  formatRestDuration,
  formatWeight,
  getCalibrationProgress,
  normalizeCardioActivityKey,
} from "@/lib/effort";
import { BottomSheet } from "../ui/BottomSheet";

interface LogsTabProps {
  state: AppStatePayload;
  onOpenBackfillStrength: () => void;
  onOpenBackfillCardio: () => void;
  onEditStrength: (log: ExerciseLog) => void;
  onEditCardio: (log: CardioLog) => void;
  onRefresh: () => void;
  onToast: (text: string, tone?: "success" | "error" | "info") => void;
  onDeleted: (msg: string, undoHandler?: () => void) => void;
}

type FilterKey = "all" | "strength" | "cardio" | "calibrating" | "rest" | "backfilled";

interface UnifiedLogRow {
  id: string;
  kind: "strength" | "cardio";
  date: string;
  title: string;
  rawName: string;
  subtitle: string;
  details: string;
  kcal?: number;
  effortScore: number | null;
  status: "Calibrating" | "Scored" | "Rest";
  calibrationLabel?: string;
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
  onRefresh,
  onToast,
  onDeleted,
}: LogsTabProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(45);
  const [backfillPickerOpen, setBackfillPickerOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const unit = state.profile.weightUnit;

  const unifiedLogs = useMemo<UnifiedLogRow[]>(() => {
    const strengthRows: UnifiedLogRow[] = state.recentExerciseLogs.map((e) => {
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

      const calLabel =
        e.status === "Calibrating"
          ? getCalibrationProgress(
              e.exerciseName,
              "strength",
              state.recentExerciseLogs,
              e.date,
              e.createdAt
            ).label
          : undefined;

      return {
        id: e.id,
        kind: "strength",
        date: e.date,
        title: e.exerciseName,
        rawName: e.exerciseName,
        subtitle: e.muscleGroup,
        details:
          e.sets
            .map((s) => `${formatWeight(s.weightKg, unit)} × ${s.reps}`)
            .join(" · ") +
          (avgRest > 0 ? ` · ${formatRestDuration(avgRest)} rest` : "") +
          (e.optionalMinutes ? ` · ${e.optionalMinutes}m` : "") +
          (typeof e.rir === "number" ? ` · RIR ${e.rir === 4 ? "4+" : e.rir}` : ""),
        effortScore: e.effortScore,
        status: e.status,
        calibrationLabel: calLabel,
        addedLater: e.addedLater,
        source: e.source,
        createdAt: e.createdAt,
        isPr,
        prDetails:
          prCheck.isWeightPr && prCheck.isOneRepMaxPr
            ? "Weight & 1RM"
            : prCheck.isWeightPr
            ? "Weight"
            : prCheck.isOneRepMaxPr
            ? "1RM"
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
        const rowStatus = sorted.every((c) => c.isRestActivity)
          ? "Rest"
          : sorted
              .filter((c) => !c.isRestActivity)
              .every((c) => c.status === "Scored" && typeof c.effortScore === "number")
          ? "Scored"
          : "Calibrating";

        const calLabel =
          rowStatus === "Calibrating"
            ? getCalibrationProgress(
                sorted[0].activityType,
                "cardio",
                state.recentCardioLogs,
                date
              ).label
            : undefined;

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
          const scoredLogs = activeLogs.filter(
            (c) => c.status === "Scored" && typeof c.effortScore === "number"
          );
          const dailyCardioScore =
            rowStatus === "Scored" && scoredLogs.length > 0 ? scoredLogs[0].effortScore : null;
          const displayTitle =
            normalizeCardioActivityKey(sorted[0].activityType) === "indoor walk"
              ? "Indoor Walk"
              : sorted[0].activityType;

          cardioRows.push({
            id: `splits_${sorted[0].id}`,
            kind: "cardio",
            date,
            title: `${displayTitle} (${splits.length} Splits)`,
            rawName: displayTitle,
            subtitle: `${rowStatus === "Rest" ? "Rest" : "Cardio"} · ${splits.length} splits`,
            details: [
              `${totalMins}m`,
              totalDist > 0 ? formatDistance(totalDist, unit) : null,
              weightedHr ? `${weightedHr} bpm` : null,
              `${totalKcal} kcal`,
            ]
              .filter(Boolean)
              .join(" · "),
            effortScore: dailyCardioScore,
            status: rowStatus,
            calibrationLabel: calLabel,
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
            rawName: c.activityType,
            subtitle: c.isRestActivity ? "Rest" : "Cardio",
            details: [
              `${c.minutes}m`,
              c.distanceKm ? formatDistance(c.distanceKm, unit) : null,
              c.avgHeartRate ? `${c.avgHeartRate} bpm` : null,
              `${c.kcal} kcal`,
            ]
              .filter(Boolean)
              .join(" · "),
            effortScore: c.effortScore,
            status: c.status,
            calibrationLabel: calLabel,
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
    const q = searchQuery.trim().toLowerCase();
    return unifiedLogs.filter((row) => {
      if (filter === "strength" && row.kind !== "strength") return false;
      if (filter === "cardio" && !(row.kind === "cardio" && row.status !== "Rest"))
        return false;
      if (filter === "calibrating" && row.status !== "Calibrating") return false;
      if (filter === "rest" && row.status !== "Rest") return false;
      if (filter === "backfilled" && !row.addedLater) return false;
      if (q) {
        return (
          row.title.toLowerCase().includes(q) ||
          row.subtitle.toLowerCase().includes(q) ||
          row.details.toLowerCase().includes(q) ||
          row.date.includes(q)
        );
      }
      return true;
    });
  }, [unifiedLogs, filter, searchQuery]);

  const visibleRows = useMemo(
    () => filtered.slice(0, visibleLimit),
    [filtered, visibleLimit]
  );

  const groupedByDate = useMemo(() => {
    const map = new Map<string, UnifiedLogRow[]>();
    for (const row of visibleRows) {
      const list = map.get(row.date) ?? [];
      list.push(row);
      map.set(row.date, list);
    }
    return [...map.entries()];
  }, [visibleRows]);

  const totalSetsMonth = state.recentExerciseLogs
    .filter((e) => e.date.startsWith(state.monthStats.monthPrefix))
    .reduce((acc, e) => acc + e.sets.length, 0);

  const handleDeleteRow = async (row: UnifiedLogRow) => {
    setDeletingId(row.id);
    try {
      if (row.splits && row.splits.length > 0) {
        const removedCardio: CardioLog[] = [];
        for (const s of row.splits) {
          const res = await apiDeleteLog("cardio", s.id);
          if (res.ok && res.deletedCardio) {
            removedCardio.push(res.deletedCardio);
          }
        }
        if (removedCardio.length > 0) {
          onDeleted(`Removed ${row.title}`, () => {
            void apiRestoreDeletedLogs({ cardioLogs: removedCardio }).then(() => {
              onToast(`Restored ${row.title}`);
              onRefresh();
            });
          });
        }
      } else {
        const res = await apiDeleteLog(row.kind, row.id);
        if (res.ok) {
          const strengthSnap = res.deletedStrength ? [res.deletedStrength] : undefined;
          const cardioSnap = res.deletedCardio ? [res.deletedCardio] : undefined;
          onDeleted(`Removed ${row.title}`, () => {
            void apiRestoreDeletedLogs({
              strengthLogs: strengthSnap,
              cardioLogs: cardioSnap,
            }).then(() => {
              onToast(`Restored ${row.title}`);
              onRefresh();
            });
          });
        }
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteSingleSplit = async (splitId: string, splitNum: number, title: string) => {
    setDeletingId(splitId);
    try {
      const res = await apiDeleteLog("cardio", splitId);
      if (res.ok && res.deletedCardio) {
        const snap = res.deletedCardio;
        onDeleted(`Removed ${title} Split ${splitNum}`, () => {
          void apiRestoreDeletedLogs({ cardioLogs: [snap] }).then(() => {
            onToast(`Restored ${title} Split ${splitNum}`);
            onRefresh();
          });
        });
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
      <div className="flex items-center justify-between">
        <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-white">History</h1>
        <button
          type="button"
          onClick={() => setBackfillPickerOpen(true)}
          className="px-3.5 py-2 rounded-full bg-[#111113] border border-white/[0.06] hover:border-white/15 text-[12px] font-medium text-[#30d158] flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <CalendarPlus className="w-3.5 h-3.5" />
          Backfill
        </button>
      </div>

      {/* Minimal 4-Stat Strip */}
      <div className="apple-card grid grid-cols-4 divide-x divide-white/[0.06] py-3.5">
        <div className="text-center px-1">
          <div className="text-[11px] font-medium text-[#86868b]">Active</div>
          <div className="text-[18px] font-semibold text-white tabular-nums mt-0.5">
            {state.monthStats.activeDaysThisMonth}
          </div>
        </div>
        <div className="text-center px-1">
          <div className="text-[11px] font-medium text-[#86868b]">Effort</div>
          <div className="text-[18px] font-semibold text-[#30d158] tabular-nums mt-0.5">
            {state.monthStats.monthEffort ?? "—"}
          </div>
        </div>
        <div className="text-center px-1">
          <div className="text-[11px] font-medium text-[#86868b]">Sets</div>
          <div className="text-[18px] font-semibold text-white tabular-nums mt-0.5">
            {totalSetsMonth}
          </div>
        </div>
        <div className="text-center px-1">
          <div className="text-[11px] font-medium text-[#86868b]">Cardio</div>
          <div className="text-[16px] font-semibold text-white tabular-nums mt-0.5">
            {formatDistance(state.cardioTotals.totalDistanceKm, unit)}
          </div>
        </div>
      </div>

      {/* iOS Search Field */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-[#86868b] absolute left-3.5 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setVisibleLimit(45);
          }}
          placeholder="Search exercise, muscle group, or date"
          className="w-full h-10 pl-10 pr-9 rounded-xl bg-[#111113] border border-white/[0.06] text-white text-[13px] placeholder:text-[#636366] focus:outline-none focus:border-[#30d158]"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 w-6 h-6 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-[#86868b] hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter Pills */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {chips.map((c) => {
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setFilter(c.key);
                setVisibleLimit(45);
              }}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
                active
                  ? "bg-white text-black font-semibold"
                  : "bg-[#111113] border border-white/[0.06] text-[#86868b] hover:text-white"
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
          No workouts match this filter.
        </div>
      ) : (
        <div className="space-y-5">
          {groupedByDate.map(([date, items]) => {
            const daySummary = state.summaries365.find((d) => d.date === date);
            const dayKcal = state.recentCardioLogs
              .filter((c) => c.date === date)
              .reduce((sum, c) => sum + (c.kcal || 0), 0);
            return (
              <div key={date} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-[14px] font-semibold text-white">
                      {date === state.realTodayIso
                        ? "Today"
                        : formatFullDate(date).replace(/,\s*\d{4}$/, "")}
                    </span>
                    <span className="text-[12px] text-[#86868b] truncate tabular-nums">
                      {daySummary?.isRest
                        ? "Rest"
                        : daySummary?.sessionGroups.join(" · ") || ""}
                      {dayKcal > 0 ? ` · ${dayKcal.toLocaleString()} kcal` : ""}
                    </span>
                  </div>
                  <div className="shrink-0">
                    {daySummary?.status === "Scored" && daySummary.effortScore !== null ? (
                      <span className="text-[12px] font-semibold tabular-nums text-[#30d158]">
                        {daySummary.effortScore} · {daySummary.band}
                      </span>
                    ) : daySummary?.status === "Calibrating" ? (
                      <span className="text-[11px] font-medium text-amber-400">
                        Calibrating
                      </span>
                    ) : daySummary?.status === "Rest" ? (
                      <span className="text-[11px] font-medium text-[#86868b]">Rest</span>
                    ) : null}
                  </div>
                </div>

                <div className="apple-card px-4 py-1 divide-y divide-white/[0.06]">
                  {items.map((row) => (
                    <div
                      key={row.id}
                      className="py-3 flex items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[15px] font-medium text-[#f5f5f7]">
                            {row.title}
                          </span>
                          <span className="text-[11px] text-[#86868b]">
                            · {row.subtitle}
                          </span>
                          {row.isPr && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 font-semibold">
                              PR{row.prDetails ? ` · ${row.prDetails}` : ""}
                            </span>
                          )}
                          {row.addedLater && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c1c1e] text-[#86868b]">
                              Added later
                            </span>
                          )}
                          {row.kcalIsEstimated && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1c1c1e] text-[#86868b]">
                              Est.
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-[#86868b] mt-0.5 tabular-nums">
                          {row.details}
                          {formatLogTime(row.createdAt)
                            ? ` · ${formatLogTime(row.createdAt)}`
                            : ""}
                        </div>
                        {row.splits && row.splits.length > 1 && (
                          <div className="mt-2 pl-2.5 border-l border-white/[0.08] space-y-1">
                            {row.splits.map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center justify-between gap-2 text-[11px] text-[#86868b] tabular-nums leading-tight"
                              >
                                <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
                                  <span className="font-medium text-[#d1d1d6] whitespace-nowrap shrink-0">
                                    Split {s.splitNumber}:
                                  </span>
                                  <span className="whitespace-nowrap">{s.minutes}m</span>
                                  {s.distanceKm && (
                                    <span className="whitespace-nowrap">
                                      · {formatDistance(s.distanceKm, unit)}
                                    </span>
                                  )}
                                  <span className="whitespace-nowrap">· {s.kcal} kcal</span>
                                  {formatLogTime(s.createdAt) && (
                                    <span className="whitespace-nowrap opacity-75">
                                      · {formatLogTime(s.createdAt)}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    aria-label={`Edit split ${s.splitNumber}`}
                                    onClick={() => {
                                      const found = state.recentCardioLogs.find(
                                        (c) => c.id === s.id
                                      );
                                      if (found) onEditCardio(found);
                                    }}
                                    className="w-6 h-6 rounded-md flex items-center justify-center text-[#636366] hover:text-white cursor-pointer"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Delete split ${s.splitNumber}`}
                                    disabled={deletingId === s.id}
                                    onClick={() =>
                                      handleDeleteSingleSplit(
                                        s.id,
                                        s.splitNumber,
                                        row.rawName
                                      )
                                    }
                                    className="w-6 h-6 rounded-md flex items-center justify-center text-[#636366] hover:text-red-400 cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {row.status === "Calibrating" ? (
                          <span className="text-[11px] font-medium text-amber-400 tabular-nums pr-1.5">
                            {row.calibrationLabel || "Calibrating"}
                          </span>
                        ) : row.status === "Rest" ? (
                          <span className="text-[12px] font-medium text-[#86868b] pr-1.5">
                            Rest
                          </span>
                        ) : (
                          <span className="text-[15px] font-semibold text-[#30d158] tabular-nums pr-1.5">
                            {row.effortScore}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (row.kind === "strength") {
                              const found = state.recentExerciseLogs.find(
                                (e) => e.id === row.id
                              );
                              if (found) onEditStrength(found);
                            } else {
                              const targetId = row.splits?.length
                                ? row.splits[row.splits.length - 1].id
                                : row.id;
                              const found = state.recentCardioLogs.find(
                                (c) => c.id === targetId
                              );
                              if (found) onEditCardio(found);
                            }
                          }}
                          aria-label={`Edit ${row.title}`}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[#636366] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          disabled={deletingId === row.id}
                          onClick={() => handleDeleteRow(row)}
                          aria-label={`Delete ${row.title}`}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[#636366] hover:text-red-400 hover:bg-white/[0.06] transition-colors cursor-pointer"
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

          {filtered.length > visibleLimit && (
            <button
              type="button"
              onClick={() => setVisibleLimit((prev) => prev + 45)}
              className="w-full h-11 rounded-full bg-[#111113] border border-white/[0.06] hover:border-white/15 text-[13px] font-medium text-white transition-colors cursor-pointer"
            >
              Show older ({filtered.length - visibleLimit} remaining)
            </button>
          )}
        </div>
      )}

      {/* Backfill Type Selector Sheet */}
      <BottomSheet
        open={backfillPickerOpen}
        onClose={() => setBackfillPickerOpen(false)}
        title="Backfill Workout"
        subtitle={`Up to ${state.appSettings.backfillWindowDays} days back · Labeled "Added later"`}
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setBackfillPickerOpen(false);
              onOpenBackfillStrength();
            }}
            className="p-4 rounded-2xl bg-[#1c1c1e] hover:bg-white/[0.08] text-left cursor-pointer"
          >
            <div className="text-[15px] font-semibold text-white">Strength</div>
            <div className="text-[12px] text-[#86868b] mt-0.5">Sets &amp; reps</div>
          </button>
          <button
            type="button"
            onClick={() => {
              setBackfillPickerOpen(false);
              onOpenBackfillCardio();
            }}
            className="p-4 rounded-2xl bg-[#1c1c1e] hover:bg-white/[0.08] text-left cursor-pointer"
          >
            <div className="text-[15px] font-semibold text-white">Cardio</div>
            <div className="text-[12px] text-[#86868b] mt-0.5">Preset, text or photo</div>
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
