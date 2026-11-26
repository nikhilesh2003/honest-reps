"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const PREVIEW_DAYS = [
  { day: "M", score: 48, pct: 48, color: "var(--effort-very-low)" },
  { day: "T", score: 62, pct: 62, color: "var(--effort-low)" },
  { day: "W", score: null, pct: 0, color: "transparent", rest: true },
  { day: "T", score: 54, pct: 54, color: "var(--effort-low)" },
  { day: "F", score: 72, pct: 72, color: "var(--effort-steady)" },
  { day: "S", score: 81, pct: 81, color: "var(--effort-high)" },
  { day: "S", score: 88, pct: 88, color: "var(--effort-very-high)", today: true },
];

// FR-1: Google sign-in ONLY. No passwords, no email/password fields, no default demo login.
export default function SignInPage() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error_description") || params.get("error");
    if (err) {
      setErrorMsg(err);
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setErrorMsg("Authentication service is not configured.");
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback/`,
        },
      });
      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
      }
    } catch {
      setErrorMsg("Unable to start Google sign-in. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12 pt-safe pb-safe">
      <div className="w-full max-w-[360px] space-y-8 text-center">
        {/* Hero */}
        <div className="space-y-3">
          <div className="brand-icon-box w-16 h-16 mx-auto rounded-[18px] p-2 flex items-center justify-center">
            <img
              src="/icons/logo-icon.png"
              alt="Honest Reps"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-white leading-tight">
            Honest Reps
          </h1>
          <p className="text-[15px] text-[#86868b] leading-relaxed max-w-[290px] mx-auto">
            Strength and cardio scored strictly against your own history.{" "}
            <span className="text-white font-medium">50 is your usual.</span>
          </p>
        </div>

        {/* Direct Primary CTA */}
        <div className="space-y-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className="w-full h-12 rounded-full bg-white hover:opacity-90 disabled:opacity-50 text-black font-semibold text-[15px] flex items-center justify-center gap-3 transition-opacity cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
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
            {loading ? "Connecting..." : "Continue with Google"}
          </button>

          {errorMsg && (
            <p className="text-[12px] text-amber-400 leading-relaxed pt-1">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Calm Apple Fitness Product Preview */}
        <div className="apple-card p-5 text-left space-y-4">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[12px] font-medium text-[#86868b]">Relative Effort</div>
              <div className="text-[15px] font-semibold text-white mt-0.5">
                Last 7 Days
              </div>
            </div>
            <div className="text-right tabular-nums">
              <span className="text-[22px] font-semibold text-[#30d158]">88</span>
              <span className="text-[12px] text-[#636366] ml-0.5">/100</span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 pt-1">
            {PREVIEW_DAYS.map((d, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1.5">
                <div className="w-full h-[56px] rounded-[10px] bg-[#1c1c1e] p-[2px] flex flex-col justify-end overflow-hidden">
                  {d.score !== null ? (
                    <div
                      className="w-full rounded-[8px]"
                      style={{ height: `${d.pct}%`, backgroundColor: d.color }}
                    />
                  ) : (
                    <div className="h-full flex items-end justify-center pb-1.5">
                      <span className="text-[8px] text-[#636366]">Rest</span>
                    </div>
                  )}
                </div>
                <span
                  className={`text-[10px] font-medium ${
                    d.today ? "text-[#30d158]" : "text-[#86868b]"
                  }`}
                >
                  {d.day}
                </span>
              </div>
            ))}
          </div>

          <div className="divide-y divide-white/[0.06] pt-1 text-[12px] text-[#86868b]">
            <div className="py-2 flex items-center justify-between gap-2">
              <span className="text-white font-medium">Fair leaderboards</span>
              <span>50 = your personal usual</span>
            </div>
            <div className="py-2 flex items-center justify-between gap-2">
              <span className="text-white font-medium">Fast logging</span>
              <span>2-tap sets, rest timer &amp; photo OCR</span>
            </div>
            <div className="pt-2 flex items-center justify-between gap-2">
              <span className="text-white font-medium">Private by default</span>
              <span>Bodyweight stays hidden</span>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-[#636366]">Ifleon</div>
      </div>
    </div>
  );
}
