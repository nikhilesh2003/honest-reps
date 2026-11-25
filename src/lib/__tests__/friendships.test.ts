import assert from "node:assert/strict";
import {
  apiClearSession,
  apiFriendAction,
  apiGetFriendDetail,
  apiGetState,
  apiLibraryAction,
  apiRemoveFriend,
  apiSaveSession,
  apiSendFriendRequest,
  apiSetInGym,
  apiUpdateProfile,
  ensureGoogleUserInLocalDb,
} from "../client-engine";

console.log("Running Honest Reps Friendship Data & Privacy Verification...");

function setupBrowserStorage() {
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
  return storage;
}

function seedTwoUsersAndLogs(storage: Map<string, string>) {
  storage.clear();
  const u1 = ensureGoogleUserInLocalDb("nikhil@test.com", "Nikhil Reddy", "uid_nikhil");
  const u2 = ensureGoogleUserInLocalDb("hari@test.com", "Hari Krishna", "uid_hari");
  const u3 = ensureGoogleUserInLocalDb("suspended@test.com", "Suspended User", "uid_susp");

  const raw = JSON.parse(storage.get("honest_reps_prod_v1")!);
  const p1 = raw.profiles.find((p: { userId: string }) => p.userId === u1.userId);
  const p2 = raw.profiles.find((p: { userId: string }) => p.userId === u2.userId);
  const p3 = raw.profiles.find((p: { userId: string }) => p.userId === u3.userId);

  p1.username = "nikhil22";
  p1.onboardingComplete = true;
  p1.shareWorkoutDetails = true;

  p2.username = "hari";
  p2.onboardingComplete = true;
  p2.shareWorkoutDetails = false; // Private details!

  p3.username = "susp_user";
  p3.onboardingComplete = true;
  p3.suspended = true;

  // Give Hari a workout log on today's date
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;

  raw.sessions.push({
    id: "ses_hari_today",
    userId: p2.userId,
    date: todayIso,
    muscleGroups: ["Chest"],
    isRest: false,
    createdAt: new Date().toISOString(),
  });
  raw.exerciseLogs.push({
    id: "ex_hari_today",
    userId: p2.userId,
    date: todayIso,
    exerciseName: "Bench Press",
    muscleGroup: "Chest",
    sets: [{ setNumber: 1, weightKg: 80, reps: 8 }],
    source: "manual",
    addedLater: false,
    work: 640,
    usualUsed: null,
    effortScore: null,
    status: "Calibrating",
    scoringSettingsVersion: 1,
    createdAt: new Date().toISOString(),
  });

  // Switch active user to Nikhil
  raw.currentUserId = p1.userId;
  storage.set("honest_reps_prod_v1", JSON.stringify(raw));

  return { u1: p1, u2: p2, u3: p3, todayIso };
}

