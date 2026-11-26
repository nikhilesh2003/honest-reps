"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Lock, MapPin, Trophy, Unlock, UserMinus } from "lucide-react";
import { DaySummary, GridThresholds } from "@/lib/types";
import { UserMilestoneSummary } from "@/lib/milestones";
import { buildDayScoreReason, ScoreReasonData } from "@/lib/score-reason";
import { BottomSheet } from "./ui/BottomSheet";
import { ScoreReasonSheet } from "./ui/ScoreReasonSheet";
import {
  BadgeVisualThumbnail,
  getMatteMedalContainerStyle,
  MilestoneBadgesCard,
} from "./ui/MilestoneBadgesCard";
import { YearHeatmap } from "./YearHeatmap";

export interface FriendDetailPayload {
  friend: {
    userId: string;
    name: string;
    username: string;
    shareWorkoutDetails: boolean;
    inGym?: boolean;
    gymStartedAt?: string | null;
    gymName?: string | null;
  };
  monthStats: {
    monthEffort: number | null;
    isMonthCalibrating: boolean;
    activeDaysThisMonth: number;
    restDaysThisMonth: number;
    activeDaysYear: number;
    currentStreak: number;
    longestStreak: number;
  };
  monthDaily: DaySummary[];
  summaries365: DaySummary[];
  milestones?: UserMilestoneSummary;
}

interface FriendDetailSheetProps {
  open: boolean;
  loading: boolean;
  detail: FriendDetailPayload | null;
  thresholds: GridThresholds;
  currentUserId?: string;
  onRemoveFriend?: (friendUserId: string, friendUsername: string) => Promise<void> | void;
  onClose: () => void;
}

