"use client";

import { useEffect, useRef, useState } from "react";
import { Timer, X } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";

export interface RestTimerState {
  active: boolean;
  durationSeconds: number;
  targetEndMs: number;
  label?: string;
}

interface RestTimerPillProps {
  timer: RestTimerState | null;
  defaultDuration: number;
  onAdjustSeconds: (deltaSeconds: number) => void;
  onSelectPreset: (seconds: number) => void;
  onDismiss: () => void;
}

function playCompletionChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = [880, 1174.66];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.35);
    });

    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 900);
  } catch {
    // Ignore audio context errors on restricted webviews
  }
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function RestTimerPill({
  timer,
  defaultDuration,
  onAdjustSeconds,
  onSelectPreset,
  onDismiss,
}: RestTimerPillProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showPresets, setShowPresets] = useState(false);
  const completedEndRef = useRef<number | null>(null);

  useEffect(() => {
    if (!timer?.active) {
      setShowPresets(false);
      return;
    }
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(id);
  }, [timer?.active, timer?.targetEndMs]);

  useEffect(() => {
    if (!timer?.active) return;
    const remainingSec = (timer.targetEndMs - nowMs) / 1000;
    if (remainingSec <= 0 && completedEndRef.current !== timer.targetEndMs) {
      completedEndRef.current = timer.targetEndMs;
      playCompletionChime();
      triggerHaptic("success");
    }
  }, [nowMs, timer]);

  if (!timer || !timer.active) return null;

  const remainingMs = Math.max(0, timer.targetEndMs - nowMs);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const isDone = remainingMs <= 0;
  const pct =
    timer.durationSeconds > 0
      ? Math.max(0, Math.min(100, (remainingMs / (timer.durationSeconds * 1000)) * 100))
      : 0;

  const presets = [
    { sec: 60, label: "1m" },
    { sec: 90, label: "90s" },
    { sec: 120, label: "2m" },
    { sec: 180, label: "3m" },
  ];

  return (
    <div className="fixed top-[calc(0.55rem+env(safe-area-inset-top,0px))] left-3 right-3 z-[65] max-w-[400px] mx-auto pointer-events-none">
      <div
        className={`pointer-events-auto bg-[#1c1c1e]/95 backdrop-blur-2xl border border-[#30d158]/35 shadow-[0_0_32px_rgba(48,209,88,0.32),0_10px_32px_rgba(0,0,0,0.65)] overflow-hidden transition-all ${
          showPresets ? "rounded-[22px]" : "rounded-full"
        }`}
      >
        <div className="px-3.5 py-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowPresets((v) => !v)}
            className="flex items-center gap-2 min-w-0 text-left cursor-pointer group"
            title="Tap to change default rest duration"
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                isDone
                  ? "bg-[#30d158] text-black"
                  : "bg-[#30d158]/15 text-[#30d158]"
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
            </span>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-[15px] font-semibold text-white tabular-nums leading-none">
                {isDone ? "Ready" : formatClock(remainingSec)}
              </span>
              <span className="text-[11px] text-[#86868b] group-hover:text-white truncate">
                {isDone ? "Next set" : timer.label || "Rest"}
              </span>
            </div>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            {!isDone && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  onAdjustSeconds(-15);
                }}
                className="px-2 h-6 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-medium text-[#d1d1d6] tabular-nums cursor-pointer"
              >
                -15s
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                onAdjustSeconds(30);
              }}
              className="px-2 h-6 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-medium text-[#30d158] tabular-nums cursor-pointer"
            >
              +30s
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("light");
                onDismiss();
              }}
              aria-label="Dismiss rest timer"
              className="w-6 h-6 rounded-full bg-white/[0.08] hover:bg-white/[0.16] text-[#86868b] hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {showPresets && (
          <div className="px-3.5 pb-2.5 pt-1.5 border-t border-white/[0.06] flex items-center justify-between gap-2">
            <span className="text-[11px] text-[#86868b] font-medium">Default rest</span>
            <div className="flex items-center gap-1">
              {presets.map((p) => {
                const active = defaultDuration === p.sec;
                return (
                  <button
                    key={p.sec}
                    type="button"
                    onClick={() => {
                      triggerHaptic("selection");
                      onSelectPreset(p.sec);
                      setShowPresets(false);
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium tabular-nums cursor-pointer transition-colors ${
                      active
                        ? "bg-[#30d158] text-black font-semibold"
                        : "bg-white/[0.06] text-[#86868b] hover:text-white"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="w-full h-[2.5px] bg-white/[0.06]">
          <div
            className="h-full bg-[#30d158] shadow-[0_0_10px_rgba(48,209,88,0.85)] transition-all duration-200"
            style={{ width: `${isDone ? 100 : pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
