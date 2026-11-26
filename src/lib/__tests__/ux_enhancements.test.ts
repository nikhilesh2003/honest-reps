import assert from "node:assert/strict";
import {
  buildAlignedMonthCalendar,
  cmToFeetInches,
  convertDistanceToKm,
  convertKmToDisplayDistance,
  convertWeightBetweenUnits,
  feetInchesToCm,
  getCalibrationProgress,
  getExerciseLastSessionHint,
  getSuggestedRoutineExercises,
  validateUsernameInput,
} from "../effort";
import {
  apiDeleteLog,
  apiDeleteWeightLog,
  apiLogCardio,
  apiLogStrength,
  apiLogWeight,
  apiRestoreDeletedLogs,
  apiSendFriendNudge,
  apiSendFriendRequest,
  apiFriendAction,
  apiUpdateStrengthLog,
  apiUpdateWeightLog,
  ensureGoogleUserInLocalDb,
} from "../client-engine";
import { CardioLog, DaySummary, ExerciseLibraryItem, ExerciseLog } from "../types";

console.log("Running Honest Reps UX Enhancements Verification...");

// 1. Height & Weight & Distance unit conversions
{
  const ftIn = cmToFeetInches(178);
  assert.equal(ftIn.feet, 5);
  assert.equal(ftIn.inches, 10);

  const backToCm = feetInchesToCm(5, 10);
  assert.equal(backToCm, 177.8);

  // Handle 12 inches rollover cleanly (e.g. 5'12" -> 6'0" -> 182.9 cm)
  assert.equal(feetInchesToCm(5, 12), 182.9);

  assert.equal(convertWeightBetweenUnits(74.5, "kg", "lb"), 164.2);
  assert.equal(convertWeightBetweenUnits(164.2, "lb", "kg"), 74.5);
  assert.equal(convertWeightBetweenUnits(80, "kg", "kg"), 80);

  // Distance: lb profile uses miles in UI, kg uses km
  const kmFrom2Miles = convertDistanceToKm(2, "lb");
  assert.equal(kmFrom2Miles, 3.22);
  assert.equal(convertKmToDisplayDistance(3.22, "lb"), 2);
  assert.equal(convertDistanceToKm(2.5, "kg"), 2.5);
  assert.equal(convertKmToDisplayDistance(2.5, "kg"), 2.5);
  console.log("  [PASS] Unit conversions (cm <-> ft/in, kg <-> lb, mi <-> km) verified");
}

// 2. Live username validation
{
  const tooShort = validateUsernameInput("@ab");
  assert.equal(tooShort.cleaned, "ab");
  assert.equal(tooShort.valid, false);

  const valid = validateUsernameInput("@Alex_Lifts99!");
  assert.equal(valid.cleaned, "alex_lifts99");
  assert.equal(valid.valid, true);
  console.log("  [PASS] Live username sanitization & validation verified");
}

// 3. Calibration progress (1/2 vs 2/2) for strength and cardio
{
  const exLogs: ExerciseLog[] = [
    {
      id: "e1",
      userId: "u1",
      date: "2026-11-20",
      exerciseName: "Bench Press",
      muscleGroup: "Chest",
      sets: [{ setNumber: 1, weightKg: 80, reps: 10 }],
      source: "manual",
      addedLater: false,
      work: 800,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-20T10:00:00Z",
    },
    {
      id: "e2",
      userId: "u1",
      date: "2026-11-23",
      exerciseName: "Bench Press",
      muscleGroup: "Chest",
      sets: [{ setNumber: 1, weightKg: 82.5, reps: 10 }],
      source: "manual",
      addedLater: false,
      work: 825,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-23T10:00:00Z",
    },
  ];

  const firstProg = getCalibrationProgress(
    "Bench Press",
    "strength",
    exLogs,
    "2026-11-20",
    "2026-11-20T10:00:00Z"
  );
  assert.equal(firstProg.sessionCount, 1);
  assert.equal(firstProg.label, "Calibrating 1/2");

  const secondProg = getCalibrationProgress(
    "Bench Press",
    "strength",
    exLogs,
    "2026-11-23",
    "2026-11-23T10:00:00Z"
  );
  assert.equal(secondProg.sessionCount, 2);
  assert.equal(secondProg.label, "Calibrating 2/2");

  // Cardio splits on the same day count as 1 calibration day, not 2
  const cardioSplits: CardioLog[] = [
    {
      id: "c1",
      userId: "u1",
      date: "2026-11-24",
      activityType: "Indoor Walk",
      minutes: 15,
      kcal: 70,
      kcalIsEstimated: true,
      source: "manual",
      addedLater: false,
      isRestActivity: false,
      work: 52.5,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-24T09:00:00Z",
    },
    {
      id: "c2",
      userId: "u1",
      date: "2026-11-24",
      activityType: "Indoor Walk",
      minutes: 20,
      kcal: 90,
      kcalIsEstimated: true,
      source: "manual",
      addedLater: false,
      isRestActivity: false,
      work: 70,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-24T18:00:00Z",
    },
  ];
  const cardioProg = getCalibrationProgress("Indoor Walk", "cardio", cardioSplits, "2026-11-24");
  assert.equal(cardioProg.sessionCount, 1);
  assert.equal(cardioProg.label, "Calibrating 1/2");
  console.log("  [PASS] Calibration progress (1/2 & 2/2, including cardio split consolidation) verified");
}

