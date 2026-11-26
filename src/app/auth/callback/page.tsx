"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { apiCompleteGoogleAuth } from "@/lib/client-engine";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getPostAuthTarget = (profile: { onboardingComplete: boolean }): string => {
    if (!profile.onboardingComplete) return "/onboarding/";
    try {
      const pending =
        typeof window !== "undefined" ? localStorage.getItem("hr_pending_invite_user") : null;
      if (pending) {
        return `/invite?u=${encodeURIComponent(pending)}&auto_send=1`;
      }
    } catch {}
    return "/";
  };

  useEffect(() => {
    let active = true;

    async function finishAuth() {
      try {
        const supabase = createSupabaseBrowserClient();
        if (!supabase) {
          router.replace("/signin/");
          return;
        }

        const url = new URL(window.location.href);
        const err = url.searchParams.get("error_description") || url.searchParams.get("error");
        if (err) {
          if (active) setErrorMsg(err);
          return;
        }

        const { data: existingData } = await supabase.auth.getUser();
        if (existingData?.user?.email) {
          const profile = await apiCompleteGoogleAuth(
            existingData.user.email,
            existingData.user.user_metadata?.full_name || existingData.user.user_metadata?.name,
            existingData.user.id
          );
          router.replace(getPostAuthTarget(profile));
          return;
        }

        const code = url.searchParams.get("code");
        if (code) {
          const { data: exData, error: exErr } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exErr) {
            const { data: retryData } = await supabase.auth.getUser();
            if (retryData?.user?.email) {
              const profile = await apiCompleteGoogleAuth(
                retryData.user.email,
                retryData.user.user_metadata?.full_name || retryData.user.user_metadata?.name,
                retryData.user.id
              );
              router.replace(getPostAuthTarget(profile));
              return;
            }
            if (active) setErrorMsg(exErr.message);
            return;
          }
          if (exData?.user?.email) {
            const profile = await apiCompleteGoogleAuth(
              exData.user.email,
              exData.user.user_metadata?.full_name || exData.user.user_metadata?.name,
              exData.user.id
            );
            router.replace(getPostAuthTarget(profile));
            return;
          }
        }

        if (window.location.hash && window.location.hash.includes("access_token=")) {
          const hashParams = new URLSearchParams(window.location.hash.slice(1));
          const access_token = hashParams.get("access_token");
          const refresh_token = hashParams.get("refresh_token") || "";
          if (access_token) {
            const { data: sessData } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (sessData?.user?.email) {
              const profile = await apiCompleteGoogleAuth(
                sessData.user.email,
                sessData.user.user_metadata?.full_name || sessData.user.user_metadata?.name,
                sessData.user.id
              );
              router.replace(getPostAuthTarget(profile));
              return;
            }
          }
        }

        if (active) setErrorMsg("Could not verify Google session. Please try again.");
      } catch {
        if (active) setErrorMsg("Authentication failed. Please try again.");
      }
    }

    finishAuth();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="brand-icon-box w-12 h-12 rounded-2xl p-1.5 flex items-center justify-center">
        <img
          src="/icons/logo-icon.png"
          alt="Honest Reps"
          className="w-full h-full object-contain"
        />
      </div>
      {errorMsg ? (
        <div className="apple-card p-5 max-w-xs w-full space-y-3">
          <p className="text-[13px] text-amber-400">{errorMsg}</p>
          <Link
            href="/signin/"
            className="inline-flex items-center justify-center w-full h-11 rounded-full bg-white text-black font-semibold text-[14px]"
          >
            Back to Sign In
          </Link>
        </div>
      ) : (
        <p className="text-[13px] text-[#86868b]">Signing in...</p>
      )}
    </div>
  );
}
