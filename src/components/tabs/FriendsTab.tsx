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
  Trophy,
  Search,
  ArrowLeft,
  Lock,
  Unlock,
  Zap,
} from "lucide-react";
import {
  AppStatePayload,
  MemberPreviewPayload,
  MemberSearchResult,
} from "@/lib/client-types";
import {
  buildInviteShareText,
  getInviteUrl,
  openWhatsAppShare,
} from "@/lib/share";
import {
  apiFriendAction,
  apiGetFriendDetail,
  apiGetMemberPreview,
  apiRemoveFriend,
  apiSearchMembers,
  apiSendFriendNudge,
  apiSendFriendRequest,
  apiSyncFriendsNow,
} from "@/lib/client-engine";
import { triggerHaptic } from "@/lib/haptics";
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
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<MemberPreviewPayload | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [nudgedIds, setNudgedIds] = useState<Set<string>>(new Set());

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [friendDetail, setFriendDetail] = useState<FriendDetailPayload | null>(null);
  const [scoreReason, setScoreReason] = useState<ScoreReasonData | null>(null);

  useEffect(() => {
    void apiSyncFriendsNow().then(() => onRefresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!addOpen) {
      setSelectedPreview(null);
      setSearchResults([]);
      setSearchingMembers(false);
      return;
    }
    const q = usernameInput.trim();
    if (!q) {
      setSearchResults([]);
      setSearchingMembers(false);
      return;
    }
    let cancelled = false;
    setSearchingMembers(true);
    const timer = setTimeout(() => {
      void apiSearchMembers(q)
        .then((rows) => {
          if (!cancelled) setSearchResults(rows);
        })
        .finally(() => {
          if (!cancelled) setSearchingMembers(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addOpen, usernameInput]);

  const openMemberPreview = async (member: MemberSearchResult) => {
    setLoadingPreview(true);
    setSelectedPreview({
      ...member,
      activeDays30d: 0,
      totalWorkouts: 0,
    });
    try {
      const full = await apiGetMemberPreview(member.userId);
      if (full) setSelectedPreview(full);
    } finally {
      setLoadingPreview(false);
    }
  };

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

  const handleSendRequest = async (explicitTarget?: string) => {
    const raw = (explicitTarget ?? usernameInput).trim();
    if (!raw) return;
    setSendingReq(true);
    try {
      const data = await apiSendFriendRequest(raw);
      if (!data.ok) {
        onToast(data.error || "Could not send request", "error");
        return;
      }
      onToast(`Request sent to @${data.targetUsername}`);
      if (selectedPreview) {
        setSelectedPreview({
          ...selectedPreview,
          friendshipStatus: "pending_sent",
        });
      } else {
        setUsernameInput("");
        setAddOpen(false);
      }
      onRefresh();
    } finally {
      setSendingReq(false);
    }
  };

  const handleRequestAction = async (
    friendshipId: string,
    action: "accept" | "decline" | "remove"
  ) => {
    const res = await apiFriendAction(friendshipId, action);
    if (res.ok) {
      onToast(
        action === "accept"
          ? "Friend added"
          : action === "remove"
          ? "Request cancelled"
          : "Request declined"
      );
      onRefresh();
    }
  };

  const handleFistBump = async (
    friendUserId: string,
    friendUsername: string,
    inGym?: boolean
  ) => {
    triggerHaptic("medium");
    const res = await apiSendFriendNudge(
      friendUserId,
      friendUsername,
      inGym ? "spot" : "fistbump"
    );
    if (res.ok) {
      setNudgedIds((prev) => new Set(prev).add(friendUserId));
      onToast(`Sent bump to @${friendUsername}`);
    } else {
      onToast(res.error || "Already bumped recently", "error");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-white leading-tight">
            Friends
          </h1>
          <div className="text-[12px] text-[#86868b] mt-0.5 tabular-nums">
            {friendsList.length} connected
            {inGymCount > 0 ? ` · ${inGymCount} in gym` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNavigateLeaderboard}
            className="px-3.5 py-2 rounded-full bg-[#111113] border border-white/[0.06] hover:border-white/15 text-[12px] font-medium text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Trophy className="w-3.5 h-3.5 text-[#30d158]" />
            Ranks
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="px-3.5 py-2 rounded-full bg-[#30d158] text-black text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>

      {/* Pending Incoming Requests */}
      {state.incomingRequests.length > 0 && (
        <div className="space-y-2">
          <div className="apple-section-label px-0.5">
            Requests ({state.incomingRequests.length})
          </div>
          <div className="apple-card px-4 py-1 divide-y divide-white/[0.06]">
            {state.incomingRequests.map((req) => (
              <div
                key={req.friendshipId}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-[14px] font-medium text-white">{req.name}</div>
                  <div className="text-[12px] text-[#86868b]">@{req.username}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRequestAction(req.friendshipId, "accept")}
                    className="px-3.5 h-8 rounded-full bg-[#30d158] text-black text-[12px] font-semibold cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRequestAction(req.friendshipId, "decline")}
                    aria-label="Decline"
                    className="w-8 h-8 rounded-full bg-[#1c1c1e] text-[#86868b] hover:text-white flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Outgoing Requests */}
      {state.outgoingRequests.length > 0 && (
        <div className="space-y-2">
          <div className="apple-section-label px-0.5">Sent</div>
          <div className="apple-card px-4 py-1 divide-y divide-white/[0.06]">
            {state.outgoingRequests.map((req) => (
              <div
                key={req.friendshipId}
                className="py-2.5 flex items-center justify-between gap-2 text-[13px]"
              >
                <span className="text-[#d1d1d6] truncate">
                  {req.name} <span className="text-[#86868b]">@{req.username}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRequestAction(req.friendshipId, "remove")}
                  className="px-2.5 py-1 rounded-full bg-[#1c1c1e] hover:bg-red-500/20 text-[11px] text-[#86868b] hover:text-red-300 font-medium transition-colors cursor-pointer shrink-0"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connected Friends List */}
      {friendsList.length === 0 ? (
        <div className="apple-card p-7 text-center space-y-3">
          <div className="text-[16px] font-semibold text-white">No friends yet</div>
          <p className="text-[13px] text-[#86868b] max-w-[260px] mx-auto leading-relaxed">
            Add gym friends by @username or share your invite link to compare honest effort.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="px-5 h-10 rounded-full bg-[#30d158] text-black font-semibold text-[13px] cursor-pointer"
          >
            Add Friend
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
            const bumped = nudgedIds.has(entry.userId);
            const canBump = Boolean(entry.inGym || entry.todayScore !== null);

            return (
              <div
                key={entry.userId}
                className="px-4 py-3.5 flex items-center justify-between gap-2.5 hover:bg-white/[0.02] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => openFriendDetail(entry.userId)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[14px] font-semibold ${
                      entry.inGym
                        ? "bg-[#30d158]/15 text-[#30d158] ring-1 ring-[#30d158]/50"
                        : "bg-[#1c1c1e] text-[#f5f5f7]"
                    }`}
                  >
                    {entry.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-medium text-white truncate">
                        {entry.name}
                      </span>
                      <span className="text-[12px] text-[#86868b] truncate">
                        @{entry.username}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[12px]">
                      {entry.inGym ? (
                        <span className="inline-flex items-center gap-1 text-[#30d158] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#30d158]" />
                          In gym
                        </span>
                      ) : (
                        <span className="text-[#86868b]">Away</span>
                      )}
                      <span className="text-[#636366]">·</span>
                      <span className="text-[#86868b] tabular-nums">
                        {entry.currentStreak}d streak
                      </span>
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {canBump && (
                    <button
                      type="button"
                      disabled={bumped}
                      onClick={() =>
                        handleFistBump(entry.userId, entry.username, entry.inGym)
                      }
                      title={bumped ? "Bump sent" : "Send fist bump"}
                      className={`h-7 px-2.5 rounded-full text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                        bumped
                          ? "bg-[#30d158]/15 text-[#30d158]"
                          : "bg-[#1c1c1e] hover:bg-white/[0.1] text-[#d1d1d6]"
                      }`}
                    >
                      {bumped ? (
                        <>
                          <Check className="w-3 h-3" />
                          Sent
                        </>
                      ) : (
                        <>
                          <Zap className="w-3 h-3 text-[#30d158]" />
                          Bump
                        </>
                      )}
                    </button>
                  )}

                  {score !== null ? (
                    <button
                      type="button"
                      onClick={() =>
                        setScoreReason(buildLeaderboardScoreReason(entry, period))
                      }
                      title="Tap score to see why"
                      className="px-2 py-1 rounded-xl hover:bg-white/[0.06] active:scale-95 transition-all text-right cursor-pointer"
                    >
                      <span
                        className={`text-[18px] font-semibold tabular-nums ${
                          isEst ? "text-amber-400" : "text-[#30d158]"
                        }`}
                      >
                        {score}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setScoreReason(buildLeaderboardScoreReason(entry, period))
                      }
                      className="px-2 py-1 text-[12px] font-medium text-[#86868b] cursor-pointer"
                    >
                      {entry.todayStatus === "Rest" ? "Rest" : "—"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openFriendDetail(entry.userId)}
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
      )}

      {/* Add Friend Sheet */}
      <BottomSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={selectedPreview ? selectedPreview.name : "Add Friend"}
        subtitle={
          selectedPreview
            ? `@${selectedPreview.username}`
            : "Search by name or @username, or share your invite link."
        }
      >
        {selectedPreview ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelectedPreview(null)}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#30d158] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to search
            </button>

            <div className="p-4 rounded-2xl bg-[#1c1c1e] space-y-3.5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#30d158]/15 flex items-center justify-center text-[17px] font-semibold text-[#30d158] shrink-0">
                  {selectedPreview.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold text-white truncate">
                    {selectedPreview.name}
                  </div>
                  <div className="text-[13px] text-[#86868b] truncate">
                    @{selectedPreview.username}
                  </div>
                </div>
              </div>

              {selectedPreview.goal && (
                <div className="text-[12px] text-[#d1d1d6]">
                  Goal: <span className="text-white font-medium">{selectedPreview.goal}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-black/35 text-center">
                  <div className="text-[18px] font-semibold text-[#30d158] tabular-nums">
                    {loadingPreview ? "…" : `${selectedPreview.activeDays30d}d`}
                  </div>
                  <div className="text-[11px] text-[#86868b] mt-0.5">Active (30d)</div>
                </div>
                <div className="p-3 rounded-xl bg-black/35 text-center">
                  <div className="text-[18px] font-semibold text-white tabular-nums">
                    {loadingPreview ? "…" : selectedPreview.totalWorkouts}
                  </div>
                  <div className="text-[11px] text-[#86868b] mt-0.5">Total Logs</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[12px] text-[#86868b] pt-1 border-t border-white/[0.06]">
                {selectedPreview.shareWorkoutDetails ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-[#30d158] shrink-0" />
                    <span>Shares workout details with friends</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-[#86868b] shrink-0" />
                    <span>Summary only · Exercise weights private</span>
                  </>
                )}
              </div>
            </div>

            {selectedPreview.friendshipStatus === "none" && (
              <button
                type="button"
                disabled={sendingReq}
                onClick={() => handleSendRequest(selectedPreview.username)}
                className="w-full h-11 rounded-full bg-[#30d158] disabled:opacity-40 text-black font-semibold text-[14px] flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                {sendingReq ? "Sending..." : "Send Friend Request"}
              </button>
            )}

            {selectedPreview.friendshipStatus === "pending_sent" && (
              <div className="w-full h-11 rounded-full bg-[#1c1c1e] text-[#86868b] font-medium text-[13px] flex items-center justify-center">
                Request Sent
              </div>
            )}

            {selectedPreview.friendshipStatus === "pending_received" &&
              selectedPreview.friendshipId && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleRequestAction(selectedPreview.friendshipId!, "accept");
                    setSelectedPreview({
                      ...selectedPreview,
                      friendshipStatus: "accepted",
                    });
                  }}
                  className="w-full h-11 rounded-full bg-[#30d158] text-black font-semibold text-[14px] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Accept Request
                </button>
              )}

            {selectedPreview.friendshipStatus === "accepted" && (
              <button
                type="button"
                onClick={() => {
                  const uid = selectedPreview.userId;
                  setAddOpen(false);
                  void openFriendDetail(uid);
                }}
                className="w-full h-11 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] text-white font-medium text-[14px] flex items-center justify-center gap-2 cursor-pointer"
              >
                View Profile
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#86868b] absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Name, @username, or invite link"
                className="apple-input w-full h-11 pl-10 pr-3.5 text-[14px]"
              />
            </div>

            {usernameInput.trim().length > 0 && (
              <div className="rounded-2xl bg-[#1c1c1e] divide-y divide-white/[0.06] max-h-60 overflow-y-auto no-scrollbar">
                {searchingMembers ? (
                  <div className="py-5 text-center text-[12px] text-[#86868b]">
                    Searching...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-5 text-center text-[12px] text-[#86868b] space-y-2">
                    <div>No matching profiles found.</div>
                    {(usernameInput.includes("http") ||
                      usernameInput.includes("/invite")) && (
                      <button
                        type="button"
                        disabled={sendingReq}
                        onClick={() => handleSendRequest()}
                        className="px-4 py-1.5 rounded-full bg-[#30d158] text-black text-[12px] font-semibold cursor-pointer"
                      >
                        Try Invite Link
                      </button>
                    )}
                  </div>
                ) : (
                  searchResults.map((m) => (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => openMemberPreview(m)}
                      className="w-full px-4 py-3 hover:bg-white/[0.04] flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center text-[13px] font-semibold text-white shrink-0">
                          {m.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[14px] font-medium text-white truncate">
                            {m.name}
                          </div>
                          <div className="text-[12px] text-[#86868b] truncate">
                            @{m.username}
                            {m.goal ? ` · ${m.goal}` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.friendshipStatus === "accepted" ? (
                          <span className="text-[#30d158] text-[12px] font-medium">
                            Friends
                          </span>
                        ) : m.friendshipStatus === "pending_sent" ? (
                          <span className="text-[#86868b] text-[12px]">Sent</span>
                        ) : m.friendshipStatus === "pending_received" ? (
                          <span className="text-amber-400 text-[12px] font-medium">
                            Pending
                          </span>
                        ) : (
                          <span className="text-[12px] font-medium text-[#30d158]">
                            View
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-[#636366]" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="p-4 rounded-2xl bg-[#1c1c1e] space-y-3">
              <div className="text-[12px] font-medium text-[#86868b]">Invite Link</div>
              <div className="text-[12px] text-[#d1d1d6] break-all font-mono">
                {inviteLink}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => openWhatsAppShare(inviteShareText)}
                  className="h-9 rounded-full bg-[#30d158] text-black text-[12px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handleNativeInviteShare}
                  className="h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </button>
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white text-[12px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
            </div>
          </div>
        )}
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
