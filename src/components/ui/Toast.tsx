"use client";

import { Check, AlertCircle, RotateCcw } from "lucide-react";

export interface ToastMessage {
  id: number;
  text: string;
  tone?: "success" | "error" | "info";
  actionLabel?: string;
  onAction?: () => void;
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage | null;
  onDismiss?: () => void;
}) {
  if (!toast) return null;
  const hasAction = Boolean(toast.actionLabel && toast.onAction);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-[calc(0.9rem+env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 z-[100] px-4 w-full max-w-sm flex justify-center ${
        hasAction ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div className="flex items-center gap-2.5 bg-[#1c1c1e]/95 backdrop-blur-2xl border border-white/[0.08] rounded-full px-4 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
        {toast.tone === "error" ? (
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
        ) : (
          <Check className="w-4 h-4 text-[#30d158] shrink-0" />
        )}
        <span className="text-[13px] font-medium text-[#f5f5f7] tracking-[-0.01em]">
          {toast.text}
        </span>
        {hasAction && (
          <button
            type="button"
            onClick={() => {
              toast.onAction?.();
              onDismiss?.();
            }}
            className="ml-1 px-2.5 py-1 rounded-full bg-[#30d158] text-black text-[11px] font-semibold flex items-center gap-1 transition-opacity hover:opacity-90 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            {toast.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
