"use client";

import { useEffect, useState } from "react";
import {
  UserPlus,
  Copy,
  Check,
  X,
  ChevronRight,
  Share2,
  MessageCircle,
  Dumbbell,
  Trophy,
} from "lucide-react";
import { AppStatePayload } from "@/lib/client-types";
import {
  buildInviteShareText,
  getInviteUrl,
  openWhatsAppShare,
} from "@/lib/share";
import {
  apiFriendAction,
  apiGetFriendDetail,
  apiRemoveFriend,
  apiSendFriendRequest,
  apiSyncFriendsNow,
} from "@/lib/client-engine";
import { buildLeaderboardScoreReason, ScoreReasonData } from "@/lib/score-reason";
import { BottomSheet } from "../ui/BottomSheet";
import { ScoreReasonSheet } from "../ui/ScoreReasonSheet";
import { FriendDetailPayload, FriendDetailSheet } from "../FriendDetailSheet";

interface FriendsTabProps {
  state: AppStatePayload;
  onRefresh: () => void;
  onToast: (text: string, tone?: "success" | "error") => void;
  onNavigateLeaderboard: () => void;
}

export function FriendsTab({
  state,
  onRefresh,
  onToast,
  onNavigateLeaderboard,
}: FriendsTabProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [sendingReq, setSendingReq] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [friendDetail, setFriendDetail] = useState<FriendDetailPayload | null>(null);
  const [scoreReason, setScoreReason] = useState<ScoreReasonData | null>(null);

  useEffect(() => {
    void apiSyncFriendsNow().then(() => onRefresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const friendsList = state.leaderboard.filter((m) => !m.isMe);
  const inGymCount = friendsList.filter((f) => f.inGym).length;

  const inviteLink = getInviteUrl(state.profile.username);
  const inviteShareText = buildInviteShareText(
    state.profile.name,
    state.profile.username
  );

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      onToast("Invite link copied");
    } catch {
      onToast("Copy failed", "error");
    }
  };

  const handleNativeInviteShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Join me on Honest Reps",
          text: inviteShareText,
          url: inviteLink,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    handleCopyInvite();
  };

  const handleSendRequest = async () => {
    if (!usernameInput.trim()) return;
    setSendingReq(true);
    try {
      const data = await apiSendFriendRequest(usernameInput.trim());
      if (!data.ok) {
        onToast(data.error || "Could not send request", "error");
        return;
      }
      onToast(`Request sent to @${data.targetUsername}`);
      setUsernameInput("");
      setAddOpen(false);
      onRefresh();
    } finally {
      setSendingReq(false);
    }
  };

  const handleRequestAction = async (
    friendshipId: string,
    action: "accept" | "decline"
  ) => {
    const res = await apiFriendAction(friendshipId, action);
    if (res.ok) {
      onToast(action === "accept" ? "Friend added" : "Request declined");
      onRefresh();
    }
  };

  const openFriendDetail = async (userId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setFriendDetail(null);
    try {
      const data = await apiGetFriendDetail(userId);
      if (data) setFriendDetail(data as FriendDetailPayload);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white leading-tight">
            Friends
          </h1>
          <div className="text-[12px] text-[#86868b] mt-0.5 tabular-nums">
            {friendsList.length} connected
            {inGymCount > 0 ? ` · ${inGymCount} in the gym now` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNavigateLeaderboard}
            className="px-3 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[12px] font-medium text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Trophy className="w-3.5 h-3.5 text-[#10e760]" />
            Board
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="px-3.5 py-2 rounded-full bg-[#10e760]/15 hover:bg-[#10e760]/25 border border-[#10e760]/40 text-[12px] font-semibold text-[#10e760] flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>

      {/* Pending Incoming Requests (FR-35) */}
      {state.incomingRequests.length > 0 && (
        <div className="apple-card p-4 space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            Requests ({state.incomingRequests.length})
          </div>
          {state.incomingRequests.map((req) => (
            <div
              key={req.friendshipId}
              className="flex items-center justify-between gap-3 py-1"
            >
              <div>
                <div className="text-[14px] font-medium text-white">{req.name}</div>
                <div className="text-[12px] text-[#86868b]">@{req.username}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleRequestAction(req.friendshipId, "accept")}
                  className="px-3 h-8 rounded-full bg-[#10e760] text-black text-[12px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => handleRequestAction(req.friendshipId, "decline")}
                  aria-label="Decline"
                  className="w-8 h-8 rounded-full bg-white/[0.07] text-[#86868b] hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Outgoing Requests */}
      {state.outgoingRequests.length > 0 && (
        <div className="apple-card p-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
            Sent Requests
          </div>
          {state.outgoingRequests.map((req) => (
            <div
              key={req.friendshipId}
              className="flex items-center justify-between text-[13px]"
            >
              <span className="text-[#d1d1d6]">
                {req.name} <span className="text-[#525257]">@{req.username}</span>
              </span>
              <span className="text-[11px] text-[#86868b]">Pending</span>
            </div>
          ))}
        </div>
      )}

      {/* Connected Friends List (Live Gym Status + Heatmap + Clickable Scores) */}
      {friendsList.length === 0 ? (
        <div className="apple-card p-6 text-center space-y-3">
          <div className="text-[15px] font-semibold text-white">No friends connected yet</div>
          <p className="text-[12px] text-[#86868b]">
            Add a friend by @username or share your invite link to see when they are in the gym and view their activity grid.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="px-4 h-10 rounded-xl bg-[#10e760] text-black font-semibold text-[13px] cursor-pointer"
          >
            Invite or Add Friend
          </button>
        </div>
      ) : (
        <div className="apple-card divide-y divide-white/[0.06] overflow-hidden">
          {friendsList.map((entry) => {
            const score = entry.todayScore ?? entry.monthEffort;
            const period = entry.todayScore !== null ? "today" : "month";
            const isEst =
              period === "today"
                ? entry.todayStatus === "Calibrating"
                : entry.isMonthCalibrating;

            return (
              <div
                key={entry.userId}
                className="p-4 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => openFriendDetail(entry.userId)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${
                      entry.inGym
                        ? "bg-[#10e760]/15 border-[#10e760]/60 text-[#10e760] shadow-[0_0_16px_rgba(16,231,96,0.35)]"
                        : "bg-white/[0.05] border-white/[0.08] text-[#86868b]"
                    }`}
                  >
                    <Dumbbell className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-semibold text-white truncate">
                        {entry.name}
                      </span>
                      <span className="text-[11px] text-[#525257] truncate">
                        @{entry.username}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                      {entry.inGym ? (
                        <span className="inline-flex items-center gap-1 text-[#10e760] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10e760] animate-pulse" />
                          In the Gym
                        </span>
                      ) : (
                        <span className="text-[#86868b]">Not in gym</span>
                      )}
                      <span className="text-[#525257]">·</span>
                      <span className="text-[#86868b] tabular-nums">
                        {entry.currentStreak}d streak
                      </span>
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {score !== null ? (
                    <button
                      type="button"
                      onClick={() => setScoreReason(buildLeaderboardScoreReason(entry, period))}
                      title="Tap score to see why"
                      className="px-2.5 py-1 rounded-xl hover:bg-white/[0.07] active:scale-95 transition-all text-right cursor-pointer"
                    >
                      <span
                        className={`text-[18px] font-bold tabular-nums ${
                          isEst ? "text-amber-400" : "text-[#10e760]"
                        }`}
                      >
                        {score}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setScoreReason(buildLeaderboardScoreReason(entry, period))}
                      className="px-2 py-1 rounded-full text-[10px] font-medium bg-white/[0.05] text-[#86868b] border border-white/[0.08] cursor-pointer"
                    >
                      {entry.todayStatus === "Rest" ? "Rest" : "—"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openFriendDetail(entry.userId)}
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
      )}

      {/* Add Friend Sheet (FR-35) */}
      <BottomSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Friend"
        subtitle="Send a request by username or share your invite link."
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Username
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="@dev_iron"
                className="flex-1 h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
              />
              <button
                type="button"
                disabled={sendingReq || !usernameInput.trim()}
                onClick={handleSendRequest}
                className="px-5 h-11 rounded-xl bg-[#10e760] hover:bg-[#25d658] disabled:opacity-40 text-black font-semibold text-[14px] cursor-pointer"
              >
                Send
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Your Invite Link
            </div>
            <div className="text-[12px] text-[#a1a1a6] break-all font-mono">
              {inviteLink}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openWhatsAppShare(inviteShareText)}
                className="h-10 rounded-xl bg-[#10e760] hover:bg-[#25d658] text-black text-[13px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={handleNativeInviteShare}
                className="h-10 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-white text-[13px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            </div>
            <button
              type="button"
              onClick={handleCopyInvite}
              className="w-full h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#a1a1a6] hover:text-white text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Link
            </button>
          </div>
        </div>
      </BottomSheet>

      <FriendDetailSheet
        open={detailOpen}
        loading={detailLoading}
        detail={friendDetail}
        thresholds={state.appSettings.gridThresholds}
        currentUserId={state.profile.userId}
        onRemoveFriend={async (friendUid, friendUsername) => {
          const res = await apiRemoveFriend(friendUid);
          if (res.ok) {
            onToast(`Removed @${friendUsername}`);
            onRefresh();
          } else {
            onToast(res.error || "Could not remove friend", "error");
          }
        }}
        onClose={() => setDetailOpen(false)}
      />

      <ScoreReasonSheet reason={scoreReason} onClose={() => setScoreReason(null)} />
    </div>
  );
}
