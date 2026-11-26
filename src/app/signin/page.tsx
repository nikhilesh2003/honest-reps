"use client";

import { useEffect, useState } from "react";
import { Activity, Camera, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const PREVIEW_DAYS = [
  { day: "M", score: 48, pct: 48, color: "var(--effort-very-low)", text: "text-[#bbf7d0]" },
  { day: "T", score: 62, pct: 62, color: "var(--effort-low)", text: "text-black" },
  { day: "W", score: null, pct: 0, color: "transparent", text: "text-[#525257]", rest: true },
  { day: "T", score: 54, pct: 54, color: "var(--effort-low)", text: "text-black" },
  { day: "F", score: 72, pct: 72, color: "var(--effort-steady)", text: "text-black" },
  { day: "S", score: 81, pct: 81, color: "var(--effort-high)", text: "text-black" },
  { day: "S", score: 88, pct: 88, color: "var(--effort-very-high)", text: "text-black", today: true },
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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-5 py-10 pt-safe pb-safe">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-3">
          <div className="brand-icon-box w-20 h-20 mx-auto rounded-[22px] p-2.5 flex items-center justify-center">
            <img
              src="/icons/logo-icon.png"
              alt="Honest Reps"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="brand-icon-box inline-flex px-4 py-1.5 rounded-2xl mx-auto">
            <img
              src="/icons/logo-wordmark.png"
              alt="honestreps.com"
              className="h-7 object-contain"
            />
          </div>
          <p className="text-[14px] text-[#86868b] leading-relaxed max-w-[300px] mx-auto">
            Strength and cardio effort scored strictly against your own history.{" "}
            <span className="text-white font-medium">50 means your usual.</span>
          </p>
        </div>

        {/* Sign-in CTA Card */}
        <div className="apple-card p-5 space-y-3">
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className="w-full h-12 rounded-2xl bg-white hover:bg-[#f5f5f7] disabled:opacity-50 text-black font-semibold text-[15px] flex items-center justify-center gap-3 transition-colors cursor-pointer"
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
            {loading ? "Connecting to Google..." : "Sign in with Google"}
          </button>

          {errorMsg && (
            <p className="text-[12px] text-amber-400 leading-relaxed pt-1">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Compact Apple-Minimal Product Preview */}
        <div className="apple-card p-4 text-left space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                How It Works
              </div>
              <div className="text-[14px] font-semibold text-white mt-0.5">
                Relative Effort · Fair Leaderboards
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-[#10e760]/12 border border-[#10e760]/30 text-[11px] font-bold text-[#10e760] tabular-nums">
              88 / 100
            </span>
          </div>

          {/* Visual 7-Day Preview Strip */}
          <div className="relative pt-1">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-white/15"
              style={{ top: "48px" }}
            />
            <div className="grid grid-cols-7 gap-1.5 relative z-10">
              {PREVIEW_DAYS.map((d, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <span
                    className={`text-[10px] font-semibold ${
                      d.today ? "text-[#10e760]" : "text-[#86868b]"
                    }`}
                  >
                    {d.day}
                  </span>
                  <div
                    className={`w-full h-[64px] rounded-[9px] p-[2px] flex flex-col justify-end bg-[#050506] border ${
                      d.today
                        ? "border-[#10e760]/60"
                        : d.rest
                        ? "border-dashed border-white/15"
                        : "border-white/[0.08]"
                    }`}
                  >
                    {d.score !== null ? (
                      <div
                        className="w-full rounded-[6px] flex items-start justify-center pt-1"
                        style={{ height: `${d.pct}%`, backgroundColor: d.color }}
                      >
                        <span className={`text-[9px] font-bold tabular-nums leading-none ${d.text}`}>
                          {d.score}
                        </span>
                      </div>
                    ) : (
                      <div className="h-full flex items-end justify-center pb-1.5">
                        <span className="text-[8px] text-[#525257]">Rest</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 pt-1 border-t border-white/[0.06] text-[12px]">
            <div className="flex items-start gap-2.5">
              <Activity className="w-4 h-4 text-[#10e760] shrink-0 mt-0.5" />
              <span className="text-[#a1a1a6] leading-snug">
                <strong className="text-white font-medium">50 = Your Usual:</strong> Compare fairly with gym buddies regardless of starting strength.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <Camera className="w-4 h-4 text-[#10e760] shrink-0 mt-0.5" />
              <span className="text-[#a1a1a6] leading-snug">
                <strong className="text-white font-medium">2-Tap Sets &amp; Cardio OCR:</strong> Pre-filled weights, rest timer, PR tracking, and treadmill photo parsing.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#10e760] shrink-0 mt-0.5" />
              <span className="text-[#a1a1a6] leading-snug">
                <strong className="text-white font-medium">Privacy by Default:</strong> Bodyweight stays private; exercise weights only share if you opt in.
              </span>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-[#525257]">Developed by Ifleon</div>
      </div>
    </div>
  );
}
