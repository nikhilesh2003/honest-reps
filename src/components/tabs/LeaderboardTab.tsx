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
  if (isEst) return "bg-[#1c1c1e] text-[#86868b]";
  if (rankIndex === 0) return "bg-[#30d158]/15 text-[#30d158]";
  if (rankIndex === 1) return "bg-white/[0.1] text-white";
  if (rankIndex === 2) return "bg-amber-400/15 text-amber-300";
  return "bg-transparent text-[#86868b]";
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
      <div className="flex items-center justify-between">
        <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-white">
          Leaderboard
        </h1>
        <button
          type="button"
          onClick={onNavigateFriends}
          className="px-3.5 py-2 rounded-full bg-[#111113] border border-white/[0.06] hover:border-white/15 text-[12px] font-medium text-white flex items-center gap-1.5 cursor-pointer"
        >
          <Users className="w-3.5 h-3.5 text-[#30d158]" />
          Friends
        </button>
      </div>

      {/* Native iOS Segmented Control: Today | This Month */}
      <div className="apple-segmented">
        <button
          type="button"
          data-active={period === "today"}
          onClick={() => setPeriod("today")}
          className="apple-segmented-btn h-8.5"
        >
          Today
        </button>
        <button
          type="button"
          data-active={period === "month"}
          onClick={() => setPeriod("month")}
          className="apple-segmented-btn h-8.5"
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
              className={`px-4 py-3.5 flex items-center justify-between gap-3 transition-colors ${
                entry.isMe ? "bg-white/[0.02]" : "hover:bg-white/[0.02]"
              }`}
            >
              <button
                type="button"
                onClick={() => handleSelectMember(entry)}
                className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
              >
                <span
                  className={`w-7 h-7 rounded-full text-[12px] font-semibold flex items-center justify-center tabular-nums shrink-0 ${badgeCls}`}
                >
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[15px] font-semibold text-white truncate">
                      {entry.isMe ? "You" : entry.name}
                    </span>
                    <span className="text-[12px] text-[#86868b] truncate">
                      @{entry.username}
                    </span>
                    {entry.inGym && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#30d158]/15 text-[#30d158] shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#30d158]" />
                        Live
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[#86868b] tabular-nums mt-0.5">
                    {entry.activeDaysThisMonth}d active · {entry.currentStreak}d streak
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setScoreReason(buildLeaderboardScoreReason(entry, period))}
                  title="Tap score to see why"
                  className="flex items-center gap-1.5 px-2 py-1 rounded-xl hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                >
                  {isEst && (
                    <span className="text-[11px] font-medium text-amber-400">Est.</span>
                  )}
                  <span
                    className={`text-[21px] font-semibold tabular-nums ${
                      isEst ? "text-amber-400" : "text-[#30d158]"
                    }`}
                  >
                    {score}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMember(entry)}
                  aria-label={`View ${entry.name}`}
                  className="p-1 text-[#636366] hover:text-white cursor-pointer"
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
            : "—";

          return (
            <div
              key={entry.userId}
              className="px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
            >
              <button
                type="button"
                onClick={() => handleSelectMember(entry)}
                className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
              >
                <span className="w-7 text-center text-[13px] font-medium text-[#636366] shrink-0">
                  —
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[15px] font-medium text-[#d1d1d6] truncate">
                      {entry.isMe ? "You" : entry.name}
                    </span>
                    <span className="text-[12px] text-[#86868b] truncate">
                      @{entry.username}
                    </span>
                    {entry.inGym && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#30d158]/15 text-[#30d158] shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#30d158]" />
                        Live
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[#86868b] tabular-nums mt-0.5">
                    {entry.activeDaysThisMonth}d active · {entry.currentStreak}d streak
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setScoreReason(buildLeaderboardScoreReason(entry, period))}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-xl hover:bg-white/[0.06] active:scale-95 transition-all cursor-pointer"
                >
                  <span
                    className={`text-[12px] font-medium ${
                      isCalibrating ? "text-amber-400" : "text-[#86868b]"
                    }`}
                  >
                    {label}
                  </span>
                  {score !== null && isCalibrating && (
                    <span className="text-[19px] font-semibold text-amber-400 tabular-nums">
                      {score}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectMember(entry)}
                  aria-label={`View ${entry.name}`}
                  className="p-1 text-[#636366] hover:text-white cursor-pointer"
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
