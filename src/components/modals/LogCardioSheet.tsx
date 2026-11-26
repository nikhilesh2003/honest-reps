"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Calendar, AlertTriangle } from "lucide-react";
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
  const [imageMeta, setImageMeta] = useState<{ mimeType: string; fileName: string } | null>(
    null
  );
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
  }, [
    open,
    initialBackfill,
    editingLog,
    state.realTodayIso,
    state.appSettings.backfillWindowDays,
    weightUnit,
  ]);

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
      setError("Select an activity above, type details, or attach a photo.");
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
          : undefined
      }
    >
      <div className="space-y-4" onPaste={handlePaste}>
        {/* Date Selector */}
        <div className="apple-segmented">
          {dateOptions.map((opt) => (
            <button
              key={opt.offset}
              type="button"
              data-active={dateOffset === opt.offset}
              onClick={() => setDateOffset(opt.offset)}
              className="apple-segmented-btn h-8"
            >
              {opt.offset < 0 && <Calendar className="w-3 h-3" />}
              {opt.label}
            </button>
          ))}
        </div>

        {/* Step 1: Presets + Smart Text / Photo Input */}
        {!draft && (
          <div className="space-y-3.5">
            <div className="flex flex-wrap gap-1.5">
              {quickPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => openPresetForm(preset)}
                  className="px-3 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-white/[0.1] text-[13px] font-medium text-[#f5f5f7] transition-colors cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder={`Type details like "walk 1.5 ${distUnit}, 25m, 118 bpm" or paste a screenshot`}
              className="apple-input w-full p-3.5 text-[14px] resize-none"
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImagePick}
              className="hidden"
            />

            {imagePreview && (
              <div className="rounded-2xl bg-[#1c1c1e] p-2.5 text-center space-y-2">
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
                  className="text-[12px] text-[#86868b] hover:text-white cursor-pointer"
                >
                  Remove photo
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-10 rounded-full bg-[#1c1c1e] hover:bg-white/[0.1] text-white text-[13px] font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-[#86868b]" />
                Photo
              </button>
              <button
                type="button"
                onClick={openManualForm}
                className="h-10 rounded-full bg-[#1c1c1e] hover:bg-white/[0.1] text-[#a1a1a6] hover:text-white text-[13px] font-medium cursor-pointer"
              >
                Manual entry
              </button>
            </div>

            {error && <p className="text-[12px] text-amber-400">{error}</p>}

            <button
              type="button"
              disabled={parsing}
              onClick={handleParse}
              className="w-full h-12 rounded-full bg-[#30d158] hover:opacity-90 disabled:opacity-50 text-black font-semibold text-[15px] transition-opacity cursor-pointer"
            >
              {parsing ? "Reading..." : "Continue"}
            </button>
          </div>
        )}

        {/* Step 2: Clean iOS Inset-Grouped Confirmation */}
        {draft && (
          <div className="space-y-3.5">
            {!editingLog && (
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[12px] font-medium text-[#86868b]">Details</span>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="text-[13px] text-[#30d158] font-medium cursor-pointer"
                >
                  Back
                </button>
              </div>
            )}

            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {quickPresets.map((preset) => {
                const active =
                  activityType.trim().toLowerCase() === preset.toLowerCase();
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setActivityType(preset)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-colors ${
                      active
                        ? "bg-[#30d158] text-black font-semibold"
                        : "bg-[#1c1c1e] text-[#86868b] hover:text-white"
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>

            {draft.confidenceNote && (
              <p className="text-[11px] text-[#86868b] px-1">{draft.confidenceNote}</p>
            )}

            {isIndoorWalk && existingWalksOnDate.length > 0 && (
              <div className="px-3.5 py-2.5 rounded-2xl bg-[#30d158]/10 flex items-center justify-between text-[12px]">
                <span className="font-semibold text-[#30d158]">
                  Split #{existingWalksOnDate.length + 1}
                </span>
                <span className="text-[#86868b] tabular-nums">
                  {existingWalksOnDate.reduce((a, b) => a + b.minutes, 0)}m logged earlier
                </span>
              </div>
            )}

            {(!minutes || Number(minutes) <= 0) && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500/10 text-[12px] text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Duration in minutes is required.</span>
              </div>
            )}

            <div className="rounded-2xl bg-[#1c1c1e] divide-y divide-white/[0.06] overflow-hidden">
              <div className="px-4 h-11 flex items-center justify-between gap-3">
                <label className="text-[14px] text-[#86868b] shrink-0">Activity</label>
                <input
                  type="text"
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value)}
                  className="flex-1 bg-transparent text-right text-[14px] font-medium text-white focus:outline-none"
                />
              </div>

              <div className="px-4 h-11 flex items-center justify-between gap-3">
                <label className="text-[14px] text-[#86868b] shrink-0">Minutes *</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="20"
                  className="w-28 bg-transparent text-right text-[15px] font-semibold text-white placeholder:text-[#636366] tabular-nums focus:outline-none"
                />
              </div>

              <div className="px-4 h-11 flex items-center justify-between gap-3">
                <label className="text-[14px] text-[#86868b] shrink-0">
                  Distance ({distUnit})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={distanceInput}
                  onChange={(e) => setDistanceInput(e.target.value)}
                  placeholder="Optional"
                  className="w-28 bg-transparent text-right text-[14px] text-white placeholder:text-[#636366] tabular-nums focus:outline-none"
                />
              </div>

              <div className="px-4 h-11 flex items-center justify-between gap-3">
                <label className="text-[14px] text-[#86868b] shrink-0">
                  Avg Heart Rate
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={avgHeartRate}
                  onChange={(e) => setAvgHeartRate(e.target.value)}
                  placeholder="Optional bpm"
                  className="w-32 bg-transparent text-right text-[14px] text-white placeholder:text-[#636366] tabular-nums focus:outline-none"
                />
              </div>

              <div className="px-4 h-11 flex items-center justify-between gap-3">
                <span className="text-[14px] text-[#86868b] flex items-center gap-1.5 shrink-0">
                  Calories
                  {kcalIsEstimated && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-[#a1a1a6]">
                      Est.
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={kcal}
                  onChange={(e) => {
                    setKcal(e.target.value);
                    setKcalIsEstimated(false);
                  }}
                  placeholder="Auto"
                  className="w-28 bg-transparent text-right text-[14px] text-white placeholder:text-[#636366] tabular-nums focus:outline-none"
                />
              </div>
            </div>

            {error && <p className="text-[12px] text-amber-400">{error}</p>}

            <button
              type="button"
              disabled={saving || !minutes || Number(minutes) <= 0}
              onClick={handleConfirmSave}
              className="w-full h-12 rounded-full bg-[#30d158] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-[15px] flex items-center justify-center gap-2 transition-opacity cursor-pointer"
            >
              <Check className="w-4 h-4" />
              {saving
                ? "Saving..."
                : isIndoorWalk && existingWalksOnDate.length > 0
                ? `Save Split #${existingWalksOnDate.length + 1}`
                : "Save Cardio"}
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
