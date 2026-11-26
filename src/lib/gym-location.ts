"use client";

import { PublicGym } from "./types";
export type { PublicGym };

export interface GymLocationConfig {
  enabled: boolean;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  updatedAt: string;
  gymId?: string;
}

const GYM_LOCATION_KEY_PREFIX = "hr_gym_location_v1_";
const GYM_SUPPRESSED_KEY_PREFIX = "hr_gym_geo_suppressed_v1_";
const PUBLIC_GYMS_KEY = "hr_public_gyms_v1";
const DISMISSED_NEARBY_GYMS_KEY = "hr_dismissed_nearby_gyms_v1_";

export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function evaluateGymGeofence(params: {
  gym: GymLocationConfig | null;
  currentLat: number;
  currentLng: number;
  currentlyInGym: boolean;
  suppressedUntilLeft: boolean;
}): {
  action: "activate" | "clear_suppression" | "none";
  distanceMeters: number;
  withinRadius: boolean;
} {
  const { gym, currentLat, currentLng, currentlyInGym, suppressedUntilLeft } = params;
  if (!gym || !gym.enabled) {
    return { action: "none", distanceMeters: Infinity, withinRadius: false };
  }

  const distanceMeters = calculateDistanceMeters(
    currentLat,
    currentLng,
    gym.lat,
    gym.lng
  );
  const withinRadius = distanceMeters <= gym.radiusMeters;

  if (withinRadius) {
    if (!currentlyInGym && !suppressedUntilLeft) {
      return { action: "activate", distanceMeters, withinRadius: true };
    }
    return { action: "none", distanceMeters, withinRadius: true };
  }

  if (suppressedUntilLeft && distanceMeters > gym.radiusMeters + 50) {
    return { action: "clear_suppression", distanceMeters, withinRadius: false };
  }

  return { action: "none", distanceMeters, withinRadius: false };
}

export function getSavedGymLocation(userId: string): GymLocationConfig | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(`${GYM_LOCATION_KEY_PREFIX}${userId}`);
    return raw ? (JSON.parse(raw) as GymLocationConfig) : null;
  } catch {
    return null;
  }
}

export function saveGymLocation(userId: string, config: GymLocationConfig): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(`${GYM_LOCATION_KEY_PREFIX}${userId}`, JSON.stringify(config));
  } catch {}
}

export function clearGymLocation(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.removeItem(`${GYM_LOCATION_KEY_PREFIX}${userId}`);
    localStorage.removeItem(`${GYM_SUPPRESSED_KEY_PREFIX}${userId}`);
  } catch {}
}

export function isGymGeoSuppressed(userId: string): boolean {
  if (typeof window === "undefined" || !userId) return false;
  try {
    return localStorage.getItem(`${GYM_SUPPRESSED_KEY_PREFIX}${userId}`) === "1";
  } catch {
    return false;
  }
}

export function setGymGeoSuppressed(userId: string, suppressed: boolean): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    if (suppressed) {
      localStorage.setItem(`${GYM_SUPPRESSED_KEY_PREFIX}${userId}`, "1");
    } else {
      localStorage.removeItem(`${GYM_SUPPRESSED_KEY_PREFIX}${userId}`);
    }
  } catch {}
}

// -------------------------------------------------------------
// PUBLIC GYMS DIRECTORY & COMMUNITY DISCOVERY
// -------------------------------------------------------------

