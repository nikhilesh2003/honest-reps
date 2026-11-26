"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Users } from "lucide-react";
import { AppStatePayload, LeaderboardEntry } from "@/lib/client-types";
import { apiGetFriendDetail, apiRemoveFriend, apiSyncFriendsNow } from "@/lib/client-engine";
import { buildLeaderboardScoreReason, ScoreReasonData } from "@/lib/score-reason";
import { FriendDetailPayload, FriendDetailSheet } from "../FriendDetailSheet";
import { ScoreReasonSheet } from "../ui/ScoreReasonSheet";

interface LeaderboardTabProps {
  state: AppStatePayload;
  onRefresh: () => void;
  onNavigateFriends: () => void;
  onNavigateProfile?: () => void;
}

function getRankBadgeStyle(rankIndex: number, isEst: boolean): string {
  if (isEst) return "bg-white/[0.04] text-[#86868b] border-white/[0.08]";
  if (rankIndex === 0) {
    return "bg-[#10e760]/18 text-[#10e760] border-[#10e760]/50";
  }
  if (rankIndex === 1) {
    return "bg-white/[0.1] text-white border-white/25";
  }
  if (rankIndex === 2) {
    return "bg-amber-500/15 text-amber-300 border-amber-500/35";
  }
  return "bg-transparent text-[#86868b] border-transparent";
}

