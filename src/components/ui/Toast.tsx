"use client";

import { Check, AlertCircle } from "lucide-react";

export interface ToastMessage {
  id: number;
  text: string;
  tone?: "success" | "error" | "info";
}

export function Toast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null;
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] pointer-events-none px-4 w-full max-w-sm flex justify-center">
      <div className="flex items-center gap-2.5 bg-[#16161a]/95 backdrop-blur-xl border border-white/15 rounded-full px-4 py-2.5 shadow-2xl">
        {toast.tone === "error" ? (
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
        ) : (
          <Check className="w-4 h-4 text-[#10e760] shrink-0" />
        )}
        <span className="text-[13px] font-medium text-[#f5f5f7] tracking-[-0.01em]">
          {toast.text}
        </span>
      </div>
    </div>
  );
}
