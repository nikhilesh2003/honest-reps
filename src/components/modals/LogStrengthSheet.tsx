"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Minus,
  Trash2,
  Clock,
  Calendar,
  Check,
  Search,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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
  const [rir, setRir] = useState<number | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [dateOffset, setDateOffset] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  const [pickerExpanded, setPickerExpanded] = useState(false);
  const [activeGroupFilter, setActiveGroupFilter] = useState<string>("All");
  const [exerciseSearch, setExerciseSearch] = useState("");
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
    setHasRestoredDraft(false);
    const unit = state.profile.weightUnit;

    if (editingLog) {
      const diff = daysBetweenIso(editingLog.date, state.realTodayIso);
      const maxB = state.appSettings.backfillWindowDays || 2;
      setDateOffset(diff >= 0 && diff <= maxB ? -diff : 0);
      setSelectedExercise(editingLog.exerciseName);
      setSelectedGroup(editingLog.muscleGroup);
      setActiveGroupFilter(editingLog.muscleGroup);
      setPickerExpanded(false);
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
      const hasMin = Boolean(editingLog.optionalMinutes);
      const hasRir = typeof editingLog.rir === "number";
      setOptionalMinutes(hasMin ? String(editingLog.optionalMinutes) : "");
      setRir(hasRir ? editingLog.rir! : null);
      setShowOptions(hasMin || hasRir);
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
            setShowOptions(Boolean(parsed.optionalMinutes) || parsed.rir !== null);
            setPickerExpanded(false);
            setHasRestoredDraft(true);
            return;
          }
        }
      } catch {
        // Ignore malformed draft
      }
    }

    setOptionalMinutes("");
    setRir(null);
    setShowOptions(false);

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
      // Expand exercise picker when opened via generic "Log Strength" button; collapse when preselected from Quick Log / Lineup
      setPickerExpanded(!initialExerciseName);
    } else {
      setPickerExpanded(true);
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
      setPickerExpanded(false);
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
  const weightColHeader =
    loadMode === "assisted"
      ? `Assist (${unit})`
      : loadMode === "bodyweight"
      ? `Extra (${unit})`
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

  const optionsSummaryParts: string[] = [];
  if (rir !== null) optionsSummaryParts.push(`RIR ${rir === 4 ? "4+" : rir}`);
  if (optionalMinutes) optionsSummaryParts.push(`${optionalMinutes}m`);

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
          ? 'Saved with "Added later"'
          : loadMode === "assisted"
          ? "Strength = Bodyweight − Assist"
          : loadMode === "bodyweight"
          ? "Uses bodyweight · extra weight optional"
          : undefined
      }
    >
      <div className="space-y-4">
        {/* Native iOS Segmented Date Picker */}
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

        {hasRestoredDraft && !editingLog && (
          <div className="px-3.5 py-2 rounded-xl bg-[#1c1c1e] flex items-center justify-between gap-2 text-[12px]">
            <span className="text-[#30d158] font-medium truncate">
              Resumed draft · {selectedExercise}
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

        {/* Compact Selected Exercise Header + Expandable Picker */}
        {selectedExercise && !pickerExpanded ? (
          <button
            type="button"
            onClick={() => setPickerExpanded(true)}
            className="w-full px-4 py-3 rounded-2xl bg-[#1c1c1e] hover:bg-white/[0.08] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
          >
            <div className="min-w-0">
              <div className="text-[16px] font-semibold text-white truncate">
                {selectedExercise}
              </div>
              <div className="text-[12px] text-[#86868b]">{selectedGroup}</div>
            </div>
            <span className="text-[13px] font-medium text-[#30d158] shrink-0">
              Change
            </span>
          </button>
        ) : (
          <div className="p-3.5 rounded-2xl bg-[#1c1c1e] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1">
                <button
                  type="button"
                  onClick={() => setActiveGroupFilter("All")}
                  className={`px-2.5 py-1 rounded-full text-[12px] font-medium shrink-0 transition-colors cursor-pointer ${
                    activeGroupFilter === "All"
                      ? "bg-white text-black font-semibold"
                      : "bg-white/[0.06] text-[#86868b] hover:text-white"
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
                      className={`px-2.5 py-1 rounded-full text-[12px] font-medium shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                        active
                          ? "bg-[#30d158] text-black font-semibold"
                          : isSessionTarget
                          ? "bg-[#30d158]/15 text-[#30d158]"
                          : "bg-white/[0.06] text-[#86868b] hover:text-white"
                      }`}
                    >
                      {isSessionTarget && !active && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] shrink-0" />
                      )}
                      <span>{mg.name}</span>
                    </button>
                  );
                })}
              </div>

              {selectedExercise && (
                <button
                  type="button"
                  onClick={() => setPickerExpanded(false)}
                  className="text-[12px] font-medium text-[#86868b] hover:text-white shrink-0 pl-1 cursor-pointer"
                >
                  Done
                </button>
              )}
            </div>

            {/* Search + Custom Exercise Trigger */}
            <div className="flex items-center gap-2">
              <div className="relative flex items-center flex-1">
                <Search className="w-3.5 h-3.5 text-[#86868b] absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={exerciseSearch}
                  onChange={(e) => setExerciseSearch(e.target.value)}
                  placeholder="Search exercises..."
                  className="w-full h-9 pl-8.5 pr-3 rounded-xl bg-black/50 text-white text-[13px] placeholder:text-[#636366] focus:outline-none"
                />
              </div>
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
                  setShowAddExercise((prev) => !prev);
                  setNewExError(null);
                }}
                className="h-9 px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-[12px] font-medium text-[#30d158] flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Custom
              </button>
            </div>

            {/* Inline Custom Exercise Form */}
            {showAddExercise && (
              <div className="p-3 rounded-xl bg-black/40 space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newExName}
                    onChange={(e) => {
                      setNewExName(e.target.value);
                      setNewExError(null);
                    }}
                    placeholder="Exercise name"
                    className="flex-1 h-9 px-3 rounded-lg bg-[#1c1c1e] text-white text-[13px] placeholder:text-[#636366] focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateExercise();
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <select
                      value={newExGroup}
                      onChange={(e) => setNewExGroup(e.target.value)}
                      className="h-9 px-2.5 rounded-lg bg-[#1c1c1e] text-white text-[12px] focus:outline-none"
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
                      className="h-9 px-3.5 rounded-lg bg-[#30d158] disabled:opacity-40 text-black font-semibold text-[12px] cursor-pointer shrink-0"
                    >
                      {addingEx ? "Saving..." : "Add"}
                    </button>
                  </div>
                </div>
                {newExError && (
                  <div className="text-[11px] text-amber-400">{newExError}</div>
                )}
              </div>
            )}

            {/* Exercise Pills */}
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
                      } else {
                        pickExercise(ex.name, ex.muscleGroup);
                      }
                      setPickerExpanded(false);
                    }}
                    className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
                      active
                        ? "bg-[#30d158] text-black font-semibold"
                        : "bg-white/[0.06] text-[#f5f5f7] hover:bg-white/[0.12]"
                    }`}
                  >
                    {ex.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quiet Inline Last Session & Usual Hint */}
        {lastSessionHint && (
          <div className="flex items-center justify-between gap-2 px-1 text-[12px] text-[#86868b] tabular-nums">
            <span className="truncate">
              Last {formatShortMonthDay(lastSessionHint.lastDate)}:{" "}
              <span className="text-[#d1d1d6]">{lastSessionHint.lastSetsSummary}</span>
            </span>
            <span className="shrink-0 text-[11px] text-[#30d158]">
              {lastSessionHint.targetHint}
            </span>
          </div>
        )}

        {/* Clean Tabular Sets Table */}
        <div className="space-y-2">
          <div className="grid grid-cols-[36px_1fr_1fr_28px] gap-2 px-1 text-[11px] font-medium text-[#86868b]">
            <span className="text-center">Set</span>
            <span className="text-center">{weightColHeader}</span>
            <span className="text-center">Reps</span>
            <span />
          </div>

          <div className="space-y-2">
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
              const isPr = prCheck.isWeightPr || prCheck.isOneRepMaxPr;

              return (
                <div
                  key={idx}
                  className={`px-2.5 py-2 rounded-2xl transition-all border ${
                    s.completed
                      ? "bg-[#30d158]/[0.1] border-[#30d158]/40 shadow-[0_0_20px_rgba(48,209,88,0.18)]"
                      : "bg-[#1c1c1e] border-white/[0.05]"
                  }`}
                >
                  <div className="grid grid-cols-[36px_1fr_1fr_28px] items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSetCompleted(idx)}
                      aria-label={
                        s.completed
                          ? `Unmark set ${idx + 1}`
                          : `Complete set ${idx + 1} and start rest timer`
                      }
                      title="Tap to mark complete & start Rest Timer"
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                        s.completed
                          ? "bg-[#30d158] text-black"
                          : "bg-white/[0.06] text-[#86868b] hover:text-white"
                      }`}
                    >
                      {s.completed ? (
                        <Check className="w-4 h-4 stroke-[2.6]" />
                      ) : (
                        <span className="text-[13px] font-semibold tabular-nums">
                          {idx + 1}
                        </span>
                      )}
                    </button>

                    {/* Weight Stepper */}
                    <div className="flex items-center h-9 rounded-xl bg-black/40 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => stepSetValue(idx, "weight", -weightStep)}
                        aria-label="Decrease weight"
                        className="w-7 h-full flex items-center justify-center text-[#86868b] hover:text-white cursor-pointer shrink-0"
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
                        className="w-full min-w-0 h-full bg-transparent text-center text-white text-[15px] font-semibold tabular-nums focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => stepSetValue(idx, "weight", weightStep)}
                        aria-label="Increase weight"
                        className="w-7 h-full flex items-center justify-center text-[#86868b] hover:text-[#30d158] cursor-pointer shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Reps Stepper */}
                    <div className="flex items-center h-9 rounded-xl bg-black/40 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => stepSetValue(idx, "reps", -1)}
                        aria-label="Decrease reps"
                        className="w-7 h-full flex items-center justify-center text-[#86868b] hover:text-white cursor-pointer shrink-0"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={s.reps}
                        onChange={(e) => updateSet(idx, "reps", e.target.value)}
                        className="w-full min-w-0 h-full bg-transparent text-center text-white text-[15px] font-semibold tabular-nums focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => stepSetValue(idx, "reps", 1)}
                        aria-label="Increase reps"
                        className="w-7 h-full flex items-center justify-center text-[#86868b] hover:text-[#30d158] cursor-pointer shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {sets.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeSet(idx)}
                        aria-label="Remove set"
                        className="w-7 h-9 flex items-center justify-center text-[#636366] hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>

                  {display1RM > 0 && (
                    <div className="mt-1.5 pl-11 pr-1 flex items-center justify-between text-[11px] tabular-nums">
                      <span className="text-[#86868b]">
                        1RM {display1RM} {unit}
                      </span>
                      {isPr && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/35 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.3)] text-[10px] font-semibold">
                          PR ·{" "}
                          {prCheck.isWeightPr && prCheck.isOneRepMaxPr
                            ? "Weight & 1RM"
                            : prCheck.isWeightPr
                            ? loadMode === "assisted"
                              ? "Least Assist"
                              : "Max Weight"
                            : "1RM"}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addSetRow}
            className="w-full h-9 rounded-xl bg-[#1c1c1e] hover:bg-white/[0.08] text-[13px] font-medium text-[#30d158] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Set
          </button>
        </div>

        {/* Progressive Disclosure: Optional RIR & Duration */}
        <div className="rounded-2xl bg-[#1c1c1e] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            className="w-full px-3.5 h-10 flex items-center justify-between text-[12px] text-[#86868b] hover:text-white transition-colors cursor-pointer"
          >
            <span>Options (RIR, Duration)</span>
            <span className="flex items-center gap-1.5">
              {optionsSummaryParts.length > 0 && (
                <span className="text-[#30d158] font-medium tabular-nums">
                  {optionsSummaryParts.join(" · ")}
                </span>
              )}
              {showOptions ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </span>
          </button>

          {showOptions && (
            <div className="px-3.5 pb-3 pt-2 border-t border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-[#86868b]">Reps in Reserve</span>
                <div className="flex items-center gap-1">
                  {[
                    { val: 0, title: "0" },
                    { val: 1, title: "1" },
                    { val: 2, title: "2" },
                    { val: 3, title: "3" },
                    { val: 4, title: "4+" },
                  ].map((opt) => {
                    const active = rir === opt.val;
                    return (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setRir(active ? null : opt.val)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold tabular-nums transition-colors cursor-pointer ${
                          active
                            ? "bg-[#30d158] text-black"
                            : "bg-black/40 text-[#86868b] hover:text-white"
                        }`}
                      >
                        {opt.title}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.05]">
                <span className="text-[12px] text-[#86868b] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Duration
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={optionalMinutes}
                    onChange={(e) => setOptionalMinutes(e.target.value)}
                    placeholder="Optional"
                    className="w-20 h-8 px-2.5 rounded-lg bg-black/40 text-right text-white text-[13px] tabular-nums focus:outline-none"
                  />
                  <span className="text-[12px] text-[#86868b]">min</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-[12px] text-amber-400">{error}</p>}

        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="w-full h-12 rounded-full bg-[#30d158] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-[15px] transition-opacity cursor-pointer"
        >
          {saving ? "Saving..." : "Save Workout"}
        </button>
      </div>
    </BottomSheet>
  );
}