export function LeaderboardTab({
  state,
  onRefresh,
  onNavigateFriends,
  onNavigateProfile,
}: LeaderboardTabProps) {
  const [period, setPeriod] = useState<"today" | "month">("month");
  const [scoreReason, setScoreReason] = useState<ScoreReasonData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [friendDetail, setFriendDetail] = useState<FriendDetailPayload | null>(null);

  useEffect(() => {
    void apiSyncFriendsNow().then(() => onRefresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { ranked, unranked } = useMemo(() => {
    const withScore: LeaderboardEntry[] = [];
    const unscored: LeaderboardEntry[] = [];

    for (const entry of state.leaderboard) {
      const score = period === "today" ? entry.todayScore : entry.monthEffort;
      if (score !== null && score !== undefined) {
        withScore.push(entry);
      } else {
        unscored.push(entry);
      }
    }

    withScore.sort((a, b) => {
      const aEst = period === "today" ? a.todayStatus === "Calibrating" : a.isMonthCalibrating;
      const bEst = period === "today" ? b.todayStatus === "Calibrating" : b.isMonthCalibrating;
      if (aEst !== bEst) return aEst ? 1 : -1;
      const sa = period === "today" ? a.todayScore ?? 0 : a.monthEffort ?? 0;
      const sb = period === "today" ? b.todayScore ?? 0 : b.monthEffort ?? 0;
      return sb - sa;
    });

    return { ranked: withScore, unranked: unscored };
  }, [state.leaderboard, period]);

  const handleSelectMember = async (entry: LeaderboardEntry) => {
    if (entry.isMe && onNavigateProfile) {
      onNavigateProfile();
      return;
    }
    setDetailOpen(true);
    setDetailLoading(true);
    setFriendDetail(null);
    try {
      const data = await apiGetFriendDetail(entry.userId);
      if (data) setFriendDetail(data as FriendDetailPayload);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white">
          Leaderboard
        </h1>
        <button
          type="button"
          onClick={onNavigateFriends}
          className="px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[12px] font-medium text-white flex items-center gap-1.5 cursor-pointer"
        >
          <Users className="w-3.5 h-3.5 text-[#10e760]" />
          Friends
        </button>
      </div>

      {/* Segmented Control: Today | This Month */}
      <div className="grid grid-cols-2 p-1 rounded-2xl bg-[#0a0a0c] border border-white/[0.08]">
        <button
          type="button"
          onClick={() => setPeriod("today")}
          className={`h-9 rounded-xl text-[13px] font-medium transition-colors cursor-pointer ${
            period === "today" ? "bg-white text-black" : "text-[#86868b] hover:text-white"
          }`}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => setPeriod("month")}
          className={`h-9 rounded-xl text-[13px] font-medium transition-colors cursor-pointer ${
            period === "month" ? "bg-white text-black" : "text-[#86868b] hover:text-white"
          }`}
        >
          This Month
        </button>
      </div>

      {/* Ranked Leaderboard */}
      <div className="apple-card divide-y divide-white/[0.06] overflow-hidden">
        {ranked.map((entry, idx) => {
          const score = period === "today" ? entry.todayScore : entry.monthEffort;
          const isEst =
            period === "today"
              ? entry.todayStatus === "Calibrating"
              : entry.isMonthCalibrating;
          const badgeCls = getRankBadgeStyle(idx, isEst);

          return (
            <div
              key={entry.userId}
              className={`p-4 flex items-center justify-between gap-3 transition-colors ${
                entry.isMe ? "bg-[#10e760]/[0.03]" : "hover:bg-white/[0.02]"
              }`}
            >
              <button
                type="button"
                onClick={() => handleSelectMember(entry)}
                className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
              >
                <span
                  className={`w-7 h-7 rounded-full border text-[12px] font-bold flex items-center justify-center tabular-nums shrink-0 ${badgeCls}`}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-white truncate">
                      {entry.isMe ? "You" : entry.name}
                    </span>
                    <span className="text-[11px] text-[#525257] truncate">
                      @{entry.username}
                    </span>
                    {entry.inGym && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-[#10e760]/15 text-[#10e760] border border-[#10e760]/30 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10e760] animate-pulse" />
                        Gym
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[#86868b] tabular-nums mt-0.5">
                    {entry.activeDaysThisMonth} active days · {entry.currentStreak}d streak
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setScoreReason(buildLeaderboardScoreReason(entry, period))}
                  title="Tap score to see why"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl hover:bg-white/[0.07] active:scale-95 transition-all cursor-pointer"
                >
                  {isEst && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      Est.
                    </span>
                  )}
                  <span
                    className={`text-[22px] font-bold tabular-nums ${
                      isEst ? "text-amber-400" : "text-[#10e760]"
                    }`}
                  >
                    {score}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMember(entry)}
                  aria-label={`View ${entry.name}`}
                  className="p-1 text-[#525257] hover:text-white cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Unranked / Calibrating Friends */}
        {unranked.map((entry) => {
          const score = period === "today" ? entry.todayScore : entry.monthEffort;
          const isCalibrating =
            period === "today"
              ? entry.todayStatus === "Calibrating"
              : entry.isMonthCalibrating;
          const label = isCalibrating
            ? score !== null
              ? "Est."
              : "Calibrating"
            : period === "today" && entry.todayStatus === "Rest"
            ? "Rest"
            : "No log";

          return (
            <div
              key={entry.userId}
              className="p-4 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
            >
              <button
                type="button"
                onClick={() => handleSelectMember(entry)}
                className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
              >
                <span className="w-7 text-center text-[13px] font-medium text-[#525257] shrink-0">
                  —
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-medium text-[#d1d1d6] truncate">
                      {entry.isMe ? "You" : entry.name}
                    </span>
                    <span className="text-[11px] text-[#525257] truncate">
                      @{entry.username}
                    </span>
                    {entry.inGym && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-[#10e760]/15 text-[#10e760] border border-[#10e760]/30 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10e760] animate-pulse" />
                        Gym
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[#86868b] tabular-nums mt-0.5">
                    {entry.activeDaysThisMonth} active days · {entry.currentStreak}d streak
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setScoreReason(buildLeaderboardScoreReason(entry, period))}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-xl hover:bg-white/[0.07] active:scale-95 transition-all cursor-pointer"
                >
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      isCalibrating
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        : "bg-white/[0.05] text-[#86868b] border border-white/[0.08]"
                    }`}
                  >
                    {label}
                  </span>
                  {score !== null && isCalibrating && (
                    <span className="text-[20px] font-bold text-amber-400 tabular-nums">
                      {score}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMember(entry)}
                  aria-label={`View ${entry.name}`}
                  className="p-1 text-[#525257] hover:text-white cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <FriendDetailSheet
        open={detailOpen}
        loading={detailLoading}
        detail={friendDetail}
        thresholds={state.appSettings.gridThresholds}
        currentUserId={state.profile.userId}
        onRemoveFriend={async (friendUid) => {
          const res = await apiRemoveFriend(friendUid);
          if (res.ok) onRefresh();
        }}
        onClose={() => setDetailOpen(false)}
      />

      <ScoreReasonSheet reason={scoreReason} onClose={() => setScoreReason(null)} />
    </div>
  );
}
