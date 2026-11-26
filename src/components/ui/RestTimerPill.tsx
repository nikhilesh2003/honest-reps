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

    const notes = [880, 1174.66]; // A5 -> D6 crisp minimal chime
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
    { sec: 60, label: "60s" },
    { sec: 90, label: "90s" },
    { sec: 120, label: "2m" },
    { sec: 180, label: "3m" },
  ];

  return (
    <div className="fixed top-[calc(0.65rem+env(safe-area-inset-top,0px))] left-3 right-3 z-[65] max-w-[440px] mx-auto pointer-events-none">
      <div className="pointer-events-auto rounded-2xl bg-[#0b0b0e]/95 backdrop-blur-xl border border-white/15 shadow-[0_10px_32px_rgba(0,0,0,0.75)] overflow-hidden">
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowPresets((v) => !v)}
            className="flex items-center gap-2 min-w-0 text-left cursor-pointer group"
            title="Tap to change rest duration preset"
          >
            <span
              className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                isDone
                  ? "bg-[#10e760] text-black animate-pulse"
                  : "bg-[#10e760]/15 text-[#10e760]"
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[16px] font-bold text-white tabular-nums leading-none">
                  {isDone ? "Ready" : formatClock(remainingSec)}
                </span>
                <span className="text-[10px] text-[#86868b] group-hover:text-white truncate">
                  {isDone ? "Next set" : timer.label || "Rest"}
                </span>
              </div>
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
                className="px-2 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-semibold text-[#d1d1d6] tabular-nums cursor-pointer"
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
              className="px-2 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-semibold text-[#10e760] tabular-nums cursor-pointer"
            >
              +30s
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic("light");
                onDismiss();
              }}
              aria-label="Skip rest timer"
              className="px-2.5 h-7 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] text-[11px] font-semibold text-white flex items-center gap-1 cursor-pointer"
            >
              {isDone ? (
                "Done"
              ) : (
                <>
                  <span>Skip</span>
                  <X className="w-3 h-3 text-[#86868b]" />
                </>
              )}
            </button>
          </div>
        </div>

        {showPresets && (
          <div className="px-3.5 pb-2.5 pt-1 border-t border-white/[0.06] flex items-center justify-between gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.06em] text-[#86868b] font-semibold">
              Default Rest
            </span>
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
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold tabular-nums cursor-pointer border ${
                      active
                        ? "bg-[#10e760] text-black border-[#10e760]"
                        : "bg-white/[0.04] text-[#86868b] border-white/[0.08] hover:text-white"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Hairline Progress Bar */}
        <div className="w-full h-[2.5px] bg-white/[0.06]">
          <div
            className="h-full bg-[#10e760] transition-all duration-200"
            style={{ width: `${isDone ? 100 : pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