// 4. Last session hint & Beat Usual (50) target
{
  const history: ExerciseLog[] = [
    {
      id: "e3",
      userId: "u1",
      date: "2026-11-24",
      exerciseName: "Bench Press",
      muscleGroup: "Chest",
      sets: [
        { setNumber: 1, weightKg: 80, reps: 10 },
        { setNumber: 2, weightKg: 80, reps: 8 },
      ],
      source: "manual",
      addedLater: false,
      work: 1440,
      usualUsed: 1380,
      effortScore: 51,
      status: "Scored",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-24T10:00:00Z",
    },
    {
      id: "e2",
      userId: "u1",
      date: "2026-11-20",
      exerciseName: "Bench Press",
      muscleGroup: "Chest",
      sets: [{ setNumber: 1, weightKg: 80, reps: 17 }],
      source: "manual",
      addedLater: false,
      work: 1360,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-20T10:00:00Z",
    },
    {
      id: "e1",
      userId: "u1",
      date: "2026-11-17",
      exerciseName: "Bench Press",
      muscleGroup: "Chest",
      sets: [{ setNumber: 1, weightKg: 80, reps: 17 }],
      source: "manual",
      addedLater: false,
      work: 1360,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-17T10:00:00Z",
    },
  ];

  const hint = getExerciseLastSessionHint("Bench Press", history, "kg");
  assert.ok(hint);
  assert.equal(hint.lastDate, "2026-11-24");
  assert.equal(hint.lastEffortScore, 51);
  assert.ok(hint.lastSetsSummary.includes("80 kg × 10"));
  // Usual for 4th session = average of prior 3 works: (1440 + 1360 + 1360)/3 = 1387
  assert.equal(Math.round(hint.usualWorkTarget!), 1387);
  console.log("  [PASS] Last session summary & Beat Usual (50) target verified");
}

// 5. Repeat Last Session suggested routine
{
  const lib: ExerciseLibraryItem[] = [
    { id: "1", name: "Bench Press", muscleGroup: "Chest", enabled: true, displayOrder: 1, ownerId: null },
    { id: "2", name: "Incline DB Press", muscleGroup: "Chest", enabled: true, displayOrder: 2, ownerId: null },
    { id: "3", name: "Tricep Pushdown", muscleGroup: "Arms", enabled: true, displayOrder: 3, ownerId: null },
  ];
  const history: ExerciseLog[] = [
    {
      id: "l1",
      userId: "u1",
      date: "2026-11-22",
      exerciseName: "Bench Press",
      muscleGroup: "Chest",
      sets: [{ setNumber: 1, weightKg: 80, reps: 10 }],
      source: "manual",
      addedLater: false,
      work: 800,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-22T10:00:00Z",
    },
    {
      id: "l2",
      userId: "u1",
      date: "2026-11-22",
      exerciseName: "Tricep Pushdown",
      muscleGroup: "Arms",
      sets: [{ setNumber: 1, weightKg: 25, reps: 12 }],
      source: "manual",
      addedLater: false,
      work: 300,
      usualUsed: null,
      effortScore: null,
      status: "Calibrating",
      scoringSettingsVersion: 1,
      createdAt: "2026-11-22T10:15:00Z",
    },
  ];
  const lineup = getSuggestedRoutineExercises(["Chest", "Arms"], history, lib, "2026-11-26");
  assert.deepEqual(lineup, ["Bench Press", "Tricep Pushdown"]);
  console.log("  [PASS] Repeat Last Session routine lineup verified");
}