async function runTests() {
  const storage = setupBrowserStorage();
  const { u1, u2 } = seedTwoUsersAndLogs(storage);

  // Helper to switch current user in local db
  const setCurrentUser = (userId: string) => {
    const raw = JSON.parse(storage.get("honest_reps_prod_v1")!);
    raw.currentUserId = userId;
    storage.set("honest_reps_prod_v1", JSON.stringify(raw));
  };

  // 1. Validation checks: empty, self, unknown, suspended
  {
    const emptyRes = await apiSendFriendRequest("   ");
    assert.equal(emptyRes.ok, false);

    const selfRes = await apiSendFriendRequest("@nikhil22");
    assert.equal(selfRes.ok, false);
    assert.match(selfRes.error || "", /yourself/i);

    const unknownRes = await apiSendFriendRequest("@nonexistent_member");
    assert.equal(unknownRes.ok, false);
    assert.match(unknownRes.error || "", /No member found/i);

    const suspRes = await apiSendFriendRequest("@susp_user");
    assert.equal(suspRes.ok, false);
    console.log("  [PASS] Friendship validation (empty, self, unknown, suspended) verified");
  }

  // 2. Send request via full invite URL & check outgoing/incoming
  {
    const sendRes = await apiSendFriendRequest("https://honestreps.ifleon.com/invite/?u=Hari");
    assert.equal(sendRes.ok, true);
    assert.equal(sendRes.targetUsername, "hari");

    // Duplicate pending request must be blocked
    const dupRes = await apiSendFriendRequest("@hari");
    assert.equal(dupRes.ok, false);
    assert.match(dupRes.error || "", /pending/i);

    // Inspect local state for outgoing (nikhil22) and incoming (hari)
    const raw = JSON.parse(storage.get("honest_reps_prod_v1")!);
    assert.equal(raw.friendships.length, 1);
    const friendshipId = raw.friendships[0].id;
    assert.equal(raw.friendships[0].status, "pending");

    // Decline flow test first
    setCurrentUser(u2.userId);
    const decRes = await apiFriendAction(friendshipId, "decline");
    assert.equal(decRes.ok, true);
    const afterDecline = JSON.parse(storage.get("honest_reps_prod_v1")!);
    assert.equal(afterDecline.friendships.length, 0);
    console.log("  [PASS] Invite URL parsing, duplicate guard, and decline flow verified");
  }

  // 3. Re-send and Accept flow + Live In-Gym status + Privacy enforcement
  {
    setCurrentUser(u1.userId);
    const send2 = await apiSendFriendRequest("/invite/@hari");
    assert.equal(send2.ok, true);

    const raw = JSON.parse(storage.get("honest_reps_prod_v1")!);
    const friendshipId = raw.friendships[0].id;

    // Hari turns In the Gym ON and accepts Nikhil's request
    setCurrentUser(u2.userId);
    await apiSetInGym(true);
    const accRes = await apiFriendAction(friendshipId, "accept");
    assert.equal(accRes.ok, true);

    // Already friends check
    const alreadyRes = await apiSendFriendRequest("@nikhil22");
    assert.equal(alreadyRes.ok, false);
    assert.match(alreadyRes.error || "", /Already friends/i);

    // Switch back to Nikhil and fetch friend detail for Hari (shareWorkoutDetails = false)
    setCurrentUser(u1.userId);
    const detailPrivate = await apiGetFriendDetail(u2.userId);
    assert.ok(detailPrivate, "Expected friend detail payload");
    assert.equal(detailPrivate.friend.inGym, true, "Accepted friend should see live In the Gym status");
    assert.equal(detailPrivate.friend.shareWorkoutDetails, false);
    const todayPrivate = detailPrivate.monthDaily[detailPrivate.monthDaily.length - 1];
    assert.equal(todayPrivate.loggedItems.length, 0, "Private friend must hide loggedItems");
    assert.equal(
      todayPrivate.effortBreakdown,
      undefined,
      "Private friend must hide detailed effortBreakdown"
    );
    assert.ok(
      !("email" in detailPrivate.friend),
      "Friend detail must never expose private email"
    );
    assert.ok(detailPrivate.milestones, "Friend detail should include milestones");
    assert.equal(detailPrivate.milestones?.platesTotal, 0, "Private friend must hide weight plate details");

    // Now Hari enables shareWorkoutDetails = true
    setCurrentUser(u2.userId);
    await apiUpdateProfile({ shareWorkoutDetails: true });

    setCurrentUser(u1.userId);
    const detailShared = await apiGetFriendDetail(u2.userId);
    assert.ok(detailShared);
    assert.equal(detailShared.friend.shareWorkoutDetails, true);
    const todayShared = detailShared.monthDaily[detailShared.monthDaily.length - 1];
    assert.equal(todayShared.loggedItems.length, 1, "Sharing friend should expose loggedItems");
    assert.equal(todayShared.loggedItems[0].title, "Bench Press");
    assert.equal(detailShared.milestones?.platesTotal, 8, "Sharing friend exposes the 8 plates (25-200 kg)");
    assert.equal(detailShared.milestones?.platesUnlocked, 3, "80kg Bench Press unlocks 25, 50, 75 kg plates");
    assert.ok(
      (detailShared.milestones?.earnedThisMonth.length ?? 0) >= 3,
      "Received This Month includes plates earned this month"
    );
    console.log("  [PASS] Accept flow, live In-the-Gym status, and shareWorkoutDetails privacy verified");
  }

  // 4. Resilience: unhydrated friendship profile must not crash apiGetState
  {
    const raw = JSON.parse(storage.get("honest_reps_prod_v1")!);
    raw.friendships.push({
      id: "fr_missing_profile",
      userId: u1.userId,
      friendId: "uid_does_not_exist_locally",
      status: "accepted",
      createdAt: new Date().toISOString(),
    });
    storage.set("honest_reps_prod_v1", JSON.stringify(raw));

    // Manually check leaderboard building via local state hydration by resetting verifiedSessionUserId?
    // Even in local state, profiles filter ensures missing profile never throws.
    const state = await apiGetState(0);
    // Note: in non-supabase env, apiGetState returns authenticated:false unless supabase env exists,
    // so verify raw friendship data remains valid and apiGetFriendDetail handles unknown id safely:
    assert.ok(state !== null);
    const missingDetail = await apiGetFriendDetail("uid_does_not_exist_locally");
    assert.equal(missingDetail, null);
    console.log("  [PASS] Missing friend profile resilience verified");
  }

  // 5. Today's Session save & clear (remove mistaken muscles)
  {
    setCurrentUser(u1.userId);
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(today.getDate()).padStart(2, "0")}`;

    const saved = await apiSaveSession({
      date: todayIso,
      isRest: false,
      muscleGroups: ["Arms", "Cardio"],
    });
    assert.equal(saved.ok, true);
    let raw = JSON.parse(storage.get("honest_reps_prod_v1")!);
    assert.equal(
      raw.sessions.filter(
        (s: { userId: string; date: string }) => s.userId === u1.userId && s.date === todayIso
      ).length,
      1
    );

    const cleared = await apiClearSession(todayIso);
    assert.equal(cleared.ok, true);
    raw = JSON.parse(storage.get("honest_reps_prod_v1")!);
    assert.equal(
      raw.sessions.filter(
        (s: { userId: string; date: string }) => s.userId === u1.userId && s.date === todayIso
      ).length,
      0
    );
    console.log("  [PASS] Today's Session save & clear (remove mistaken muscles) verified");
  }

  // 6. Remove an accepted friend cleanly
  {
    setCurrentUser(u1.userId);
    const remRes = await apiRemoveFriend(u2.userId);
    assert.equal(remRes.ok, true);
    const raw = JSON.parse(storage.get("honest_reps_prod_v1")!);
    const remainingWithHari = raw.friendships.filter(
      (f: { userId: string; friendId: string }) =>
        (f.userId === u1.userId && f.friendId === u2.userId) ||
        (f.userId === u2.userId && f.friendId === u1.userId)
    );
    assert.equal(remainingWithHari.length, 0, "Expected removed friendship to be deleted");
    console.log("  [PASS] Remove accepted friend verified");
  }

  // 7. Add new workout to personal library via apiLibraryAction
  {
    setCurrentUser(u1.userId);
    const addRes = await apiLibraryAction({
      action: "add-exercise",
      name: "Incline DB Curl",
      muscleGroup: "Arms",
    });
    assert.equal(addRes.ok, true);
    assert.ok(addRes.exercise);
    assert.equal(addRes.exercise.name, "Incline DB Curl");
    assert.equal(addRes.exercise.muscleGroup, "Arms");
    assert.equal(addRes.exercise.ownerId, u1.userId);

    const raw = JSON.parse(storage.get("honest_reps_prod_v1")!);
    const inLib = raw.exerciseLibrary.find(
      (e: { name: string; ownerId: string }) =>
        e.name === "Incline DB Curl" && e.ownerId === u1.userId
    );
    assert.ok(inLib, "Expected custom exercise in persistent library");
    console.log("  [PASS] Add new workout to personal library verified");
  }

  console.log("All Honest Reps Friendship Data tests passed.");
}

runTests().catch((err) => {
  console.error("Friendship test failed:", err);
  process.exit(1);
});