export function getPublicGyms(): PublicGym[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PUBLIC_GYMS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as PublicGym[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function savePublicGyms(gyms: PublicGym[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PUBLIC_GYMS_KEY, JSON.stringify(gyms));
  } catch {}
}

export function findNearbyPublicGyms(
  lat: number,
  lng: number,
  maxDistanceMeters: number = 3000
): Array<{ gym: PublicGym; distanceMeters: number; isInside: boolean }> {
  const gyms = getPublicGyms();
  const results: Array<{ gym: PublicGym; distanceMeters: number; isInside: boolean }> = [];

  for (const gym of gyms) {
    const distanceMeters = calculateDistanceMeters(lat, lng, gym.lat, gym.lng);
    if (distanceMeters <= maxDistanceMeters) {
      results.push({
        gym,
        distanceMeters: Math.round(distanceMeters),
        isInside: distanceMeters <= gym.radiusMeters,
      });
    }
  }

  return results.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export function registerOrUpdatePublicGym(params: {
  name: string;
  lat: number;
  lng: number;
  radiusMeters?: number;
  userId: string;
  userName?: string;
  existingGymId?: string;
}): { gym: PublicGym; config: GymLocationConfig } {
  const {
    name,
    lat,
    lng,
    radiusMeters = 150,
    userId,
    userName = "Member",
    existingGymId,
  } = params;

  const currentGyms = getPublicGyms();
  const now = new Date().toISOString();

  // Find if gym already exists by ID or very close coordinates (~100m)
  let gymIndex = -1;
  if (existingGymId) {
    gymIndex = currentGyms.findIndex((g) => g.id === existingGymId);
  }
  if (gymIndex === -1) {
    gymIndex = currentGyms.findIndex(
      (g) => calculateDistanceMeters(lat, lng, g.lat, g.lng) <= 100
    );
  }

  let gym: PublicGym;

  if (gymIndex >= 0) {
    // Update existing public gym
    const existing = currentGyms[gymIndex];
    const memberSet = new Set(existing.memberUserIds || []);
    memberSet.add(userId);
    const updatedMembers = Array.from(memberSet);

    gym = {
      ...existing,
      name: name.trim() || existing.name,
      lat,
      lng,
      radiusMeters,
      memberUserIds: updatedMembers,
      memberCount: updatedMembers.length,
      updatedAt: now,
    };
    currentGyms[gymIndex] = gym;
  } else {
    // Register new public gym
    gym = {
      id: `gym_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || "Community Gym",
      lat,
      lng,
      radiusMeters,
      createdByUserId: userId,
      createdByName: userName,
      memberUserIds: [userId],
      memberCount: 1,
      createdAt: now,
      updatedAt: now,
    };
    currentGyms.unshift(gym);
  }

  savePublicGyms(currentGyms);

  const config: GymLocationConfig = {
    enabled: true,
    name: gym.name,
    lat: gym.lat,
    lng: gym.lng,
    radiusMeters: gym.radiusMeters,
    updatedAt: now,
    gymId: gym.id,
  };
  saveGymLocation(userId, config);
  setGymGeoSuppressed(userId, false);

  return { gym, config };
}

export function joinPublicGym(
  gymId: string,
  userId: string
): { gym: PublicGym; config: GymLocationConfig } | null {
  const currentGyms = getPublicGyms();
  const gym = currentGyms.find((g) => g.id === gymId);
  if (!gym) return null;

  const memberSet = new Set(gym.memberUserIds || []);
  memberSet.add(userId);
  const updatedMembers = Array.from(memberSet);

  const now = new Date().toISOString();
  gym.memberUserIds = updatedMembers;
  gym.memberCount = updatedMembers.length;
  gym.updatedAt = now;

  savePublicGyms(currentGyms);

  const config: GymLocationConfig = {
    enabled: true,
    name: gym.name,
    lat: gym.lat,
    lng: gym.lng,
    radiusMeters: gym.radiusMeters,
    updatedAt: now,
    gymId: gym.id,
  };
  saveGymLocation(userId, config);
  setGymGeoSuppressed(userId, false);

  return { gym, config };
}

export function leavePublicGym(gymId: string, userId: string): void {
  const currentGyms = getPublicGyms();
  const gym = currentGyms.find((g) => g.id === gymId);
  if (gym) {
    gym.memberUserIds = (gym.memberUserIds || []).filter((id) => id !== userId);
    gym.memberCount = gym.memberUserIds.length;
    gym.updatedAt = new Date().toISOString();
    savePublicGyms(currentGyms);
  }
  clearGymLocation(userId);
}

export function dismissNearbyGym(userId: string, gymId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    const raw = sessionStorage.getItem(`${DISMISSED_NEARBY_GYMS_KEY}${userId}`);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(gymId)) {
      list.push(gymId);
      sessionStorage.setItem(`${DISMISSED_NEARBY_GYMS_KEY}${userId}`, JSON.stringify(list));
    }
  } catch {}
}

export function isNearbyGymDismissed(userId: string, gymId: string): boolean {
  if (typeof window === "undefined" || !userId) return false;
  try {
    const raw = sessionStorage.getItem(`${DISMISSED_NEARBY_GYMS_KEY}${userId}`);
    if (!raw) return false;
    const list: string[] = JSON.parse(raw);
    return Array.isArray(list) && list.includes(gymId);
  } catch {
    return false;
  }
}

export function evaluatePublicGymsArrival(params: {
  currentLat: number;
  currentLng: number;
  currentGymId?: string;
  userId?: string;
}): { gym: PublicGym; distanceMeters: number } | null {
  const { currentLat, currentLng, currentGymId, userId } = params;
  const gyms = getPublicGyms();

  for (const gym of gyms) {
    // If the user is already officially configured with this gym, skip prompt (their own geofence activates)
    if (currentGymId && gym.id === currentGymId) continue;
    if (userId && (gym.memberUserIds || []).includes(userId)) continue;
    if (userId && isNearbyGymDismissed(userId, gym.id)) continue;

    const distanceMeters = calculateDistanceMeters(
      currentLat,
      currentLng,
      gym.lat,
      gym.lng
    );

    if (distanceMeters <= gym.radiusMeters) {
      return { gym, distanceMeters: Math.round(distanceMeters) };
    }
  }

  return null;
}

export interface OsmNearbyGym {
  name: string;
  lat: number;
  lng: number;
  distanceMeters: number;
}

/**
 * Free OpenStreetMap Overpass API lookup (no API key required) to detect a
 * mapped gym near the user's current coordinates when no contributor gym exists.
 */
export async function fetchNearbyOsmGym(
  lat: number,
  lng: number,
  radiusMeters = 250
): Promise<OsmNearbyGym | null> {
  if (typeof fetch === "undefined") return null;

  const query = `[out:json][timeout:6];(node["leisure"="fitness_centre"](around:${radiusMeters},${lat},${lng});way["leisure"="fitness_centre"](around:${radiusMeters},${lat},${lng});node["sport"="fitness"](around:${radiusMeters},${lat},${lng}););out center 10;`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      elements?: Array<{
        lat?: number;
        lon?: number;
        center?: { lat?: number; lon?: number };
        tags?: { name?: string };
      }>;
    };
    const candidates: OsmNearbyGym[] = [];
    for (const el of json.elements || []) {
      const name = el.tags?.name?.trim();
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (!name || typeof elLat !== "number" || typeof elLng !== "number") continue;
      candidates.push({
        name,
        lat: Number(elLat.toFixed(6)),
        lng: Number(elLng.toFixed(6)),
        distanceMeters: Math.round(calculateDistanceMeters(lat, lng, elLat, elLng)),
      });
    }
    candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return candidates[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
