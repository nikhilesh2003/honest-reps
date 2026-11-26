"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Moon, Scale, Trash2, X } from "lucide-react";
import { BottomSheet } from "../ui/BottomSheet";
import { AppStatePayload } from "@/lib/client-types";
import { apiClearSession, apiSaveSession } from "@/lib/client-engine";
import { daysBetweenIso, formatWeight, REST_DAY_POLICY } from "@/lib/effort";

interface DailyCheckinSheetProps {
  open: boolean;
  onClose: () => void;
  state: AppStatePayload;
  onSaved: (message: string) => void;
}

export function DailyCheckinSheet({
  open,
  onClose,
  state,
  onSaved,
}: DailyCheckinSheetProps) {
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isRest, setIsRest] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [skipWeight, setSkipWeight] = useState(false);
  const [saving, setSaving] = useState(false);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open || wasOpen) return;

    if (state.todaySession) {
      setIsRest(state.todaySession.isRest);
      setSelectedGroups(state.todaySession.muscleGroups);
    } else {
      setIsRest(false);
      setSelectedGroups([]);
    }
    setWeightInput("");
    setSkipWeight(false);
  }, [open, state.todaySession]);

  const toggleGroup = (name: string) => {
    setIsRest(false);
    setSelectedGroups((prev) =>
      prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!isRest && selectedGroups.length === 0) {
        const cleared = await apiClearSession(state.realTodayIso);
        if (cleared.ok) {
          onSaved("Today's muscles cleared");
          onClose();
        }
        return;
      }

      const res = await apiSaveSession({
        date: state.realTodayIso,
        isRest,
        muscleGroups: isRest ? [] : selectedGroups,
        weightValue: !skipWeight && weightInput ? weightInput : undefined,
      });
      if (res.ok) {
        onSaved(isRest ? "Marked as Rest day" : `Focus set to ${selectedGroups.join(" & ")}`);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClearToday = async () => {
    setSaving(true);
    try {
      const res = await apiClearSession(state.realTodayIso);
      if (res.ok) {
        setSelectedGroups([]);
        setIsRest(false);
        onSaved("Today's session removed");
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const unit = state.profile.weightUnit;
  const canClear = Boolean(state.todaySession) || selectedGroups.length > 0 || isRest;
  const isClearingEmpty = !isRest && selectedGroups.length === 0;

  const sortedPriorDays = state.summaries365
    .filter((d) => d.date < state.realTodayIso)
    .sort((a, b) => b.date.localeCompare(a.date));
  let priorConsecRest = 0;
  let expectedPrevOffset = 1;
  for (const d of sortedPriorDays) {
    const gap = daysBetweenIso(d.date, state.realTodayIso);
    if (gap === expectedPrevOffset && d.isRest && d.itemCount === 0) {
      priorConsecRest += 1;
      expectedPrevOffset += 1;
    } else if (gap >= expectedPrevOffset) {
      break;
    }
  }
  const restInPast7Days = state.summaries365.filter((d) => {
    const gap = daysBetweenIso(d.date, state.realTodayIso);
    return gap >= 1 && gap <= 6 && d.isRest && d.itemCount === 0;
  }).length;
  const exceedsRestCap =
    priorConsecRest >= REST_DAY_POLICY.maxConsecutiveRestDays ||
    restInPast7Days >= REST_DAY_POLICY.maxRestDaysPerWeek;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Today's Focus"
      subtitle="Select target muscle groups or mark today as Rest."
    >
      <div className="space-y-4">
        {selectedGroups.length > 0 && !isRest && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedGroups.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => toggleGroup(g)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#30d158]/15 text-[12px] font-medium text-[#30d158] cursor-pointer"
              >
                {g}
                <X className="w-3 h-3" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedGroups([])}
              className="px-2 py-1 text-[11px] font-medium text-[#86868b] hover:text-white cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {state.visibleMuscleGroups.map((mg) => {
            const active = !isRest && selectedGroups.includes(mg.name);
            return (
              <button
                key={mg.id}
                type="button"
                onClick={() => toggleGroup(mg.name)}
                className={`h-11 px-4 rounded-2xl flex items-center justify-between text-[14px] font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-[#30d158]/15 text-white ring-1 ring-[#30d158]/50"
                    : "bg-[#1c1c1e] text-[#a1a1a6] hover:text-white"
                }`}
              >
                <span>{mg.name}</span>
                {active && <Check className="w-4 h-4 text-[#30d158]" />}
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => {
              setIsRest(true);
              setSelectedGroups([]);
            }}
            className={`w-full py-3 px-4 rounded-2xl flex items-center justify-between text-[14px] font-medium transition-colors cursor-pointer ${
              isRest
                ? "bg-white/[0.12] text-white ring-1 ring-white/30"
                : "bg-[#1c1c1e] text-[#86868b] hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2.5 text-left">
              <Moon className="w-4 h-4 shrink-0" />
              <div>
                <div>Rest Day</div>
                <div className="text-[11px] font-normal text-[#86868b] tabular-nums">
                  {restInPast7Days}/{REST_DAY_POLICY.maxRestDaysPerWeek} used this week · Max{" "}
                  {REST_DAY_POLICY.maxConsecutiveRestDays} consecutive
                </div>
              </div>
            </div>
            {isRest && <Check className="w-4 h-4 text-white shrink-0" />}
          </button>

          {isRest && exceedsRestCap && (
            <p className="text-[11px] text-amber-400 px-1 leading-snug">
              Exceeds max {REST_DAY_POLICY.maxConsecutiveRestDays} consecutive or{" "}
              {REST_DAY_POLICY.maxRestDaysPerWeek} rest days per 7 days.
            </p>
          )}
        </div>

        {/* FR-42: Skippable weekly weight prompt */}
        {state.needsWeightPrompt && !skipWeight && (
          <div className="p-3.5 rounded-2xl bg-[#1c1c1e] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-[#30d158]" />
                <span className="text-[13px] font-medium text-white">Weekly Weight</span>
              </div>
              <button
                type="button"
                onClick={() => setSkipWeight(true)}
                className="text-[12px] text-[#86868b] hover:text-white cursor-pointer"
              >
                Skip
              </button>
            </div>
            <p className="text-[12px] text-[#86868b]">
              {state.latestWeight
                ? `Last logged ${state.daysSinceLastWeight}d ago (${formatWeight(
                    state.latestWeight.weightKg,
                    unit
                  )}).`
                : "Add your weight to refine calorie estimates."}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder={
                  state.latestWeight
                    ? String(
                        unit === "lb"
                          ? Number((state.latestWeight.weightKg * 2.20462).toFixed(1))
                          : state.latestWeight.weightKg
                      )
                    : "74.5"
                }
                className="flex-1 h-10 px-3.5 rounded-xl bg-black/40 text-white text-[15px] tabular-nums focus:outline-none"
              />
              <span className="text-[13px] text-[#86868b] font-medium w-8">{unit}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {state.todaySession && (
            <button
              type="button"
              disabled={saving}
              onClick={handleClearToday}
              className="h-12 px-4 rounded-full bg-[#1c1c1e] hover:bg-red-500/20 text-[#86868b] hover:text-red-300 text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          )}
          <button
            type="button"
            disabled={saving || (!state.todaySession && isClearingEmpty)}
            onClick={handleSave}
            className="flex-1 h-12 rounded-full bg-[#30d158] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-[15px] transition-opacity cursor-pointer"
          >
            {saving
              ? "Saving..."
              : isClearingEmpty && canClear
              ? "Clear Focus"
              : "Save"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
