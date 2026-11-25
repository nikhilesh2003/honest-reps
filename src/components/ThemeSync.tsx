"use client";

import { useEffect } from "react";
import { ThemePreference } from "@/lib/types";

export const THEME_STORAGE_KEY = "honest_reps_theme";

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const val = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (val === "light" || val === "dark" || val === "system") return val;
  return "system";
}

export function applyThemePreference(pref: ThemePreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, pref);

  const root = document.documentElement;
  const resolved =
    pref === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : pref;

  root.setAttribute("data-theme", resolved);
  root.classList.toggle("dark", resolved === "dark");

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute("content", resolved === "light" ? "#f2f2f7" : "#000000");
  }
}

export function ThemeSync() {
  useEffect(() => {
    const sync = () => applyThemePreference(getStoredThemePreference());
    sync();

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onSystemChange = () => {
      if (getStoredThemePreference() === "system") {
        applyThemePreference("system");
      }
    };
    mq.addEventListener("change", onSystemChange);
    window.addEventListener("storage", sync);
    return () => {
      mq.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return null;
}
