"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Minus, Trash2, Clock, Calendar, Check, Search, RotateCcw } from "lucide-react";
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
  getExerciseLastSessionHint,
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
  defaultRestSeconds?: number;
  onTriggerRestTimer?: (label?: string, seconds?: number) => void;
  onSaved: (message: string) => void;
  onExerciseAdded?: (exerciseName: string) => void;
}

interface DraftSetRow {
  weight: string;
  reps: string;
  completed?: boolean;
  restSeconds?: number;
}

interface SavedStrengthDraft {
  date: string;
  exerciseName: string;
  muscleGroup: string;
  sets: DraftSetRow[];
  rir: number | null;
  optionalMinutes: string;
}

function getDraftKey(userId: string) {
  return `hr_strength_draft_v1_${userId}`;
}

export function LogStrengthSheet({
  open,
  onClose,
  state,
  initialBackfill = false,
  initialExerciseName,
  editingLog = null,
  defaultRestSeconds = 90,
  onTriggerRestTimer,
  onSaved,
  onExerciseAdded,
}: LogStrengthSheetProps) {
  const [selectedExercise, setSelectedExercise] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("Chest");
  const [sets, setSets] = useState<DraftSetRow[]>([{ weight: "80", reps: "10" }]);
  const [optionalMinutes, setOptionalMinutes] = useState("");
  const [showMinutes, setShowMinutes] = useState(false);
  const [rir, setRir] = useState<number | null>(null);
  const [dateOffset, setDateOffset] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  const [activeGroupFilter, setActiveGroupFilter] = useState<string>("All");
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [changingEditExercise, setChangingEditExercise] = useState(false);
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
    if (
      state.todaySession &&
      !state.todaySession.isRest &&
      state.todaySession.muscleGroups.length > 0
    ) {
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
    const q = exerciseSearch.trim().toLowerCase();
    let base = allExercises;
    if (q) {
      base = base.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.muscleGroup.toLowerCase().includes(q)
      );
    } else if (activeGroupFilter !== "All") {
      base = base.filter(
        (e) => e.muscleGroup.toLowerCase() === activeGroupFilter.toLowerCase()
      );
    } else if (sessionGroups.length > 0 && dateOffset === 0) {
      const inSession = base.filter((e) => sessionGroups.includes(e.muscleGroup));
      const others = base.filter((e) => !sessionGroups.includes(e.muscleGroup));
      return [...inSession, ...others];
    }
    return base;
  }, [allExercises, activeGroupFilter, sessionGroups, dateOffset, exerciseSearch]);

  const wasOpenRef = useRef(false);

  const pickExercise = (name: string, group: string) => {
    setSelectedExercise(name);
    setSelectedGroup(group);
    setHasRestoredDraft(false);
    const mode = getExerciseLoadMode(name);
    const lastLog = state.recentExerciseLogs.find(
      (l) => l.exerciseName.toLowerCase() === name.toLowerCase()
    );
    const unit = state.profile.weightUnit;
    if (lastLog && lastLog.sets.length > 0) {
      setSets(
        lastLog.sets.map((s) => {
          const displayW =
            unit === "lb" ? Number((s.weightKg * 2.20462).toFixed(1)) : s.weightKg;
          return {
            weight: mode === "bodyweight" && displayW === 0 ? "" : String(displayW),
            reps: String(s.reps),
            completed: false,
          };
        })
      );
    } else if (mode === "bodyweight") {
      setSets([{ weight: "", reps: "15", completed: false }]);
    } else if (mode === "assisted") {
      setSets([{ weight: "20", reps: "10", completed: false }]);
    } else {
      setSets([{ weight: "40", reps: "10", completed: false }]);
    }
  };

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open || wasOpen) return;
    setError(null);
    setShowAddExercise(false);
    setNewExName("");
    setNewExError(null);
    setExerciseSearch("");
    setChangingEditExercise(false);
    setHasRestoredDraft(false);
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
          completed: true,
          restSeconds: s.restSeconds,
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

    // Restore in-progress today draft if matching (or no explicit preselect)
    if (!isBFill && typeof window !== "undefined") {
      try {
        const rawDraft = window.localStorage.getItem(getDraftKey(state.profile.userId));
        if (rawDraft) {
          const parsed = JSON.parse(rawDraft) as SavedStrengthDraft;
          const matchesPreselect =
            !initialExerciseName ||
            parsed.exerciseName.toLowerCase() === initialExerciseName.toLowerCase();
          if (
            parsed.date === state.realTodayIso &&
            parsed.exerciseName &&
            Array.isArray(parsed.sets) &&
            parsed.sets.length > 0 &&
            matchesPreselect
          ) {
            setSelectedExercise(parsed.exerciseName);
            setSelectedGroup(parsed.muscleGroup || "Chest");
            setActiveGroupFilter(parsed.muscleGroup || "All");
            setSets(parsed.sets);
            setRir(parsed.rir ?? null);
            setOptionalMinutes(parsed.optionalMinutes || "");
            setShowMinutes(Boolean(parsed.optionalMinutes));
            setHasRestoredDraft(true);
            return;
          }
        }
      } catch {
        // Ignore malformed draft
      }
    }

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
    setNewExGroup(
      defaultFilter !== "All"
        ? defaultFilter
        : strengthMuscleGroups[0]?.name || "Chest"
    );

    if (defaultEx) {
      pickExercise(defaultEx.name, defaultEx.muscleGroup);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBackfill, initialExerciseName, editingLog]);

  // Auto-save today's draft whenever sets/checkoffs are modified
  useEffect(() => {
    if (!open || editingLog || dateOffset !== 0 || !selectedExercise) return;
    const anyCompleted = sets.some((s) => s.completed);
    if (!anyCompleted && sets.length <= 1 && !optionalMinutes && rir === null) return;
    try {
      const payload: SavedStrengthDraft = {
        date: state.realTodayIso,
        exerciseName: selectedExercise,
        muscleGroup: selectedGroup,
        sets,
        rir,
        optionalMinutes,
      };
      window.localStorage.setItem(
        getDraftKey(state.profile.userId),
        JSON.stringify(payload)
      );
    } catch {
      // Ignore quota errors
    }
  }, [
    open,
    editingLog,
    dateOffset,
    selectedExercise,
    selectedGroup,
    sets,
    rir,
    optionalMinutes,
    state.realTodayIso,
    state.profile.userId,
  ]);

  const clearSavedDraft = () => {
    try {
      window.localStorage.removeItem(getDraftKey(state.profile.userId));
    } catch {}
    setHasRestoredDraft(false);
    if (selectedExercise) {
      pickExercise(selectedExercise, selectedGroup);
    }
  };

  const addSetRow = () => {
    triggerHaptic("selection");
    const last = sets[sets.length - 1] || { weight: "40", reps: "10" };
    setSets((prev) => [
      ...prev,
      { weight: last.weight, reps: last.reps, completed: false },
    ]);
  };

  const updateSet = (idx: number, field: "weight" | "reps", val: string) => {
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s)));
  };

  const stepSetValue = (idx: number, field: "weight" | "reps", delta: number) => {
    triggerHaptic("selection");
    setSets((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const curr = Number(s[field]) || 0;
        const next =
          field === "reps"
            ? Math.max(1, Math.round(curr + delta))
            : Math.max(0, Number((curr + delta).toFixed(1)));
        return { ...s, [field]: String(next) };
      })
    );
  };

  const toggleSetCompleted = (idx: number) => {
    setSets((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const nextDone = !s.completed;
        if (nextDone) {
          triggerHaptic("medium");
          onTriggerRestTimer?.(
            `${selectedExercise || "Strength"} · Set ${idx + 1}`,
            defaultRestSeconds
          );
        } else {
          triggerHaptic("light");
        }
        return {
          ...s,
          completed: nextDone,
          restSeconds: nextDone ? s.restSeconds ?? defaultRestSeconds : undefined,
        };
      })
    );
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
      const newExItem: ExerciseLibraryItem =
        (res as { exercise?: ExerciseLibraryItem }).exercise || {
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
        ...(s.restSeconds && s.restSeconds > 0 ? { restSeconds: s.restSeconds } : {}),
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
      try {
        window.localStorage.removeItem(getDraftKey(state.profile.userId));
      } catch {}
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
  const weightStep = unit === "lb" ? 5 : 2.5;
  const loadMode = getExerciseLoadMode(selectedExercise);
  const weightLabel =
    loadMode === "assisted"
      ? `Assisted (${unit})`
      : loadMode === "bodyweight"
      ? `Extra (${unit}, opt.)`
      : `Weight (${unit})`;

  const lastSessionHint = useMemo(
    () =>
      getExerciseLastSessionHint(
        selectedExercise,
        editingLog
          ? state.recentExerciseLogs.filter((l) => l.id !== editingLog.id)
          : state.recentExerciseLogs,
        unit
      ),
    [selectedExercise, state.recentExerciseLogs, editingLog, unit]
  );

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

  const showExercisePicker = !editingLog || changingEditExercise;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        editingLog
          ? "Edit Strength"
          : dateOffset < 0
          ? "Backfill Strength"
          : "Log Strength"
      }
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
          : "Tap ✓ on sets to start rest timer"
      }
    >
      <div className="space-y-4">
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

        {hasRestoredDraft && !editingLog && (
          <div className="px-3 py-2 rounded-xl bg-[#10e760]/10 border border-[#10e760]/30 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-[#10e760] font-medium">
              Resumed unsaved workout draft for {selectedExercise}
            </span>
            <button
              type="button"
              onClick={clearSavedDraft}
              className="inline-flex items-center gap-1 text-[#86868b] hover:text-white font-medium cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        )}

        {/* Muscle Group Pills & Exercise Picker */}
        {!showExercisePicker ? (
          <div className="px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2">
            <div>
              <div className="text-[14px] font-semibold text-white">{selectedExercise}</div>
              <div className="text-[11px] text-[#86868b]">{selectedGroup}</div>
            </div>
            <button
              type="button"
              onClick={() => setChangingEditExercise(true)}
              className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-medium text-[#10e760] cursor-pointer"
            >
              Change
            </button>
          </div>
        ) : (
          <>
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
                  const active =
                    activeGroupFilter.toLowerCase() === mg.name.toLowerCase();
                  const isSessionTarget =
                    dateOffset === 0 &&
                    sessionGroups.some(
                      (sg) => sg.toLowerCase() === mg.name.toLowerCase()
                    );
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

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
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

              {/* Instant Exercise Search */}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-[#86868b] absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={exerciseSearch}
                  onChange={(e) => setExerciseSearch(e.target.value)}
                  placeholder="Filter exercises..."
                  className="w-full h-9 pl-8.5 pr-3 rounded-xl bg-black border border-white/10 text-white text-[13px] placeholder:text-[#525257] focus:outline-none focus:border-[#10e760]"
                />
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

                  {newExError && (
                    <div className="text-[11px] text-amber-400">{newExError}</div>
                  )}
                </div>
              )}

              {/* Exercise Pills Wrap */}
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto no-scrollbar">
                {filteredExercises.map((ex) => {
                  const active =
                    selectedExercise.toLowerCase() === ex.name.toLowerCase();
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => {
                        if (editingLog) {
                          setSelectedExercise(ex.name);
                          setSelectedGroup(ex.muscleGroup);
                          setChangingEditExercise(false);
                        } else {
                          pickExercise(ex.name, ex.muscleGroup);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer border ${
                        active
                          ? "bg-[#10e760] text-black border-[#10e760] font-semibold"
                          : "bg-white/[0.04] text-[#f5f5f7] border-white/[0.08] hover:border-white/25"
                      }`}
                    >
                      {ex.name}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    setNewExGroup(
                      activeGroupFilter !== "All"
                        ? activeGroupFilter
                        : strengthMuscleGroups[0]?.name || "Chest"
                    );
                    if (exerciseSearch.trim() && filteredExercises.length === 0) {
                      setNewExName(exerciseSearch.trim());
                    }
                    setShowAddExercise(true);
                    setNewExError(null);
                  }}
                  className="px-3 py-1.5 rounded-full text-[13px] font-medium text-[#10e760] bg-[#10e760]/10 border border-dashed border-[#10e760]/40 hover:bg-[#10e760]/20 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add new</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Last Session & Beat Usual (50) Reference Strip */}
        {lastSessionHint && (
          <div className="px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between gap-2 text-[11px]">
            <div className="min-w-0">
              <div className="text-[#86868b]">
                Last ({formatShortMonthDay(lastSessionHint.lastDate)})
                {lastSessionHint.lastEffortScore !== null && (
                  <span className="text-[#10e760] font-semibold ml-1.5 tabular-nums">
                    Effort {lastSessionHint.lastEffortScore}
                  </span>
                )}
              </div>
              <div className="text-white font-medium tabular-nums truncate mt-0.5">
                {lastSessionHint.lastSetsSummary}
              </div>
            </div>
            <div className="text-right shrink-0 text-[10px] px-2 py-1 rounded-lg bg-black/50 border border-white/[0.06] text-[#a1a1a6] tabular-nums">
              {lastSessionHint.targetHint}
            </div>
          </div>
        )}

        {/* Set Rows with Check-Off (✓) & Tactile +/- Steppers */}
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
            const display1RM =
              unit === "lb" ? Math.round(est1RMKg * 2.20462) : est1RMKg;
            const prCheck = detectSetPersonalRecord(
              selectedExercise,
              { weightKg, reps: rawReps },
              editingLog
                ? state.recentExerciseLogs.filter((l) => l.id !== editingLog.id)
                : state.recentExerciseLogs
            );

            return (
              <div
                key={idx}
                className={`p-3 rounded-2xl border transition-all ${
                  s.completed
                    ? "bg-[#10e760]/[0.06] border-[#10e760]/40"
                    : "bg-white/[0.03] border-white/[0.07]"
                }`}
              >
                <div className="grid grid-cols-[38px_1fr_1fr_auto] items-end gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSetCompleted(idx)}
                    aria-label={
                      s.completed
                        ? `Unmark set ${idx + 1}`
                        : `Complete set ${idx + 1} and start rest timer`
                    }
                    title="Tap to mark set complete & start Rest Timer"
                    className={`w-9 h-10 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                      s.completed
                        ? "bg-[#10e760] text-black border-[#10e760] shadow-[0_0_12px_rgba(16,231,96,0.35)]"
                        : "bg-white/[0.04] text-[#86868b] border-white/10 hover:border-[#10e760]/50 hover:text-white"
                    }`}
                  >
                    {s.completed ? (
                      <Check className="w-4 h-4 stroke-[2.6]" />
                    ) : (
                      <span className="text-[12px] font-semibold tabular-nums">
                        #{idx + 1}
                      </span>
                    )}
                  </button>

                  <div>
                    <label className="block text-[10px] text-[#86868b] mb-0.5 truncate">
                      {weightLabel}
                    </label>
                    <div className="flex items-center h-10 rounded-xl bg-black border border-white/12 focus-within:border-[#10e760] overflow-hidden">
                      <button
                        type="button"
                        onClick={() => stepSetValue(idx, "weight", -weightStep)}
                        aria-label="Decrease weight"
                        className="w-7 h-full flex items-center justify-center text-[#86868b] hover:text-white hover:bg-white/[0.06] cursor-pointer shrink-0"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={s.weight}
                        placeholder={loadMode === "bodyweight" ? "0" : undefined}
                        onChange={(e) => updateSet(idx, "weight", e.target.value)}
                        className="w-full min-w-0 h-full px-1 bg-transparent text-center text-white text-[15px] font-semibold tabular-nums focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => stepSetValue(idx, "weight", weightStep)}
                        aria-label="Increase weight"
                        className="w-7 h-full flex items-center justify-center text-[#86868b] hover:text-[#10e760] hover:bg-white/[0.06] cursor-pointer shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-[#86868b] mb-0.5 truncate">
                      {sets.length === 1 ? "Total reps" : "Reps"}
                    </label>
                    <div className="flex items-center h-10 rounded-xl bg-black border border-white/12 focus-within:border-[#10e760] overflow-hidden">
                      <button
                        type="button"
                        onClick={() => stepSetValue(idx, "reps", -1)}
                        aria-label="Decrease reps"
                        className="w-7 h-full flex items-center justify-center text-[#86868b] hover:text-white hover:bg-white/[0.06] cursor-pointer shrink-0"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={s.reps}
                        onChange={(e) => updateSet(idx, "reps", e.target.value)}
                        className="w-full min-w-0 h-full px-1 bg-transparent text-center text-white text-[15px] font-semibold tabular-nums focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => stepSetValue(idx, "reps", 1)}
                        aria-label="Increase reps"
                        className="w-7 h-full flex items-center justify-center text-[#86868b] hover:text-[#10e760] hover:bg-white/[0.06] cursor-pointer shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {sets.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeSet(idx)}
                      aria-label="Remove set"
                      className="w-8 h-10 rounded-xl flex items-center justify-center text-[#86868b] hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="w-0.5" />
                  )}
                </div>

                {/* Live Estimated 1RM & PR Record Badge */}
                {display1RM > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/[0.05] flex items-center justify-between text-[11px]">
                    <div className="text-[#86868b] flex items-center gap-1.5">
                      <span>
                        {loadMode === "assisted" ? "Est. 1RM Assist:" : "Est. 1RM:"}
                      </span>
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

        {/* Optional RIR */}
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

        {/* Optional strength minutes */}
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
              inputMode="numeric"
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
