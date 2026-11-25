"use client";

import { useEffect } from "react";

export function SwRegistrar() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Silent fallback in restricted environments
      });
    }
  }, []);
  return null;
}