// 6. Aligned Month Calendar (Nov 1, 2026 is a Sunday -> 6 leading null cells in Mon..Sun grid!)
{
  const days: DaySummary[] = [];
  for (let m = 10; m <= 11; m++) {
    const maxD = m === 10 ? 31 : 30;
    for (let d = 1; d <= maxD; d++) {
      const iso = `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        date: iso,
        dayLetter: "M",
        shortLabel: iso,
        sessionGroups: [],
        isRest: false,
        status: "No log",
        effortScore: null,
        band: "No log",
        itemCount: 0,
        loggedItems: [],
      });
    }
  }

  const cal = buildAlignedMonthCalendar(days, "2026-11");
  assert.equal(cal.monthLabel, "November 2026");
  assert.equal(cal.prevMonthPrefix, "2026-10");
  assert.equal(cal.nextMonthPrefix, null);
  // Nov 1, 2026 is Sunday => Mon(0)..Sat(5) are null, index 6 is 2026-11-01!
  for (let i = 0; i < 6; i++) {
    assert.equal(cal.cells[i], null);
  }
  assert.equal(cal.cells[6]?.date, "2026-11-01");
  console.log("  [PASS] Aligned Month Calendar weekday offset & month navigation verified");
}

// 7. Client-Engine UX Actions: Undo Delete, Strength Rename + RestSeconds Update, Weight Edit/Delete, Friend Nudge
async function runClientEngineTests() {
  const storage = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  };
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: mockStorage },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: mockStorage,
    configurable: true,
    writable: true,
  });

  const u2 = ensureGoogleUserInLocalDb("buddy@test.com", "Buddy Lifter", "uid_buddy");
  const u1 = ensureGoogleUserInLocalDb("me@test.com", "Main Lifter", "uid_me");
  const db0 = JSON.parse(storage.get("honest_reps_prod_v1")!);
  db0.profiles.find((p: { userId: string }) => p.userId === u2.userId).username = "buddy";
  db0.profiles.find((p: { userId: string }) => p.userId === u1.userId).username = "mainlifter";
  storage.set("honest_reps_prod_v1", JSON.stringify(db0));

  // Log strength with restSeconds and update exerciseName + restSeconds
  const logged = await apiLogStrength({
    exerciseName: "Bench Press",
    muscleGroup: "Chest",
    sets: [
      { weight: 80, reps: 10, restSeconds: 90 },
      { weight: 80, reps: 8, restSeconds: 120 },
    ],
  });
  assert.equal(logged.ok, true);
  assert.ok(logged.entry);
  assert.equal(logged.entry.sets[0].restSeconds, 90);

  const updated = await apiUpdateStrengthLog(logged.entry.id, {
    exerciseName: "Incline DB Press",
    muscleGroup: "Chest",
    sets: [
      { weight: 32, reps: 10, restSeconds: 75 },
      { weight: 32, reps: 9, restSeconds: 90 },
    ],
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.entry?.exerciseName, "Incline DB Press");
  assert.equal(updated.entry?.sets[0].restSeconds, 75);

  // Delete & Restore (Undo)
  const delRes = await apiDeleteLog("strength", logged.entry.id);
  assert.equal(delRes.ok, true);
  assert.ok(delRes.deletedStrength);
  const afterDel = JSON.parse(storage.get("honest_reps_prod_v1")!);
  assert.equal(afterDel.exerciseLogs.length, 0);

  const restoreRes = await apiRestoreDeletedLogs({
    strengthLogs: [delRes.deletedStrength],
  });
  assert.equal(restoreRes.ok, true);
  const afterRestore = JSON.parse(storage.get("honest_reps_prod_v1")!);
  assert.equal(afterRestore.exerciseLogs.length, 1);
  assert.equal(afterRestore.exerciseLogs[0].exerciseName, "Incline DB Press");

  // Also verify Cardio Undo
  const cLog = await apiLogCardio({ activityType: "Indoor Walk", minutes: 20 });
  assert.equal(cLog.ok, true);
  const cDel = await apiDeleteLog("cardio", cLog.entry!.id);
  assert.ok(cDel.deletedCardio);
  await apiRestoreDeletedLogs({ cardioLogs: [cDel.deletedCardio] });
  const afterCardioRestore = JSON.parse(storage.get("honest_reps_prod_v1")!);
  assert.equal(afterCardioRestore.cardioLogs.length, 1);

  // Weight Log Edit & Delete
  await apiLogWeight(75.5);
  const dbWithW = JSON.parse(storage.get("honest_reps_prod_v1")!);
  assert.equal(dbWithW.weightLogs.length, 1);
  const wId = dbWithW.weightLogs[0].id;

  const wUpd = await apiUpdateWeightLog(wId, 74.2);
  assert.equal(wUpd.ok, true);
  assert.equal(JSON.parse(storage.get("honest_reps_prod_v1")!).weightLogs[0].weightKg, 74.2);

  const wDel = await apiDeleteWeightLog(wId);
  assert.equal(wDel.ok, true);
  assert.equal(JSON.parse(storage.get("honest_reps_prod_v1")!).weightLogs.length, 0);

  // Friend request + accept + nudge with cooldown
  const reqRes = await apiSendFriendRequest("buddy");
  assert.equal(reqRes.ok, true);
  const dbReq = JSON.parse(storage.get("honest_reps_prod_v1")!);
  const frId = dbReq.friendships[0].id;
  await apiFriendAction(frId, "accept");

  const nudge1 = await apiSendFriendNudge(u2.userId, "buddy", "fistbump");
  assert.equal(nudge1.ok, true);
  const nudgeSpam = await apiSendFriendNudge(u2.userId, "buddy", "fistbump");
  assert.equal(nudgeSpam.ok, false); // Cooldown prevents spam!

  console.log("  [PASS] Undo Delete, Strength Rename/RestSeconds, Weight Edit/Delete, and Friend Nudge verified");
  console.log("All Honest Reps UX Enhancement tests passed.");
}

runClientEngineTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
