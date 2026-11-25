"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Clock, Calendar } from "lucide-react";
import { BottomSheet } from "../ui/BottomSheet";
import { triggerHaptic } from "@/lib/haptics";
import { AppStatePayload } from "@/lib/client-types";
import { apiLibraryAction, apiLogStrength, apiUpdateStrengthLog } from "@/lib/client-engine";
import {
  addDaysIso,
  daysBetweenIso,
  detectSetPersonalRecord,
  estimateOneRepMax,
  formatShortMonthDay,
  getExerciseLoadMode,
} from "@/lib/effort";
import { ExerciseLibraryItem, ExerciseLog } from "@/lib/types";

interface LogStrengthSheetProps {
  open: boolean;
  onClose: () => void;
  state: AppStatePayload;
  initialBackfill?: boolean;
  initialExerciseName?: string;
  editingLog?: ExerciseLog | null;
  onSaved: (message: string) => void;
  onExerciseAdded?: (exerciseName: string) => void;
}

export function LogStrengthSheet({
  open,
  onClose,
  state,
  initialBackfill = false,
  initialExerciseName,
  editingLog = null,
  onSaved,
  onExerciseAdded,
}: LogStrengthSheetProps) {
  const [selectedExercise, setSelectedExercise] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("Chest");
  const [sets, setSets] = useState<Array<{ weight: string; reps: string }>>([
    { weight: "80", reps: "10" },
  ]);
  const [optionalMinutes, setOptionalMinutes] = useState("");
  const [showMinutes, setShowMinutes] = useState(false);
  const [rir, setRir] = useState<number | null>(null);
  const [dateOffset, setDateOffset] = useState(0); // 0 = Today, -1 = Yesterday, -2 = 2 days ago (FR-34)
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeGroupFilter, setActiveGroupFilter] = useState<string>("All");
  const [customExercises, setCustomExercises] = useState<ExerciseLibraryItem[]>([]);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [newExName, setNewExName] = useState("");
  const [newExGroup, setNewExGroup] = useState("Chest");
  const [addingEx, setAddingEx] = useState(false);
  const [newExError, setNewExError] = useState<string | null>(null);

  const strengthMuscleGroups = useMemo(() => {
    return state.visibleMuscleGroups.filter(
      (mg) => mg.name.toLowerCase() !== "cardio"
    );
  }, [state.visibleMuscleGroups]);

  const sessionGroups = useMemo(() => {
    if (state.todaySession && !state.todaySession.isRest && state.todaySession.muscleGroups.length > 0) {
      return state.todaySession.muscleGroups;
    }
    return [];
  }, [state.todaySession]);

  const allExercises = useMemo(() => {
    const list = [...state.visibleExercises];
    for (const c of customExercises) {
      if (!list.some((e) => e.name.toLowerCase() === c.name.toLowerCase())) {
        list.push(c);
      }
    }
    return list;
  }, [state.visibleExercises, customExercises]);

  const filteredExercises = useMemo(() => {
    if (activeGroupFilter === "All") {
      if (sessionGroups.length > 0 && dateOffset === 0) {
        const inSession = allExercises.filter((e) =>
          sessionGroups.includes(e.muscleGroup)
        );
        const others = allExercises.filter(
          (e) => !sessionGroups.includes(e.muscleGroup)
        );
        return [...inSession, ...others];
      }
      return allExercises;
    }
    return allExercises.filter(
      (e) => e.muscleGroup.toLowerCase() === activeGroupFilter.toLowerCase()
    );
  }, [allExercises, activeGroupFilter, sessionGroups, dateOffset]);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open || wasOpen) return;
    setError(null);
    setShowAddExercise(false);
    setNewExName("");
    setNewExError(null);
    const unit = state.profile.weightUnit;

    if (editingLog) {
      const diff = daysBetweenIso(editingLog.date, state.realTodayIso);
      const maxB = state.appSettings.backfillWindowDays || 2;
      setDateOffset(diff >= 0 && diff <= maxB ? -diff : 0);
      setSelectedExercise(editingLog.exerciseName);
      setSelectedGroup(editingLog.muscleGroup);
      setActiveGroupFilter(editingLog.muscleGroup);
      setSets(
        editingLog.sets.map((s) => ({
          weight: String(
            unit === "lb" ? Number((s.weightKg * 2.20462).toFixed(1)) : s.weightKg
          ),
          reps: String(s.reps),
        }))
      );
      if (editingLog.optionalMinutes) {
        setOptionalMinutes(String(editingLog.optionalMinutes));
        setShowMinutes(true);
      } else {
        setOptionalMinutes("");
        setShowMinutes(false);
      }
      setRir(typeof editingLog.rir === "number" ? editingLog.rir : null);
      return;
    }

    const isBFill = initialBackfill;
    setDateOffset(isBFill ? -1 : 0);
    setOptionalMinutes("");
    setShowMinutes(false);
    setRir(null);

    let defaultFilter = "All";
    let defaultEx: ExerciseLibraryItem | undefined = undefined;

    if (initialExerciseName) {
      defaultEx = allExercises.find(
        (e) => e.name.toLowerCase() === initialExerciseName.toLowerCase()
      );
      if (defaultEx) {
        defaultFilter = defaultEx.muscleGroup;
      }
    } else if (!isBFill && sessionGroups.length > 0) {
      defaultFilter = sessionGroups[0];
      defaultEx = allExercises.find(
        (e) => e.muscleGroup.toLowerCase() === defaultFilter.toLowerCase()
      );
    }

    if (!defaultEx) {
      if (defaultFilter !== "All") {
        defaultEx = allExercises.find(
          (e) => e.muscleGroup.toLowerCase() === defaultFilter.toLowerCase()
        );
      }
      if (!defaultEx) {
        defaultEx = allExercises[0];
      }
    }

    setActiveGroupFilter(defaultFilter);
    setNewExGroup(defaultFilter !== "All" ? defaultFilter : (strengthMuscleGroups[0]?.name || "Chest"));

    if (defaultEx) {
      pickExercise(defaultEx.name, defaultEx.muscleGroup);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBackfill, initialExerciseName, editingLog]);

  const pickExercise = (name: string, group: string) => {
    setSelectedExercise(name);
    setSelectedGroup(group);
    const mode = getExerciseLoadMode(name);
    // Pre-fill last used weight & total reps for instant 2-tap logging (NFR-4)
    const lastLog = state.recentExerciseLogs.find(
      (l) => l.exerciseName.toLowerCase() === name.toLowerCase()
    );
    const unit = state.profile.weightUnit;
    if (lastLog && lastLog.sets.length > 0) {
      setSets(
        lastLog.sets.map((s) => {
          const displayW = unit === "lb" ? Number((s.weightKg * 2.20462).toFixed(1)) : s.weightKg;
          return {
            weight: mode === "bodyweight" ? "" : String(displayW),
            reps: String(s.reps),
          };
        })
      );
    } else if (mode === "bodyweight") {
      setSets([{ weight: "", reps: "15" }]);
    } else if (mode === "assisted") {
      setSets([{ weight: "20", reps: "10" }]);
    } else {
      setSets([{ weight: "40", reps: "10" }]);
    }
  };

  const addSetRow = () => {
    triggerHaptic("selection");
    const last = sets[sets.length - 1] || { weight: "40", reps: "10" };
    setSets((prev) => [...prev, { ...last }]);
  };

  const updateSet = (idx: number, field: "weight" | "reps", val: string) => {
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s)));
  };

  const removeSet = (idx: number) => {
    if (sets.length <= 1) return;
    triggerHaptic("light");
    setSets((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateExercise = async () => {
    const trimmed = newExName.trim();
    if (!trimmed) {
      setNewExError("Please enter an exercise name.");
      return;
    }
    const group = newExGroup || strengthMuscleGroups[0]?.name || "Chest";
    setAddingEx(true);
    setNewExError(null);
    try {
      const res = await apiLibraryAction({
        action: "add-exercise",
        name: trimmed,
        muscleGroup: group,
      });
      if (!res.ok) {
        setNewExError(res.error || "Could not add exercise.");
        return;
      }
      const newExItem: ExerciseLibraryItem = (res as { exercise?: ExerciseLibraryItem }).exercise || {
        id: `ex_usr_${Date.now()}`,
        name: trimmed,
        muscleGroup: group,
        enabled: true,
        displayOrder: 999,
        ownerId: state.profile.userId,
      };
      setCustomExercises((prev) => [...prev, newExItem]);
      setActiveGroupFilter(group);
      pickExercise(trimmed, group);
      setNewExName("");
      setShowAddExercise(false);
      onExerciseAdded?.(trimmed);
    } catch {
      setNewExError("Failed to add exercise.");
    } finally {
      setAddingEx(false);
    }
  };

  const handleSave = async () => {
    if (!selectedExercise) {
      triggerHaptic("error");
      setError("Choose an exercise.");
      return;
    }
    triggerHaptic("light");
    setSaving(true);
    setError(null);
    try {
      const parsedSets = sets.map((s) => ({
        weight: Number(s.weight) || 0,
        reps: Math.max(1, Number(s.reps) || 1),
      }));

      if (editingLog) {
        const targetDate = addDaysIso(state.realTodayIso, dateOffset);
        const data = await apiUpdateStrengthLog(editingLog.id, {
          date: targetDate,
          exerciseName: selectedExercise,
          muscleGroup: selectedGroup,
          sets: parsedSets,
          optionalMinutes: optionalMinutes ? Number(optionalMinutes) : undefined,
          rir,
        });
        if (!data.ok) {
          setError(data.error || "Could not update entry.");
          return;
        }
        onSaved(`${selectedExercise} updated`);
        triggerHaptic("success");
        onClose();
        return;
      }

      const targetDate = addDaysIso(state.realTodayIso, dateOffset);
      const data = await apiLogStrength({
        date: targetDate,
        exerciseName: selectedExercise,
        muscleGroup: selectedGroup,
        sets: parsedSets,
        optionalMinutes: optionalMinutes ? Number(optionalMinutes) : undefined,
        rir: rir ?? undefined,
      });
      if (!data.ok) {
        setError(data.error || "Could not save entry.");
        return;
      }
      triggerHaptic("success");
      const badge =
        data.entry?.status === "Calibrating"
          ? "Calibrating"
          : `Effort ${data.entry?.effortScore}`;
      onSaved(
        `${selectedExercise} saved · ${badge}${dateOffset < 0 ? " · Added later" : ""}`
      );
      onClose();
    } catch {
      setError("Error while saving.");
    } finally {
      setSaving(false);
    }
  };

  const unit = state.profile.weightUnit;
  const loadMode = getExerciseLoadMode(selectedExercise);
  const weightLabel =
    loadMode === "assisted"
      ? `Assisted (${unit})`
      : loadMode === "bodyweight"
      ? `Extra (${unit}, opt.)`
      : `Weight (${unit})`;
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
      title={editingLog ? "Edit Strength" : dateOffset < 0 ? "Backfill Strength" : "Log Strength"}
      subtitle={
        editingLog
          ? editingLog.date
          : dateOffset < 0
          ? 'Saved with "Added later" label'
          : loadMode === "assisted"
          ? "Strength = Bodyweight − Assisted"
          : loadMode === "bodyweight"
          ? "Uses bodyweight · extra weight optional"
          : sessionGroups.length > 0
          ? sessionGroups.join(" · ")
          : "Quick entry"
      }
    >
      <div className="space-y-4">
        {/* Date Selector (Today / Backfill window, editable in both Log and Edit modes) */}
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

        {/* Muscle Group Pills (for both Backfill and Normal Log) */}
        {!editingLog && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                Muscle Groups
              </span>
              {activeGroupFilter !== "All" && (
                <button
                  type="button"
                  onClick={() => setActiveGroupFilter("All")}
                  className="text-[11px] text-[#86868b] hover:text-white cursor-pointer"
                >
                  Show all
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <button
                type="button"
                onClick={() => setActiveGroupFilter("All")}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold shrink-0 transition-colors cursor-pointer border ${
                  activeGroupFilter === "All"
                    ? "bg-white text-black border-white"
                    : "bg-white/[0.04] text-[#86868b] border-white/[0.08] hover:text-white"
                }`}
              >
                All
              </button>
              {strengthMuscleGroups.map((mg) => {
                const active = activeGroupFilter.toLowerCase() === mg.name.toLowerCase();
                const isSessionTarget =
                  dateOffset === 0 &&
                  sessionGroups.some((sg) => sg.toLowerCase() === mg.name.toLowerCase());
                return (
                  <button
                    key={mg.id}
                    type="button"
                    onClick={() => {
                      setActiveGroupFilter(mg.name);
                      setNewExGroup(mg.name);
                    }}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-semibold shrink-0 transition-colors cursor-pointer border flex items-center gap-1.5 ${
                      active
                        ? "bg-[#10e760] text-black border-[#10e760]"
                        : isSessionTarget
                        ? "bg-[#10e760]/12 text-[#10e760] border-[#10e760]/30 hover:border-[#10e760]/60"
                        : "bg-white/[0.04] text-[#86868b] border-white/[0.08] hover:text-white"
                    }`}
                  >
                    {isSessionTarget && !active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10e760] shrink-0" />
                    )}
                    <span>{mg.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Exercises Section & Add to Library */}
        {editingLog ? (
          <div className="px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
            <span className="text-[14px] font-semibold text-white">{selectedExercise}</span>
            <span className="text-[11px] text-[#86868b]">{selectedGroup}</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                Exercises {activeGroupFilter !== "All" ? `· ${activeGroupFilter}` : ""}
              </span>
              <button
                type="button"
                onClick={() => {
                  setNewExGroup(
                    activeGroupFilter !== "All"
                      ? activeGroupFilter
                      : strengthMuscleGroups[0]?.name || "Chest"
                  );
                  setShowAddExercise((prev) => !prev);
                  setNewExError(null);
                }}
                className="text-[12px] font-semibold text-[#10e760] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to library</span>
              </button>
            </div>

            {/* Inline Add New Exercise Form */}
            {showAddExercise && (
              <div className="p-3.5 rounded-2xl bg-[#10e760]/[0.06] border border-[#10e760]/30 space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-white flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-[#10e760]" />
                    New Workout &rarr; Personal Library
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddExercise(false);
                      setNewExError(null);
                    }}
                    className="text-[#86868b] hover:text-white text-[12px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newExName}
                    onChange={(e) => {
                      setNewExName(e.target.value);
                      setNewExError(null);
                    }}
                    placeholder="e.g. Incline DB Curl, Face Pull"
                    className="flex-1 h-10 px-3 rounded-xl bg-black border border-white/12 text-white text-[13px] placeholder:text-[#6e6e73] focus:outline-none focus:border-[#10e760]"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateExercise();
                      }
                    }}
                  />

                  <select
                    value={newExGroup}
                    onChange={(e) => setNewExGroup(e.target.value)}
                    className="h-10 px-3 rounded-xl bg-black border border-white/12 text-white text-[12px] focus:outline-none focus:border-[#10e760]"
                  >
                    {strengthMuscleGroups.map((mg) => (
                      <option key={mg.id} value={mg.name}>
                        {mg.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={addingEx || !newExName.trim()}
                    onClick={handleCreateExercise}
                    className="h-10 px-4 rounded-xl bg-[#10e760] hover:bg-[#25d658] disabled:opacity-40 text-black font-semibold text-[13px] transition-colors flex items-center justify-center gap-1 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{addingEx ? "Saving..." : "Add"}</span>
                  </button>
                </div>

                {newExError && <div className="text-[11px] text-amber-400">{newExError}</div>}
              </div>
            )}

            {/* Exercise Pills Wrap */}
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto no-scrollbar">
              {filteredExercises.map((ex) => {
                const active = selectedExercise.toLowerCase() === ex.name.toLowerCase();
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => pickExercise(ex.name, ex.muscleGroup)}
                    className={`px-3 py-2 rounded-full text-[13px] font-medium transition-colors cursor-pointer border ${
                      active
                        ? "bg-[#10e760] text-black border-[#10e760] font-semibold"
                        : "bg-white/[0.04] text-[#f5f5f7] border-white/[0.08] hover:border-white/25"
                    }`}
                  >
                    {ex.name}
                  </button>
                );
              })}

              {/* + Add New Pill */}
              <button
                type="button"
                onClick={() => {
                  setNewExGroup(
                    activeGroupFilter !== "All"
                      ? activeGroupFilter
                      : strengthMuscleGroups[0]?.name || "Chest"
                  );
                  setShowAddExercise(true);
                  setNewExError(null);
                }}
                className="px-3 py-2 rounded-full text-[13px] font-medium text-[#10e760] bg-[#10e760]/10 border border-dashed border-[#10e760]/40 hover:bg-[#10e760]/20 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add new</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick Entry Set Rows (FR-11: first-set weight + total reps by default + optional Add Set) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              {sets.length === 1 ? "Quick Entry" : `Sets (${sets.length})`}
            </span>
            <button
              type="button"
              onClick={addSetRow}
              className="text-[12px] font-medium text-[#10e760] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add set
            </button>
          </div>

          {sets.map((s, idx) => {
            const rawWeight = Number(s.weight) || 0;
            const rawReps = Number(s.reps) || 0;
            const weightKg = unit === "lb" ? rawWeight / 2.20462 : rawWeight;
            const est1RMKg = estimateOneRepMax(weightKg, rawReps, selectedExercise);
            const display1RM = unit === "lb" ? Math.round(est1RMKg * 2.20462) : est1RMKg;
            const prCheck = detectSetPersonalRecord(
              selectedExercise,
              { weightKg, reps: rawReps },
              state.recentExerciseLogs
            );

            return (
              <div
                key={idx}
                className="p-3 rounded-2xl border bg-white/[0.03] border-white/[0.07] transition-all"
              >
                <div className="grid grid-cols-[40px_1fr_1fr_auto] items-center gap-2">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.04] text-[#86868b] border border-white/10">
                    <span className="text-[12px] font-semibold tabular-nums">#{idx + 1}</span>
                  </div>

                  <div>
                    <label className="block text-[10px] text-[#86868b] mb-0.5">
                      {weightLabel}
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={s.weight}
                      placeholder={loadMode === "bodyweight" ? "0" : undefined}
                      onChange={(e) => updateSet(idx, "weight", e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white text-[15px] font-semibold tabular-nums focus:outline-none focus:border-[#10e760]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-[#86868b] mb-0.5">
                      {sets.length === 1 ? "Total reps" : "Reps"}
                    </label>
                    <input
                      type="number"
                      value={s.reps}
                      onChange={(e) => updateSet(idx, "reps", e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white text-[15px] font-semibold tabular-nums focus:outline-none focus:border-[#10e760]"
                    />
                  </div>

                  {sets.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeSet(idx)}
                      aria-label="Remove set"
                      className="w-9 h-9 mt-3.5 rounded-xl flex items-center justify-center text-[#86868b] hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="w-1" />
                  )}
                </div>

                {/* Live Estimated 1RM & PR Record Badge */}
                {display1RM > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/[0.05] flex items-center justify-between text-[11px]">
                    <div className="text-[#86868b] flex items-center gap-1.5">
                      <span>{loadMode === "assisted" ? "Est. 1RM Assist:" : "Est. 1RM:"}</span>
                      <span className="font-semibold text-white font-mono tabular-nums">
                        {display1RM} {unit}
                      </span>
                    </div>

                    {(prCheck.isWeightPr || prCheck.isOneRepMaxPr) && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/30 text-[10px] font-bold tracking-wide flex items-center gap-1">
                        <span>★ PR</span>
                        <span className="font-normal opacity-85">
                          {prCheck.isWeightPr && prCheck.isOneRepMaxPr
                            ? loadMode === "assisted"
                              ? "Least Assist & 1RM"
                              : "Weight & 1RM"
                            : prCheck.isWeightPr
                            ? loadMode === "assisted"
                              ? "Least Assist"
                              : "Max Weight"
                            : "1RM"}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Optional RIR (Reps in Reserve / Reps Left Before Failure) — skippable, missing never penalized */}
        {(() => {
          const rirOptions = [
            { val: 0, title: "0", text: "0 · Muscular failure (couldn't do another rep)" },
            { val: 1, title: "1", text: "1 · Very hard set (1 rep left)" },
            { val: 2, title: "2", text: "2 · Hard working set (2 reps left)" },
            { val: 3, title: "3", text: "3 · Moderate effort (3 reps left)" },
            { val: 4, title: "4+", text: "4+ · Light / warm-up (4+ reps left)" },
          ];
          const selectedOpt = rirOptions.find((o) => o.val === rir);
          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-[#86868b]">RIR (optional)</span>
                <div className="flex items-center gap-1">
                  {rirOptions.map((opt) => {
                    const active = rir === opt.val;
                    return (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setRir(active ? null : opt.val)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold tabular-nums transition-colors cursor-pointer border ${
                          active
                            ? "bg-[#10e760] text-black border-[#10e760]"
                            : "bg-white/[0.04] text-[#86868b] border-white/[0.08] hover:text-white"
                        }`}
                      >
                        {opt.title}
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectedOpt && (
                <p className="text-[11px] text-[#86868b] text-right leading-snug">
                  {selectedOpt.text}
                </p>
              )}
            </div>
          );
        })()}

        {/* FR-66: Optional strength minutes (stored, does not change effort) */}
        {!showMinutes ? (
          <button
            type="button"
            onClick={() => setShowMinutes(true)}
            className="text-[12px] text-[#86868b] hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            Add optional duration
          </button>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
            <Clock className="w-4 h-4 text-[#86868b]" />
            <input
              type="number"
              value={optionalMinutes}
              onChange={(e) => setOptionalMinutes(e.target.value)}
              placeholder="Minutes (optional)"
              className="flex-1 bg-transparent text-white text-[14px] tabular-nums focus:outline-none"
            />
            <span className="text-[11px] text-[#86868b]">min</span>
          </div>
        )}

        {error && <p className="text-[12px] text-amber-400">{error}</p>}

        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="w-full h-12 rounded-2xl bg-[#10e760] hover:bg-[#25d658] disabled:opacity-40 text-black font-semibold text-[15px] transition-colors cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </BottomSheet>
  );
}
