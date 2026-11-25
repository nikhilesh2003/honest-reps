import assert from "node:assert/strict";
import {
  calculateDistanceMeters,
  evaluateGymGeofence,
  evaluatePublicGymsArrival,
  findNearbyPublicGyms,
  GymLocationConfig,
  joinPublicGym,
  registerOrUpdatePublicGym,
  savePublicGyms,
} from "../gym-location";

console.log("Running Honest Reps Gym Location & Geofence Verification...");

// Setup node localStorage mock
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

const sampleGym: GymLocationConfig = {
  enabled: true,
  name: "Iron House Gym",
  lat: 17.4435,
  lng: 78.3772,
  radiusMeters: 150,
  updatedAt: "2026-11-24T12:00:00.000Z",
};

// 1. Haversine distance accuracy
{
  const same = calculateDistanceMeters(17.4435, 78.3772, 17.4435, 78.3772);
  assert.equal(Math.round(same), 0);

  // ~0.001 deg latitude is ~111 meters
  const nearby = calculateDistanceMeters(17.4435, 78.3772, 17.4445, 78.3772);
  assert.ok(nearby > 105 && nearby < 118, `Expected ~111m, got ${nearby}`);

  // ~0.005 deg latitude is ~555 meters (outside 150m radius)
  const far = calculateDistanceMeters(17.4435, 78.3772, 17.4485, 78.3772);
  assert.ok(far > 540 && far < 570, `Expected ~555m, got ${far}`);
  console.log("  [PASS] Haversine distance calculation verified");
}

// 2. Geofence triggers activation when inside radius, not already in gym, and not suppressed
{
  const res = evaluateGymGeofence({
    gym: sampleGym,
    currentLat: 17.4438,
    currentLng: 78.3772,
    currentlyInGym: false,
    suppressedUntilLeft: false,
  });
  assert.equal(res.action, "activate");
  assert.ok(res.distanceMeters < 50);

  // Already in gym -> no action
  const already = evaluateGymGeofence({
    gym: sampleGym,
    currentLat: 17.4438,
    currentLng: 78.3772,
    currentlyInGym: true,
    suppressedUntilLeft: false,
  });
  assert.equal(already.action, "none");

  // Manually turned off while still at gym -> suppressed, no re-activation
  const suppressed = evaluateGymGeofence({
    gym: sampleGym,
    currentLat: 17.4438,
    currentLng: 78.3772,
    currentlyInGym: false,
    suppressedUntilLeft: true,
  });
  assert.equal(suppressed.action, "none");

  // Left gym beyond radius + 50m hysteresis -> clears suppression
  const leftGym = evaluateGymGeofence({
    gym: sampleGym,
    currentLat: 17.4465,
    currentLng: 78.3772,
    currentlyInGym: false,
    suppressedUntilLeft: true,
  });
  assert.equal(leftGym.action, "clear_suppression");
  assert.ok(leftGym.distanceMeters > 200);

  // Disabled gym location -> no action
  const disabled = evaluateGymGeofence({
    gym: { ...sampleGym, enabled: false },
    currentLat: 17.4435,
    currentLng: 78.3772,
    currentlyInGym: false,
    suppressedUntilLeft: false,
  });
  assert.equal(disabled.action, "none");
  console.log("  [PASS] Geofence activation, suppression, and exit hysteresis verified");
}

// 3. Public Gym registration, community discovery & auto-joining for visitors
{
  savePublicGyms([]);

  // User 1 sets their gym location -> automatically published as public gym
  const { gym: pubGym, config: cfg1 } = registerOrUpdatePublicGym({
    name: "Gold's Gym Downtown",
    lat: 17.4435,
    lng: 78.3772,
    radiusMeters: 150,
    userId: "user_1",
    userName: "Nikhil",
  });

  assert.equal(pubGym.name, "Gold's Gym Downtown");
  assert.equal(pubGym.memberCount, 1);
  assert.ok(pubGym.memberUserIds.includes("user_1"));
  assert.equal(cfg1.gymId, pubGym.id);

  // User 2 opens app 30 meters away -> discovers public gym
  const nearby = findNearbyPublicGyms(17.4437, 78.3772, 500);
  assert.equal(nearby.length, 1);
  assert.equal(nearby[0].gym.name, "Gold's Gym Downtown");
  assert.equal(nearby[0].isInside, true);
  assert.ok(nearby[0].distanceMeters < 50);

  // User 2 joins the same gym
  const joined = joinPublicGym(pubGym.id, "user_2");
  assert.ok(joined !== null);
  assert.equal(joined.gym.memberCount, 2);
  assert.ok(joined.gym.memberUserIds.includes("user_2"));
  assert.equal(joined.config.name, "Gold's Gym Downtown");

  // User 3 (new visitor who has NOT joined) arrives at the gym
  const arrival = evaluatePublicGymsArrival({
    currentLat: 17.4436,
    currentLng: 78.3772,
    userId: "user_3",
  });
  assert.ok(arrival !== null);
  assert.equal(arrival.gym.id, pubGym.id);
  assert.equal(arrival.gym.memberCount, 2);

  // User 1 (already member) arriving at the gym does NOT trigger unjoined visitor prompt
  const memberArrival = evaluatePublicGymsArrival({
    currentLat: 17.4436,
    currentLng: 78.3772,
    currentGymId: pubGym.id,
    userId: "user_1",
  });
  assert.equal(memberArrival, null);

  console.log("  [PASS] Public gym registration, discovery, member joining, and visitor arrival verified");
}

console.log("All Gym Location tests passed.");
