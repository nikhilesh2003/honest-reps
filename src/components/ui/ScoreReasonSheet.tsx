"use client";

import { ScoreReasonData } from "@/lib/score-reason";
import { BottomSheet } from "./BottomSheet";

interface ScoreReasonSheetProps {
  reason: ScoreReasonData | null;
  onClose: () => void;
}

export function ScoreReasonSheet({ reason, onClose }: ScoreReasonSheetProps) {
  return (
    <BottomSheet
      open={Boolean(reason)}
      onClose={onClose}
      title={reason?.title || "Score Breakdown"}
      subtitle={reason?.subtitle}
    >
      {reason && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-[#86868b] font-semibold">
                Reason Behind Score
              </div>
              <div
                className={`text-[13px] font-medium mt-0.5 ${
                  reason.isEstimated ? "text-amber-400" : "text-[#10e760]"
                }`}
              >
                {reason.badgeText}
              </div>
            </div>
            <div
              className={`text-[26px] font-bold tabular-nums leading-none ${
                reason.isEstimated ? "text-amber-400" : "text-[#10e760]"
              }`}
            >
              {reason.scoreLabel}
            </div>
          </div>

          {reason.items.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2.5">
              {reason.items.map((item, idx) => (
                <div
                  key={`${item.label}-${idx}`}
                  className="flex items-start justify-between gap-3 text-[12px]"
                >
                  <div className="min-w-0">
                    <div className="text-white font-medium">{item.label}</div>
                    <div className="text-[#86868b] text-[11px] mt-0.5 leading-snug">
                      {item.detail}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${
                      reason.isEstimated ? "text-amber-400" : "text-[#10e760]"
                    }`}
                  >
                    {item.points}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[11px] text-[#86868b] leading-snug tabular-nums">
            {reason.formulaNote}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