export function FriendDetailSheet({
  open,
  loading,
  detail,
  thresholds,
  currentUserId,
  onRemoveFriend,
  onClose,
}: FriendDetailSheetProps) {
  const [scoreReason, setScoreReason] = useState<ScoreReasonData | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showAllMedals, setShowAllMedals] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmRemove(false);
      setRemoving(false);
      setShowAllMedals(false);
    }
  }, [open]);

  return (
    <>
      <BottomSheet
        open={open}
        onClose={() => {
          setShowAllMedals(false);
          onClose();
        }}
        title={detail ? detail.friend.name : "Friend"}
        subtitle={
          detail
            ? showAllMedals
              ? `@${detail.friend.username} · All Medals`
              : `@${detail.friend.username}`
            : undefined
        }
      >
        {loading || !detail ? (
          <div className="py-10 text-center text-[13px] text-[#86868b]">Loading...</div>
        ) : showAllMedals && detail.milestones ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowAllMedals(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[12px] font-medium text-white cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Profile
            </button>

            <MilestoneBadgesCard summary={detail.milestones} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Live Gym Status Pill */}
            <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-[12px] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#86868b]">Current Status</span>
                {detail.friend.inGym ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#10e760]/15 text-[#10e760] font-semibold border border-[#10e760]/40 shadow-[0_0_12px_rgba(16,231,96,0.3)]">
                    <span className="w-2 h-2 rounded-full bg-[#10e760] animate-pulse" />
                    In the Gym
                  </span>
                ) : (
                  <span className="text-[#86868b] font-medium">Not in gym</span>
                )}
              </div>
              {detail.friend.gymName && (
                <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06]">
                  <span className="text-[#86868b]">Gym</span>
                  <span className="inline-flex items-center gap-1.5 text-white font-medium">
                    <MapPin className="w-3.5 h-3.5 text-[#10e760]" />
                    {detail.friend.gymName}
                  </span>
                </div>
              )}
            </div>

            {/* Sharing status notice (FR-61, FR-69) */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-[12px] text-[#86868b]">
              {detail.friend.shareWorkoutDetails ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-[#10e760] shrink-0" />
                  <span>Workout details shared · Tap any day on grid</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-[#86868b] shrink-0" />
                  <span>Summary only · Weights and exercises private</span>
                </>
              )}
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() =>
                  setScoreReason({
                    title: `${detail.friend.name} · This Month`,
                    subtitle: `@${detail.friend.username}`,
                    scoreLabel:
                      detail.monthStats.monthEffort !== null
                        ? `${detail.monthStats.monthEffort} / 100`
                        : detail.monthStats.isMonthCalibrating
                        ? "Calibrating"
                        : "—",
                    badgeText: detail.monthStats.isMonthCalibrating
                      ? "Est. Monthly Average"
                      : "Calibrated Monthly Average",
                    isEstimated: detail.monthStats.isMonthCalibrating,
                    items: [
                      {
                        label: "Active days averaged",
                        points: `${detail.monthStats.activeDaysThisMonth}d`,
                        detail: "Only active training days count toward monthly effort.",
                      },
                      {
                        label: "Rest days",
                        points: `${detail.monthStats.restDaysThisMonth}d`,
                        detail: "Rest days never lower the average.",
                      },
                    ],
                    formulaNote: detail.friend.shareWorkoutDetails
                      ? "Tap any day on the heatmap or list below to inspect daily breakdown."
                      : "Exercise weights & reps are private for this member.",
                  })
                }
                className="p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-center cursor-pointer transition-colors"
              >
                <div
                  className={`text-[20px] font-bold tabular-nums ${
                    detail.monthStats.isMonthCalibrating &&
                    detail.monthStats.monthEffort !== null
                      ? "text-amber-400"
                      : "text-[#10e760]"
                  }`}
                >
                  {detail.monthStats.monthEffort ??
                    (detail.monthStats.isMonthCalibrating ? "Cal" : "—")}
                </div>
                <div className="text-[10px] uppercase tracking-[0.06em] text-[#86868b] mt-0.5">
                  {detail.monthStats.isMonthCalibrating ? "Month (Est.)" : "Month"}
                </div>
              </button>
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center">
                <div className="text-[20px] font-bold text-white tabular-nums">
                  {detail.monthStats.activeDaysThisMonth}
                </div>
                <div className="text-[10px] uppercase tracking-[0.06em] text-[#86868b] mt-0.5">
                  Active
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center">
                <div className="text-[20px] font-bold text-white tabular-nums">
                  {detail.monthStats.currentStreak}d
                </div>
                <div className="text-[10px] uppercase tracking-[0.06em] text-[#86868b] mt-0.5">
                  Streak
                </div>
              </div>
            </div>

            {/* Friend's Medals: Received This Month + All Medals Button */}
            {detail.milestones && (
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b] flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-[#10e760]" />
                      <span>Received This Month</span>
                    </div>
                    <div className="text-[11px] text-[#6e6e73] mt-0.5 tabular-nums">
                      {detail.milestones.earnedThisMonth.length > 0
                        ? `${detail.milestones.earnedThisMonth.length} earned in ${detail.milestones.currentMonthPrefix}`
                        : `No medals earned in ${detail.milestones.currentMonthPrefix} yet`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAllMedals(true)}
                    className="px-3 py-1.5 rounded-full bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-[11px] font-semibold text-white inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  >
                    <span>All Medals ({detail.milestones.totalUnlocked})</span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#86868b]" />
                  </button>
                </div>

                {detail.milestones.earnedThisMonth.length > 0 && (
                  <div className="flex gap-2.5 overflow-x-auto no-scrollbar pt-0.5 pb-1">
                    {detail.milestones.earnedThisMonth.map((badge) => {
                      const style = getMatteMedalContainerStyle(badge.tier, true);
                      const isPlate = badge.iconType === "plate";
                      const isFullFaceSvg =
                        isPlate ||
                        badge.iconType === "calendar" ||
                        badge.iconType === "yearly";
                      return (
                        <button
                          key={badge.id}
                          type="button"
                          onClick={() => setShowAllMedals(true)}
                          className="flex flex-col items-center shrink-0 w-[64px] text-center cursor-pointer group"
                        >
                          {isPlate ? (
                            <div className="w-10 h-10 flex items-center justify-center group-hover:scale-105 transition-transform">
                              <BadgeVisualThumbnail badge={badge} size="sm" />
                            </div>
                          ) : (
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                isFullFaceSvg ? "" : "border"
                              } group-hover:scale-105 transition-transform ${style.outer}`}
                            >
                              <BadgeVisualThumbnail badge={badge} size="sm" />
                            </div>
                          )}
                          <span className="text-[10px] text-white/90 font-medium mt-1 line-clamp-1 max-w-full leading-tight">
                            {badge.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Friend's Year Activity Grid (FR-61) */}
            <YearHeatmap
              summaries365={detail.summaries365}
              thresholds={thresholds}
              hidePrivateDetails={true}
              shareDetailsEnabled={detail.friend.shareWorkoutDetails}
              ownerName={detail.friend.name}
              title="Activity Grid"
            />

            {/* Month Daily Efforts & Muscle Groups (FR-37) */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                This Month
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
                {[...detail.monthDaily]
                  .filter((d) => d.itemCount > 0 || d.isRest)
                  .reverse()
                  .slice(0, 14)
                  .map((day) => (
                    <div
                      key={day.date}
                      className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-[13px]"
                    >
                      <div>
                        <span className="text-white font-medium">{day.shortLabel}</span>
                        <span className="text-[#86868b] ml-2 text-[12px]">
                          {day.isRest ? "Rest" : day.sessionGroups.join(" · ")}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setScoreReason(
                            buildDayScoreReason(day, {
                              hidePrivateDetails: true,
                              shareDetailsEnabled: detail.friend.shareWorkoutDetails,
                              ownerName: detail.friend.name,
                            })
                          )
                        }
                        className="px-2 py-1 rounded-lg hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                      >
                        {day.status === "Scored" && day.effortScore !== null ? (
                          <span className="font-semibold text-[#10e760] tabular-nums">
                            {day.effortScore}
                          </span>
                        ) : day.status === "Calibrating" && day.effortScore !== null ? (
                          <span className="inline-flex items-center gap-1.5 tabular-nums">
                            <span className="text-[10px] text-amber-400/80">Est.</span>
                            <span className="font-semibold text-amber-400">
                              {day.effortScore}
                            </span>
                          </span>
                        ) : day.status === "Calibrating" ? (
                          <span className="text-[11px] text-amber-400">Calibrating</span>
                        ) : (
                          <span className="text-[11px] text-[#86868b]">Rest</span>
                        )}
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            {/* Remove Friend Option */}
            {onRemoveFriend &&
              currentUserId &&
              detail.friend.userId !== currentUserId && (
                <div className="pt-2 border-t border-white/[0.06]">
                  {!confirmRemove ? (
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(true)}
                      className="w-full h-11 rounded-xl bg-white/[0.04] hover:bg-red-500/15 border border-white/[0.08] hover:border-red-500/30 text-[13px] font-medium text-[#86868b] hover:text-red-300 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <UserMinus className="w-4 h-4" />
                      Remove Friend
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={removing}
                        onClick={() => setConfirmRemove(false)}
                        className="flex-1 h-10 rounded-xl bg-white/[0.06] text-white text-[13px] font-medium cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={removing}
                        onClick={async () => {
                          setRemoving(true);
                          try {
                            await onRemoveFriend(detail.friend.userId, detail.friend.username);
                            onClose();
                          } finally {
                            setRemoving(false);
                          }
                        }}
                        className="flex-1 h-10 rounded-xl bg-red-500/25 hover:bg-red-500/35 border border-red-500/40 text-red-200 text-[13px] font-semibold cursor-pointer"
                      >
                        {removing ? "Removing..." : "Confirm Remove"}
                      </button>
                    </div>
                  )}
                </div>
              )}
          </div>
        )}
      </BottomSheet>

      <ScoreReasonSheet reason={scoreReason} onClose={() => setScoreReason(null)} />
    </>
  );
}
