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
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[#1c1c1e] border border-white/[0.05]">
            <div>
              <div className="text-[12px] text-[#86868b] font-medium">
                {reason.badgeText}
              </div>
              <div className="text-[11px] text-[#636366] mt-0.5">
                Relative to personal baseline
              </div>
            </div>
            <div
              className={`text-[28px] font-semibold tracking-[-0.03em] tabular-nums leading-none ${
                reason.isEstimated ? "text-amber-400" : "text-[#30d158]"
              }`}
            >
              {reason.scoreLabel}
            </div>
          </div>

          {reason.items.length > 0 && (
            <div className="rounded-2xl bg-[#1c1c1e] border border-white/[0.05] divide-y divide-white/[0.06]">
              {reason.items.map((item, idx) => (
                <div
                  key={`${item.label}-${idx}`}
                  className="px-4 py-3 flex items-start justify-between gap-3 text-[13px]"
                >
                  <div className="min-w-0">
                    <div className="text-white font-medium">{item.label}</div>
                    <div className="text-[#86868b] text-[12px] mt-0.5 leading-snug">
                      {item.detail}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${
                      reason.isEstimated ? "text-amber-400" : "text-[#30d158]"
                    }`}
                  >
                    {item.points}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="px-1 text-[11px] text-[#86868b] leading-relaxed tabular-nums">
            {reason.formulaNote}
          </p>
        </div>
      )}
    </BottomSheet>
  );
}
