"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-4">
          <div className="brand-icon-box w-20 h-20 mx-auto rounded-[22px] p-2.5 flex items-center justify-center">
            <img
              src="/icons/logo-icon.png"
              alt="Honest Reps"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="brand-icon-box inline-flex px-4 py-2 rounded-2xl mx-auto">
            <img
              src="/icons/logo-wordmark.png"
              alt="honestreps.com"
              className="h-7 object-contain"
            />
          </div>
          <p className="text-[14px] text-[#86868b] leading-relaxed">
            Honest effort compared only against your own history.
          </p>
        </div>

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

        <div className="text-[11px] text-[#525257]">Developed by Ifleon</div>
      </div>
    </div>
  );
}
