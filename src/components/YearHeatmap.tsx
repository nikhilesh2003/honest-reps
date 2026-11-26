"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DaySummary, EffortBand, EffortStatus, GridThresholds } from "@/lib/types";
import { formatFullDate } from "@/lib/effort";
import {
  buildDayScoreReason,
  buildLoggedItemScoreReason,
  ScoreReasonData,
} from "@/lib/score-reason";
import { BottomSheet } from "./ui/BottomSheet";
import { ScoreReasonSheet } from "./ui/ScoreReasonSheet";

interface YearHeatmapProps {
  summaries365: DaySummary[];
  thresholds: GridThresholds;
  hidePrivateDetails?: boolean;
  shareDetailsEnabled?: boolean;
  ownerName?: string;
  title?: string;
}

interface MonthCalendarBlock {
  key: string;
  label: string;
  weeks: Array<Array<DaySummary | null>>;
}

export function bandToTileClass(band: EffortBand, status?: EffortStatus): string {
  if (status === "Calibrating") {
    switch (band) {
      case "Very low":
        return "tile-est-very-low";
      case "Low":
        return "tile-est-low";
      case "Steady":
        return "tile-est-steady";
      case "High":
        return "tile-est-high";
      case "Very high":
        return "tile-est-very-high";
      default:
        return "tile-est-steady";
    }
  }
  switch (band) {
    case "Very low":
      return "tile-very-low";
    case "Low":
      return "tile-low";
    case "Steady":
      return "tile-steady";
    case "High":
      return "tile-high";
    case "Very high":
      return "tile-very-high";
    case "Calibrating":
      return "tile-est-steady";
    case "Rest":
      return "tile-rest";
    default:
      return "tile-nolog";
  }
}

