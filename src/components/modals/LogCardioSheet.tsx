"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Sparkles, Check, Calendar, AlertTriangle } from "lucide-react";
import { BottomSheet } from "../ui/BottomSheet";
import { triggerHaptic } from "@/lib/haptics";
import { AppStatePayload } from "@/lib/client-types";
import { apiLogCardio, apiParseCardio, apiUpdateCardioLog } from "@/lib/client-engine";
import { CardioLog, ParsedCardioDraft } from "@/lib/types";
import { addDaysIso, daysBetweenIso, formatShortMonthDay } from "@/lib/effort";

interface LogCardioSheetProps {
  open: boolean;
  onClose: () => void;
  state: AppStatePayload;
  initialBackfill?: boolean;
  editingLog?: CardioLog | null;
  onSaved: (message: string) => void;
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

  // Editable confirmation fields (FR-15)
  const [activityType, setActivityType] = useState("Indoor Walk");
  const [minutes, setMinutes] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [avgHeartRate, setAvgHeartRate] = useState("");
  const [kcal, setKcal] = useState("");
  const [kcalIsEstimated, setKcalIsEstimated] = useState(false);
  const [source, setSource] = useState<"manual" | "text-parsed" | "image-parsed">("text-parsed");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

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
      setDistanceKm(editingLog.distanceKm !== undefined ? String(editingLog.distanceKm) : "");
      setAvgHeartRate(editingLog.avgHeartRate !== undefined ? String(editingLog.avgHeartRate) : "");
      setKcal(String(editingLog.kcal));
      setKcalIsEstimated(editingLog.kcalIsEstimated);
      setSource(editingLog.source);
      return;
    }

    setDraft(null);
    setDateOffset(initialBackfill ? -1 : 0);
  }, [open, initialBackfill, editingLog]);

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(String(reader.result));
      setImageMeta({ mimeType: file.type || "image/png", fileName: file.name });
    };
    reader.readAsDataURL(file);
  };

  const handleParse = async () => {
    if (!freeText.trim() && !imagePreview) {
      setError("Type cardio details or upload a screenshot.");
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
      setDistanceKm(d.distanceKm !== null ? String(d.distanceKm) : "");
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

  const openManualForm = () => {
    setDraft({
      activityType: "Indoor Walk",
      distanceKm: null,
      minutes: null,
      avgHeartRate: null,
      kcal: null,
      kcalIsEstimated: true,
      missingMinutes: true,
      source: "manual",
      providerUsed: "manual",
    });
    setActivityType("Indoor Walk");
    setMinutes("");
    setDistanceKm("");
    setAvgHeartRate("");
    setKcal("");
    setKcalIsEstimated(true);
    setSource("manual");
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
      if (editingLog) {
        const targetDate = addDaysIso(state.realTodayIso, dateOffset);
        const data = await apiUpdateCardioLog(editingLog.id, {
          date: targetDate,
          activityType,
          minutes: minsNum,
          distanceKm: distanceKm ? Number(distanceKm) : undefined,
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
        distanceKm: distanceKm ? Number(distanceKm) : undefined,
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
        label: off === -1 ? "Yesterday" : formatShortMonthDay(addDaysIso(state.realTodayIso, off)),
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
          : "Type freely or upload a screenshot"
      }
    >
      <div className="space-y-4">
        {/* Date Selector (editable in both Log and Edit modes) */}
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

        {/* Step 1: Text / Screenshot Input (FR-12, FR-14) */}
        {!draft && (
          <div className="space-y-3">
            <textarea
              rows={3}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder='e.g. "indoor walk 1.5 km, 25 min, 118 bpm"'
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

        {/* Step 2: Mandatory Confirmation Card (FR-15, FR-16, FR-21) */}
        {draft && (
          <div className="space-y-3.5">
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-[#10e760]/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#10e760]">
                  Confirm Details
                </span>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="text-[12px] text-[#86868b] hover:text-white cursor-pointer"
                >
                  Edit input
                </button>
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
                      {existingWalksOnDate.length} logged previously ({existingWalksOnDate.reduce((a, b) => a + b.minutes, 0)}m total)
                    </span>
                  </div>
                  <div className="text-[11px] text-[#86868b] leading-tight">
                    This walk will be saved as <strong>Split {existingWalksOnDate.length + 1}</strong> and grouped under your day&apos;s Indoor Walk.
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
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    placeholder="20"
                    className={`w-full h-10 px-3 rounded-xl bg-black border text-white text-[14px] tabular-nums focus:outline-none ${
                      !minutes ? "border-amber-500/60" : "border-white/12 focus:border-[#10e760]"
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#86868b] mb-1">
                    Distance (km)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(e.target.value)}
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
