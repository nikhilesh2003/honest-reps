"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus, Check, Copy, ArrowRight, Users } from "lucide-react";
import {
  apiGetState,
  apiLocalGoogleSignIn,
  apiSendFriendRequest,
  apiUpdateProfile,
} from "@/lib/client-engine";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types";

function GoogleGIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
      />
    </svg>
  );
}

export default function InviteLandingPage() {
  const [targetUsername, setTargetUsername] = useState("nikhil22");
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [status, setStatus] = useState<
    "idle" | "sending" | "sent" | "already_friends" | "already_sent" | "is_self" | "error"
  >("idle");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickEmail, setQuickEmail] = useState("");
  const [quickUsername, setQuickUsername] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let parsedUser = "nikhil22";
    const parts = window.location.pathname.split("/").filter(Boolean);
    const params = new URLSearchParams(window.location.search);
    const qUser = params.get("u");
    if (qUser) {
      parsedUser = qUser.replace(/^@/, "").trim();
    } else if (parts[0] === "invite" && parts[1]) {
      parsedUser = decodeURIComponent(parts[1]).replace(/^@/, "").trim();
    }
    setTargetUsername(parsedUser);

    const autoSendParam = params.get("auto_send") === "1" || params.get("auto") === "1";

    apiGetState()
      .then(async (state) => {
        setLoadingUser(false);
        if (state.authenticated && state.profile) {
          const me = state.profile;
          setCurrentUser(me);

          if (me.username.toLowerCase() === parsedUser.toLowerCase()) {
            setStatus("is_self");
            return;
          }

          const isFriend = state.leaderboard.some(
            (m) => !m.isMe && m.username.toLowerCase() === parsedUser.toLowerCase()
          );
          if (isFriend) {
            setStatus("already_friends");
            return;
          }

          const isPending =
            state.outgoingRequests.some(
              (r) => r.username.toLowerCase() === parsedUser.toLowerCase()
            ) ||
            state.incomingRequests.some(
              (r) => r.username.toLowerCase() === parsedUser.toLowerCase()
            );
          if (isPending) {
            setStatus("already_sent");
            return;
          }

          if (autoSendParam) {
            try {
              localStorage.removeItem("hr_pending_invite_user");
              localStorage.removeItem("hr_auto_send");
            } catch {}
            setStatus("sending");
            const res = await apiSendFriendRequest(parsedUser);
            if (res.ok) {
              setStatus("sent");
              setMsg(`Friend request sent to @${parsedUser}!`);
            } else {
              setStatus("error");
              setMsg(res.error || "Could not send request.");
            }
          }
        }
      })
      .catch(() => {
        setLoadingUser(false);
      });
  }, []);

  const sendRequest = async () => {
    setStatus("sending");
    const data = await apiSendFriendRequest(targetUsername);
    if (data.ok) {
      setStatus("sent");
      setMsg(`Friend request sent to @${targetUsername}!`);
    } else {
      if (data.error?.toLowerCase().includes("already friends")) {
        setStatus("already_friends");
      } else if (
        data.error?.toLowerCase().includes("already exists") ||
        data.error?.toLowerCase().includes("pending")
      ) {
        setStatus("already_sent");
      } else {
        setStatus("error");
        setMsg(data.error || "Could not send request.");
      }
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleAuthLoading(true);
    setMsg("");
    try {
      localStorage.setItem("hr_pending_invite_user", targetUsername);
      localStorage.setItem("hr_auto_send", "1");
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setMsg("Authentication service is not configured.");
        setGoogleAuthLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback/`,
        },
      });
      if (error) {
        setMsg(error.message);
        setGoogleAuthLoading(false);
      }
    } catch {
      setMsg("Unable to connect to Google. You can also create an account below.");
      setGoogleAuthLoading(false);
    }
  };

  const handleQuickCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) {
      setMsg("Please enter your name.");
      return;
    }
    if (!quickEmail.trim() || !quickEmail.includes("@")) {
      setMsg("Please enter a valid email address.");
      return;
    }

    setCreatingAccount(true);
    setMsg("");
    try {
      const authResult = await apiLocalGoogleSignIn(quickEmail.trim(), quickName.trim());
      if (!authResult.ok || !authResult.user) {
        setMsg("Account creation failed. Please try again.");
        setCreatingAccount(false);
        return;
      }

      if (quickUsername.trim()) {
        const cleanUser = quickUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (cleanUser) {
          await apiUpdateProfile({ username: cleanUser });
        }
      }

      setCurrentUser(authResult.user);

      const reqRes = await apiSendFriendRequest(targetUsername);
      if (reqRes.ok) {
        setStatus("sent");
        setMsg(`Account created and friend request sent to @${targetUsername}!`);
      } else {
        setStatus("sent");
        setMsg(`Account created! ${reqRes.error || ""}`);
      }
    } catch {
      setMsg("Error setting up account. Please try again.");
    } finally {
      setCreatingAccount(false);
    }
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-black relative overflow-hidden flex flex-col items-center justify-center px-5 py-10 pt-safe pb-safe">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-[#30d158]/14 blur-[90px]"
      />
      <div className="relative w-full max-w-[360px] space-y-6 text-center">
        <Link href="/" className="inline-block">
          <div className="brand-icon-box w-14 h-14 mx-auto rounded-2xl p-2 flex items-center justify-center">
            <img
              src="/icons/logo-icon.png"
              alt="Honest Reps"
              className="w-full h-full object-contain"
            />
          </div>
        </Link>

        <div className="apple-card p-6 space-y-5">
          <div className="space-y-1.5">
            <div className="text-[12px] font-medium text-[#86868b]">Friend Invite</div>
            <h1 className="text-[26px] font-semibold text-white tracking-[-0.03em]">
              @{targetUsername}
            </h1>
            <p className="text-[13px] text-[#86868b] leading-relaxed">
              Compare gym and cardio effort fairly against each other&apos;s own history.
            </p>
          </div>

          {loadingUser && (
            <div className="py-5 text-[13px] text-[#86868b]">Checking account...</div>
          )}

          {!loadingUser && (
            <>
              {status === "sent" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-[#1c1c1e] text-left space-y-1">
                    <div className="flex items-center gap-2 text-[#30d158] font-semibold text-[14px]">
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>Request Sent</span>
                    </div>
                    <p className="text-[12px] text-[#86868b] leading-relaxed">
                      Once @{targetUsername} accepts, you&apos;ll see each other&apos;s daily effort and streaks.
                    </p>
                  </div>

                  <Link
                    href="/"
                    className="w-full h-12 rounded-full bg-[#30d158] text-black font-semibold text-[15px] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Open Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}

              {status === "already_friends" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-[#1c1c1e] text-left space-y-1">
                    <div className="flex items-center gap-2 text-white font-semibold text-[14px]">
                      <Users className="w-4 h-4 text-[#30d158]" />
                      <span>Already Connected</span>
                    </div>
                    <p className="text-[12px] text-[#86868b]">
                      You and @{targetUsername} are already friends.
                    </p>
                  </div>

                  <Link
                    href="/?tab=friends"
                    className="w-full h-12 rounded-full bg-[#30d158] text-black font-semibold text-[15px] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Open Friends</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}

              {status === "already_sent" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-[#1c1c1e] text-left space-y-1">
                    <div className="text-amber-400 font-semibold text-[14px]">
                      Request Pending
                    </div>
                    <p className="text-[12px] text-[#86868b]">
                      Waiting for @{targetUsername} to accept your request.
                    </p>
                  </div>

                  <Link
                    href="/?tab=friends"
                    className="w-full h-12 rounded-full bg-[#1c1c1e] hover:bg-white/[0.1] text-white font-medium text-[14px] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Go to Friends</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}

              {status === "is_self" && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-[#1c1c1e] text-[12px] text-[#86868b]">
                    This is your personal invite link. Share it with friends to connect.
                  </div>

                  <button
                    type="button"
                    onClick={copyInviteLink}
                    className="w-full h-12 rounded-full bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-[#30d158]" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>{copied ? "Copied" : "Copy Invite Link"}</span>
                  </button>

                  <Link
                    href="/"
                    className="block text-[13px] text-[#86868b] hover:text-white pt-1"
                  >
                    Back to Dashboard
                  </Link>
                </div>
              )}

              {currentUser &&
                !["sent", "already_friends", "already_sent", "is_self"].includes(status) && (
                  <div className="space-y-4">
                    <div className="px-3 py-2 rounded-xl bg-[#1c1c1e] text-[12px] text-[#86868b]">
                      Signed in as{" "}
                      <span className="text-white font-medium">@{currentUser.username}</span>
                    </div>

                    <button
                      type="button"
                      disabled={status === "sending"}
                      onClick={sendRequest}
                      className="w-full h-12 rounded-full bg-[#30d158] hover:opacity-90 disabled:opacity-50 text-black font-semibold text-[15px] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>
                        {status === "sending" ? "Sending..." : `Add @${targetUsername}`}
                      </span>
                    </button>

                    {status === "error" && (
                      <p className="text-[12px] text-amber-400 leading-snug">{msg}</p>
                    )}
                  </div>
                )}

              {!currentUser &&
                !["sent", "already_friends", "already_sent", "is_self"].includes(status) && (
                  <div className="space-y-4">
                    <button
                      type="button"
                      disabled={googleAuthLoading}
                      onClick={handleGoogleAuth}
                      className="w-full h-12 rounded-full bg-white hover:opacity-90 disabled:opacity-50 text-black font-semibold text-[14px] flex items-center justify-center gap-2.5 cursor-pointer"
                    >
                      <GoogleGIcon />
                      <span>
                        {googleAuthLoading ? "Connecting..." : "Continue with Google"}
                      </span>
                    </button>

                    {!showEmailForm ? (
                      <button
                        type="button"
                        onClick={() => setShowEmailForm(true)}
                        className="text-[12px] font-medium text-[#86868b] hover:text-white cursor-pointer block mx-auto"
                      >
                        Or create account with email
                      </button>
                    ) : (
                      <form
                        onSubmit={handleQuickCreateAccount}
                        className="space-y-2.5 pt-3 text-left border-t border-white/[0.06]"
                      >
                        <input
                          type="text"
                          required
                          value={quickName}
                          onChange={(e) => setQuickName(e.target.value)}
                          placeholder="Full name"
                          className="apple-input w-full h-10 px-3.5 text-[13px]"
                        />
                        <input
                          type="email"
                          required
                          value={quickEmail}
                          onChange={(e) => setQuickEmail(e.target.value)}
                          placeholder="Email address"
                          className="apple-input w-full h-10 px-3.5 text-[13px]"
                        />
                        <input
                          type="text"
                          value={quickUsername}
                          onChange={(e) => setQuickUsername(e.target.value)}
                          placeholder="Username (optional)"
                          className="apple-input w-full h-10 px-3.5 text-[13px]"
                        />
                        <button
                          type="submit"
                          disabled={creatingAccount}
                          className="w-full h-11 rounded-full bg-[#30d158] disabled:opacity-40 text-black font-semibold text-[13px] cursor-pointer flex items-center justify-center gap-1.5 mt-1"
                        >
                          <UserPlus className="w-4 h-4" />
                          <span>
                            {creatingAccount
                              ? "Creating..."
                              : `Create & Add @${targetUsername}`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowEmailForm(false)}
                          className="w-full text-center text-[11px] text-[#86868b] hover:text-white pt-1 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </form>
                    )}

                    {msg && (
                      <p className="text-[12px] text-amber-400 pt-1 leading-snug">{msg}</p>
                    )}
                  </div>
                )}
            </>
          )}

          <div className="pt-2 border-t border-white/[0.06]">
            <Link
              href="/"
              className="text-[12px] text-[#86868b] hover:text-white transition-colors"
            >
              Open Honest Reps
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