export function YearHeatmap({
  summaries365,
  thresholds,
  hidePrivateDetails = false,
  shareDetailsEnabled = true,
  ownerName,
  title,
}: YearHeatmapProps) {
  const [selectedDay, setSelectedDay] = useState<DaySummary | null>(null);
  const [scoreReason, setScoreReason] = useState<ScoreReasonData | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { monthBlocks, activeYearCount } = useMemo(() => {
    if (!summaries365 || summaries365.length === 0) {
      return { monthBlocks: [] as MonthCalendarBlock[], activeYearCount: 0 };
    }

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const byMonth = new Map<string, DaySummary[]>();
    for (const day of summaries365) {
      const key = day.date.slice(0, 7);
      const list = byMonth.get(key) ?? [];
      list.push(day);
      byMonth.set(key, list);
    }

    const blocks: MonthCalendarBlock[] = [];
    for (const [key, days] of byMonth.entries()) {
      const [yStr, mStr] = key.split("-");
      const mIdx = Number(mStr) - 1;
      const firstDay = days[0];
      const dNum = Number(firstDay.date.split("-")[2]);
      const monOffset = (new Date(Number(yStr), mIdx, dNum).getDay() + 6) % 7;

      const padded: Array<DaySummary | null> = [
        ...Array.from({ length: monOffset }, () => null),
        ...days,
      ];
      while (padded.length % 7 !== 0) {
        padded.push(null);
      }

      const weeks: Array<Array<DaySummary | null>> = [];
      for (let i = 0; i < padded.length; i += 7) {
        weeks.push(padded.slice(i, i + 7));
      }

      blocks.push({
        key,
        label: monthNames[mIdx],
        weeks,
      });
    }

    const activeCount = summaries365.filter(
      (day) => day.itemCount > 0 && !day.isRest
    ).length;

    return { monthBlocks: blocks, activeYearCount: activeCount };
  }, [summaries365]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  }, [monthBlocks.length]);

  const openLegendPopup = (
    label: string,
    range: string,
    detail: string,
    isEstimated = false
  ) => {
    setScoreReason({
      title: "Activity Scale",
      subtitle: label,
      scoreLabel: range,
      badgeText: isEstimated ? "Estimated (Calibrating)" : "Effort Scale",
      isEstimated,
      items: [{ label, points: range, detail }],
      formulaNote:
        "Tap any day square on the grid, then tap the score number to see how that day's score was calculated.",
    });
  };

  return (
    <div className="apple-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="apple-section-label">
          {title ? title : `${activeYearCount} active days in the last year`}
        </span>
        <span className="text-[11px] text-[#86868b]">12 months</span>
      </div>

      <div className="flex items-start gap-2.5">
        <div className="shrink-0 pt-[22px]">
          <div className="grid grid-rows-7 gap-[4px] text-[10px] text-[#86868b] font-medium select-none">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayLabel) => (
              <span
                key={dayLabel}
                className="h-[14px] flex items-center leading-none"
              >
                {dayLabel}
              </span>
            ))}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto no-scrollbar pb-1"
        >
          <div className="inline-flex items-start gap-2 min-w-max">
            {monthBlocks.map((block) => (
              <div key={block.key} className="space-y-2">
                <div className="text-[11px] font-medium text-[#86868b] leading-none h-[14px] flex items-center">
                  {block.label}
                </div>
                <div className="flex gap-[4px]">
                  {block.weeks.map((week, wIdx) => (
                    <div key={wIdx} className="grid grid-rows-7 gap-[4px]">
                      {week.map((day, dIdx) =>
                        day ? (
                          <button
                            key={day.date}
                            type="button"
                            onClick={() => setSelectedDay(day)}
                            title={`${day.date} · ${day.band}${
                              day.effortScore !== null
                                ? ` (${day.effortScore}${
                                    day.status === "Calibrating" ? " Est." : ""
                                  })`
                                : ""
                            }`}
                            aria-label={`${day.date}, ${day.band}`}
                            className={`w-[14px] h-[14px] rounded-[3.5px] transition-transform active:scale-110 hover:scale-110 cursor-pointer ${bandToTileClass(
                              day.band,
                              day.status
                            )}`}
                          />
                        ) : (
                          <div
                            key={`pad-${block.key}-${wIdx}-${dIdx}`}
                            className="w-[14px] h-[14px]"
                          />
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quiet Footer Legend */}
      <div className="mt-3 pt-2.5 border-t border-white/[0.05] flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#86868b]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              openLegendPopup(
                "No log",
                "—",
                "No workout or rest status logged on this day."
              )
            }
            className="flex items-center gap-1 hover:text-white cursor-pointer"
          >
            <span className="w-[11px] h-[11px] rounded-[3px] tile-nolog inline-block" />
            Empty
          </button>
          <button
            type="button"
            onClick={() =>
              openLegendPopup(
                "Rest Day",
                "Rest",
                "Declared rest day — protects your streak without lowering averages."
              )
            }
            className="flex items-center gap-1 hover:text-white cursor-pointer"
          >
            <span className="w-[11px] h-[11px] rounded-[3px] tile-rest inline-block" />
            Rest
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-1">
            {[
              {
                cls: "tile-very-low",
                label: "Effort · Under 50",
                range: `0–${thresholds.veryLowMax} pts`,
                detail: "Lighter session than your personal usual.",
              },
              {
                cls: "tile-low",
                label: "Effort · 60",
                range: `${thresholds.veryLowMax + 1}–${thresholds.lowMax} pts`,
                detail: "Steady effort around or slightly above usual.",
              },
              {
                cls: "tile-steady",
                label: "Effort · 70",
                range: `${thresholds.lowMax + 1}–${thresholds.steadyMax} pts`,
                detail: "Solid session above your baseline.",
              },
              {
                cls: "tile-high",
                label: "Effort · 80",
                range: `${thresholds.steadyMax + 1}–${thresholds.highMax} pts`,
                detail: "High effort session well above your usual.",
              },
              {
                cls: "tile-very-high",
                label: "Effort · 90+",
                range: `${thresholds.highMax + 1}–100 pts`,
                detail: "Peak effort session relative to your own history.",
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() =>
                  openLegendPopup(item.label, item.range, item.detail, false)
                }
                aria-label={`${item.label} (${item.range})`}
                className={`w-[11px] h-[11px] rounded-[3px] transition-transform hover:scale-110 cursor-pointer ${item.cls}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 pl-1 border-l border-white/[0.08]">
            <span className="text-[9px] text-amber-400/90">Est</span>
            {[
              {
                cls: "tile-est-low",
                label: "Est. Effort",
                range: "Calibrating",
                detail: "Provisional estimate while building your personal baseline.",
              },
              {
                cls: "tile-est-high",
                label: "Est. Effort",
                range: "Calibrating",
                detail: "Provisional estimate while building your personal baseline.",
              },
            ].map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() =>
                  openLegendPopup(item.label, item.range, item.detail, true)
                }
                aria-label="Estimated effort scale"
                className={`w-[11px] h-[11px] rounded-[3px] transition-transform hover:scale-110 cursor-pointer ${item.cls}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Day Detail Modal */}
      <BottomSheet
        open={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? formatFullDate(selectedDay.date) : ""}
        subtitle={
          selectedDay
            ? selectedDay.isRest
              ? "Rest day"
              : selectedDay.status === "No log"
              ? "No activity logged"
              : selectedDay.sessionGroups.join(" · ") || "Workout"
            : undefined
        }
      >
        {selectedDay && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#1c1c1e]">
              <div>
                <div className="text-[12px] text-[#86868b] font-medium">Status</div>
                <div className="text-[16px] font-semibold text-white mt-0.5">
                  {selectedDay.status === "No log"
                    ? "No activity"
                    : selectedDay.band}
                </div>
              </div>
              <div className="text-right">
                {selectedDay.effortScore !== null ? (
                  <button
                    type="button"
                    onClick={() =>
                      setScoreReason(
                        buildDayScoreReason(selectedDay, {
                          hidePrivateDetails,
                          shareDetailsEnabled,
                          ownerName,
                        })
                      )
                    }
                    title="Tap score to see why"
                    className="text-right rounded-xl px-2.5 py-1.5 -m-1.5 hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                  >
                    <div
                      className={`text-[28px] font-semibold tabular-nums leading-none ${
                        selectedDay.status === "Calibrating"
                          ? "text-amber-400"
                          : "text-[#30d158]"
                      }`}
                    >
                      {selectedDay.effortScore}
                      <span className="text-[13px] font-medium text-[#86868b]">/100</span>
                    </div>
                    {selectedDay.status === "Calibrating" && (
                      <div className="text-[10px] font-medium text-amber-400 mt-1">
                        Estimated
                      </div>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setScoreReason(
                        buildDayScoreReason(selectedDay, {
                          hidePrivateDetails,
                          shareDetailsEnabled,
                          ownerName,
                        })
                      )
                    }
                    className="px-2.5 py-1 rounded-full text-[12px] font-medium bg-white/[0.06] text-[#86868b] cursor-pointer"
                  >
                    {selectedDay.status}
                  </button>
                )}
              </div>
            </div>

            {hidePrivateDetails && !shareDetailsEnabled ? (
              <div className="p-4 rounded-2xl bg-[#1c1c1e] text-[13px] text-[#86868b]">
                Workout details are private. Only effort level and muscle groups are shared.
              </div>
            ) : selectedDay.loggedItems.length > 0 ? (
              <div className="rounded-2xl bg-[#1c1c1e] divide-y divide-white/[0.06] overflow-hidden">
                {selectedDay.loggedItems.map((item) => (
                  <div
                    key={item.id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-medium text-white">
                          {item.title}
                        </span>
                        {item.addedLater && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-[#a1a1a6]">
                            Added later
                          </span>
                        )}
                        {item.kcalIsEstimated && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-[#a1a1a6]">
                            Est.
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-[#86868b] mt-0.5 tabular-nums">
                        {item.detail}
                      </div>
                      {item.splits && item.splits.length > 1 && (
                        <div className="mt-1.5 pl-2.5 border-l border-white/[0.08] space-y-0.5">
                          {item.splits.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center gap-1.5 text-[11px] text-[#86868b] tabular-nums"
                            >
                              <span className="font-medium text-[#d1d1d6]">
                                Split {s.splitNumber}:
                              </span>
                              <span>{s.minutes}m</span>
                              {s.distanceKm && <span>· {s.distanceKm}km</span>}
                              <span>· {s.kcal} kcal</span>
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
                            hidePrivateDetails,
                            shareDetailsEnabled,
                            ownerName,
                          })
                        )
                      }
                      className="shrink-0 text-right px-2 py-1 rounded-lg hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                    >
                      {item.status === "Calibrating" ? (
                        <span className="text-[11px] font-medium text-amber-400">
                          Calibrating
                        </span>
                      ) : item.status === "Rest" ? (
                        <span className="text-[12px] font-medium text-[#86868b]">
                          Rest
                        </span>
                      ) : (
                        <span className="text-[15px] font-semibold text-[#30d158] tabular-nums">
                          {item.effortScore}
                        </span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-[#86868b] text-center py-4">
                {selectedDay.isRest
                  ? "Rest day — no activity logged."
                  : "No activity logged."}
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <ScoreReasonSheet reason={scoreReason} onClose={() => setScoreReason(null)} />
    </div>
  );
}
