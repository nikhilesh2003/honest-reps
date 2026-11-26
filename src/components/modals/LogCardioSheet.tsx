"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Sparkles, Check, Calendar, AlertTriangle } from "lucide-react";
import { BottomSheet } from "../ui/BottomSheet";
import { triggerHaptic } from "@/lib/haptics";
import { AppStatePayload } from "@/lib/client-types";
import { apiLogCardio, apiParseCardio, apiUpdateCardioLog } from "@/lib/client-engine";
import { CardioLog, ParsedCardioDraft } from "@/lib/types";
import {
  addDaysIso,
  convertDistanceToKm,
  convertKmToDisplayDistance,
  daysBetweenIso,
  formatShortMonthDay,
} from "@/lib/effort";

interface LogCardioSheetProps {
  open: boolean;
  onClose: () => void;
  state: AppStatePayload;
  initialBackfill?: boolean;
  editingLog?: CardioLog | null;
  onSaved: (message: string) => void;
}

const DEFAULT_CARDIO_PRESETS = [
  "Indoor Walk",
  "Incline Walk",
  "Treadmill Run",
  "Cycling",
  "Stairmaster",
  "Rowing",
];

async function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Read error"));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1280;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function LogCardioSheet({
  open,
  onClose,
  state,
  initialBackfill = false,
  editingLog = null,
  onSaved,
}: LogCardioSheetProps) {
  const [freeText, setFreeText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{ mimeType: string; fileName: string } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [draft, setDraft] = useState<ParsedCardioDraft | null>(null);
  const [dateOffset, setDateOffset] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activityType, setActivityType] = useState("Indoor Walk");
  const [minutes, setMinutes] = useState("");
  const [distanceInput, setDistanceInput] = useState("");
  const [avgHeartRate, setAvgHeartRate] = useState("");
  const [kcal, setKcal] = useState("");
  const [kcalIsEstimated, setKcalIsEstimated] = useState(false);
  const [source, setSource] = useState<"manual" | "text-parsed" | "image-parsed">("text-parsed");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  const weightUnit = state.profile.weightUnit;
  const distUnit = weightUnit === "lb" ? "mi" : "km";

  const quickPresets = useMemo(() => {
    const recentTypes: string[] = [];
    for (const c of state.recentCardioLogs) {
      const clean = c.activityType.trim();
      if (clean && !recentTypes.some((r) => r.toLowerCase() === clean.toLowerCase())) {
        recentTypes.push(clean);
      }
      if (recentTypes.length >= 4) break;
    }
    for (const def of DEFAULT_CARDIO_PRESETS) {
      if (!recentTypes.some((r) => r.toLowerCase() === def.toLowerCase())) {
        recentTypes.push(def);
      }
    }
    return recentTypes.slice(0, 6);
  }, [state.recentCardioLogs]);

  const selectedDate = addDaysIso(state.realTodayIso, dateOffset);
  const isIndoorWalk =
    activityType.trim().toLowerCase().includes("indoor walk") ||
    activityType.trim().toLowerCase() === "walk";
  const existingWalksOnDate = state.recentCardioLogs.filter(
    (c) =>
      c.date === selectedDate &&
      (!editingLog || c.id !== editingLog.id) &&
      (c.activityType.trim().toLowerCase().includes("indoor walk") ||
        c.activityType.trim().toLowerCase() === "walk")
  );

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open || wasOpen) return;
    setFreeText("");
    setImagePreview(null);
    setImageMeta(null);
    setError(null);

    if (editingLog) {
      const diff = daysBetweenIso(editingLog.date, state.realTodayIso);
      const maxB = state.appSettings.backfillWindowDays || 2;
      setDateOffset(diff >= 0 && diff <= maxB ? -diff : 0);
      setDraft({
        activityType: editingLog.activityType,
        distanceKm: editingLog.distanceKm ?? null,
        minutes: editingLog.minutes,
        avgHeartRate: editingLog.avgHeartRate ?? null,
        kcal: editingLog.kcal,
        kcalIsEstimated: editingLog.kcalIsEstimated,
        missingMinutes: false,
        source: editingLog.source,
        providerUsed: editingLog.source,
      });
      setActivityType(editingLog.activityType);
      setMinutes(String(editingLog.minutes));
      setDistanceInput(
        editingLog.distanceKm !== undefined
          ? String(convertKmToDisplayDistance(editingLog.distanceKm, weightUnit))
          : ""
      );
      setAvgHeartRate(
        editingLog.avgHeartRate !== undefined ? String(editingLog.avgHeartRate) : ""
      );
      setKcal(String(editingLog.kcal));
      setKcalIsEstimated(editingLog.kcalIsEstimated);
      setSource(editingLog.source);
      return;
    }

    setDraft(null);
    setDateOffset(initialBackfill ? -1 : 0);
  }, [open, initialBackfill, editingLog, state.realTodayIso, state.appSettings.backfillWindowDays, weightUnit]);

  const processSelectedFile = async (file: File) => {
    try {
      const compressed = await compressImageFile(file);
      setImagePreview(compressed);
      setImageMeta({ mimeType: "image/jpeg", fileName: file.name || "screenshot.jpg" });
    } catch {
      // Ignore read failure
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void processSelectedFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void processSelectedFile(file);
          return;
        }
      }
    }
  };

  const openPresetForm = (presetActivity: string) => {
    triggerHaptic("selection");
    const lastMatch = state.recentCardioLogs.find(
      (c) => c.activityType.trim().toLowerCase() === presetActivity.trim().toLowerCase()
    );
    const defaultMins = lastMatch ? String(lastMatch.minutes) : "20";
    const defaultDist =
      lastMatch?.distanceKm !== undefined
        ? String(convertKmToDisplayDistance(lastMatch.distanceKm, weightUnit))
        : "";

    setDraft({
      activityType: presetActivity,
      distanceKm: lastMatch?.distanceKm ?? null,
      minutes: Number(defaultMins),
      avgHeartRate: null,
      kcal: null,
      kcalIsEstimated: true,
      missingMinutes: false,
      source: "manual",
      providerUsed: "manual",
    });
    setActivityType(presetActivity);
    setMinutes(defaultMins);
    setDistanceInput(defaultDist);
    setAvgHeartRate("");
    setKcal("");
    setKcalIsEstimated(true);
    setSource("manual");
  };

  const openManualForm = () => {
    openPresetForm("Indoor Walk");
    setMinutes("");
    setDistanceInput("");
  };

  const handleParse = async () => {
    if (!freeText.trim() && !imagePreview) {
      setError("Type cardio details, tap a quick activity above, or upload a screenshot.");
      return;
    }
    setParsing(true);
    setError(null);
    try {
      const data = await apiParseCardio({
        text: freeText,
        imageBase64: imagePreview || undefined,
        imageFileName: imageMeta?.fileName,
      });
      if (!data.ok || !data.draft) {
        setError(data.error || "Enter cardio fields manually.");
        openManualForm();
        return;
      }
      const d = data.draft;
      setDraft(d);
      setActivityType(d.activityType);
      setMinutes(d.minutes !== null ? String(d.minutes) : "");
      setDistanceInput(
        d.distanceKm !== null
          ? String(convertKmToDisplayDistance(d.distanceKm, weightUnit))
          : ""
      );
      setAvgHeartRate(d.avgHeartRate !== null ? String(d.avgHeartRate) : "");
      setKcal(d.kcal !== null ? String(d.kcal) : "");
      setKcalIsEstimated(d.kcalIsEstimated);
      setSource(d.source);
    } catch {
      setError("Enter details manually below.");
      openManualForm();
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmSave = async () => {
    const minsNum = Number(minutes);
    if (!minsNum || minsNum <= 0) {
      triggerHaptic("error");
      setError("Minutes are required to save cardio.");
      return;
    }
    triggerHaptic("light");
    setSaving(true);
    setError(null);
    try {
      const resolvedDistanceKm =
        distanceInput && Number(distanceInput) > 0
          ? convertDistanceToKm(Number(distanceInput), weightUnit)
          : undefined;

      if (editingLog) {
        const targetDate = addDaysIso(state.realTodayIso, dateOffset);
        const data = await apiUpdateCardioLog(editingLog.id, {
          date: targetDate,
          activityType,
          minutes: minsNum,
          distanceKm: resolvedDistanceKm,
          avgHeartRate: avgHeartRate ? Number(avgHeartRate) : undefined,
          kcal: kcal ? Number(kcal) : undefined,
          kcalIsEstimated: kcal ? kcalIsEstimated : true,
        });
        if (!data.ok) {
          setError(data.error || "Could not update cardio.");
          return;
        }
        onSaved(`${activityType} updated`);
        onClose();
        return;
      }

      const targetDate = addDaysIso(state.realTodayIso, dateOffset);
      const data = await apiLogCardio({
        date: targetDate,
        activityType,
        minutes: minsNum,
        distanceKm: resolvedDistanceKm,
        avgHeartRate: avgHeartRate ? Number(avgHeartRate) : undefined,
        kcal: kcal ? Number(kcal) : undefined,
        kcalIsEstimated: kcal ? kcalIsEstimated : true,
        source,
      });
      if (!data.ok) {
        setError(data.error || "Could not save cardio.");
        return;
      }
      triggerHaptic("success");
      const statusLabel =
        data.entry?.status === "Rest"
          ? "Rest day"
          : data.entry?.status === "Calibrating"
          ? "Calibrating"
          : `Effort ${data.entry?.effortScore}`;
      const splitText =
        isIndoorWalk && existingWalksOnDate.length > 0
          ? ` · Split #${existingWalksOnDate.length + 1}`
          : "";
      onSaved(
        `${activityType}${splitText} saved · ${statusLabel}${
          dateOffset < 0 ? " · Added later" : ""
        }`
      );
      onClose();
    } catch {
      setError("Error while saving.");
    } finally {
      setSaving(false);
    }
  };

  const maxBackfill = state.appSettings.backfillWindowDays || 2;
  const dateOptions = [
    { offset: 0, label: "Today" },
    ...Array.from({ length: maxBackfill }, (_, idx) => {
      const off = -(idx + 1);
      return {
        offset: off,
        label:
          off === -1
            ? "Yesterday"
            : formatShortMonthDay(addDaysIso(state.realTodayIso, off)),
      };
    }),
  ];

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editingLog ? "Edit Cardio" : dateOffset < 0 ? "Backfill Cardio" : "Log Cardio"}
      subtitle={
        editingLog
          ? editingLog.date
          : state.todaySession?.isRest && dateOffset === 0
          ? "Logged as Rest day activity"
          : "1-tap preset, free text, or screenshot"
      }
    >
      <div className="space-y-4" onPaste={handlePaste}>
        {/* Date Selector */}
        <div className="flex items-center gap-1.5 bg-white/[0.04] p-1 rounded-xl">
          {dateOptions.map((opt) => (
            <button
              key={opt.offset}
              type="button"
              onClick={() => setDateOffset(opt.offset)}
              className={`flex-1 h-8 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                dateOffset === opt.offset
                  ? "bg-white/[0.14] text-white"
                  : "text-[#86868b] hover:text-white"
              }`}
            >
              {opt.offset < 0 && <Calendar className="w-3 h-3" />}
              {opt.label}
            </button>
          ))}
        </div>

        {/* Step 1: 1-Tap Presets + Text / Screenshot Input */}
        {!draft && (
          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b] mb-1.5">
                Quick Select
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => openPresetForm(preset)}
                    className="px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-[#10e760]/15 border border-white/[0.08] hover:border-[#10e760]/50 text-[12px] font-medium text-[#f5f5f7] transition-colors cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={3}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder={`e.g. "indoor walk 1.5 ${distUnit}, 25 min, 118 bpm" (or paste screenshot)`}
              className="w-full p-3.5 rounded-2xl bg-black border border-white/12 text-white text-[14px] placeholder:text-[#525257] focus:outline-none focus:border-[#10e760] resize-none"
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImagePick}
              className="hidden"
            />

            {imagePreview && (
              <div className="relative rounded-2xl overflow-hidden border border-white/12 bg-black p-2">
                <img
                  src={imagePreview}
                  alt="Uploaded workout"
                  className="max-h-36 mx-auto rounded-xl object-contain"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImagePreview(null);
                    setImageMeta(null);
                  }}
                  className="mt-2 w-full text-[11px] text-[#86868b] hover:text-white cursor-pointer"
                >
                  Remove image
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-11 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white text-[13px] font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-[#86868b]" />
                Screenshot
              </button>
              <button
                type="button"
                onClick={openManualForm}
                className="h-11 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[#a1a1a6] text-[13px] font-medium cursor-pointer"
              >
                Manual entry
              </button>
            </div>

            {error && <p className="text-[12px] text-amber-400">{error}</p>}

            <button
              type="button"
              disabled={parsing}
              onClick={handleParse}
              className="w-full h-12 rounded-2xl bg-[#10e760] hover:bg-[#25d658] disabled:opacity-50 text-black font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {parsing ? "Parsing..." : "Parse Cardio"}
            </button>
          </div>
        )}

        {/* Step 2: Mandatory Confirmation Card */}
        {draft && (
          <div className="space-y-3.5">
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-[#10e760]/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#10e760]">
                  Confirm Details
                </span>
                {!editingLog && (
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    className="text-[12px] text-[#86868b] hover:text-white cursor-pointer"
                  >
                    Back
                  </button>
                )}
              </div>

              {/* Quick Activity Switcher Pills */}
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {quickPresets.map((preset) => {
                  const active =
                    activityType.trim().toLowerCase() === preset.toLowerCase();
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setActivityType(preset)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer ${
                        active
                          ? "bg-[#10e760] text-black border-[#10e760] font-semibold"
                          : "bg-black/40 text-[#86868b] border-white/[0.08] hover:text-white"
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>

              {draft.confidenceNote && (
                <p className="text-[11px] text-[#86868b]">{draft.confidenceNote}</p>
              )}

              {isIndoorWalk && existingWalksOnDate.length > 0 && (
                <div className="p-3 rounded-2xl bg-[#10e760]/10 border border-[#10e760]/30 space-y-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-semibold text-[#10e760]">
                      Split #{existingWalksOnDate.length + 1}
                    </span>
                    <span className="text-[#86868b] text-[11px] tabular-nums">
                      {existingWalksOnDate.length} logged previously (
                      {existingWalksOnDate.reduce((a, b) => a + b.minutes, 0)}m total)
                    </span>
                  </div>
                  <div className="text-[11px] text-[#86868b] leading-tight">
                    This walk will be saved as{" "}
                    <strong>Split {existingWalksOnDate.length + 1}</strong> and grouped under your day&apos;s Indoor Walk.
                  </div>
                </div>
              )}

              {(!minutes || Number(minutes) <= 0) && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[12px] text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Minutes required before saving.</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">Activity</label>
                <input
                  type="text"
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-[#86868b] mb-1">
                    Minutes *
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    placeholder="20"
                    className={`w-full h-10 px-3 rounded-xl bg-black border text-white text-[14px] tabular-nums focus:outline-none ${
                      !minutes
                        ? "border-amber-500/60"
                        : "border-white/12 focus:border-[#10e760]"
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#86868b] mb-1">
                    Distance ({distUnit})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={distanceInput}
                    onChange={(e) => setDistanceInput(e.target.value)}
                    placeholder="Optional"
                    className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white text-[14px] tabular-nums focus:outline-none focus:border-[#10e760]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-[#86868b] mb-1">
                    Avg HR (bpm)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={avgHeartRate}
                    onChange={(e) => setAvgHeartRate(e.target.value)}
                    placeholder="Optional"
                    className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white text-[14px] tabular-nums focus:outline-none focus:border-[#10e760]"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-[#86868b]">Calories</label>
                    {kcalIsEstimated && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-[#a1a1a6]">
                        Estimated
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={kcal}
                    onChange={(e) => {
                      setKcal(e.target.value);
                      setKcalIsEstimated(false);
                    }}
                    placeholder="Auto-estimate"
                    className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white text-[14px] tabular-nums focus:outline-none focus:border-[#10e760]"
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-[12px] text-amber-400">{error}</p>}

            <button
              type="button"
              disabled={saving || !minutes || Number(minutes) <= 0}
              onClick={handleConfirmSave}
              className="w-full h-12 rounded-2xl bg-[#10e760] hover:bg-[#25d658] disabled:opacity-40 text-black font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              {saving
                ? "Saving..."
                : isIndoorWalk && existingWalksOnDate.length > 0
                ? `Confirm & Save Split #${existingWalksOnDate.length + 1}`
                : "Confirm & Save"}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
