"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Navigation,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Users,
} from "lucide-react";
import {
  clearGymLocation,
  findNearbyPublicGyms,
  getPublicGyms,
  getSavedGymLocation,
  GymLocationConfig,
  joinPublicGym,
  PublicGym,
  registerOrUpdatePublicGym,
  setGymGeoSuppressed,
} from "@/lib/gym-location";
import { BottomSheet } from "../ui/BottomSheet";
import { triggerHaptic } from "@/lib/haptics";
import { apiJoinPublicGym, apiRegisterOrUpdatePublicGym } from "@/lib/client-engine";

interface GymLocationSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName?: string;
  onUpdated: (config: GymLocationConfig | null, message: string) => void;
}

export function GymLocationSheet({
  open,
  onClose,
  userId,
  userName = "Member",
  onUpdated,
}: GymLocationSheetProps) {
  const [name, setName] = useState("My Gym");
  const [radius, setRadius] = useState(150);
  const [enabled, setEnabled] = useState(true);
  const [gymId, setGymId] = useState<string | undefined>(undefined);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open || wasOpen) return;

    setError(null);
    setAccuracy(null);
    const saved = getSavedGymLocation(userId);
    if (saved) {
      setName(saved.name || "My Gym");
      setRadius(saved.radiusMeters || 150);
      setEnabled(saved.enabled);
      setGymId(saved.gymId);
      setCoords({ lat: saved.lat, lng: saved.lng });
    } else {
      setName("My Gym");
      setRadius(150);
      setEnabled(true);
      setGymId(undefined);
      setCoords(null);
    }
  }, [open, userId]);

  const nearbyPublicGyms = useMemo(() => {
    if (!coords) return [];
    return findNearbyPublicGyms(coords.lat, coords.lng, 2500);
  }, [coords]);

  const currentJoinedGym = useMemo(() => {
    if (!gymId) return null;
    return getPublicGyms().find((g) => g.id === gymId) || null;
  }, [gymId]);

  const handleCaptureCurrentLocation = () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setError("Location is not supported on this device/browser.");
      return;
    }
    setLocating(true);
    setError(null);
    triggerHaptic("selection");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setCoords(c);
        setAccuracy(Math.round(pos.coords.accuracy || 0));
        setLocating(false);
        triggerHaptic("success");

        const nearby = findNearbyPublicGyms(c.lat, c.lng, 150);
        if (nearby.length > 0 && nearby[0].isInside) {
          setName(nearby[0].gym.name);
          setRadius(nearby[0].gym.radiusMeters);
          setGymId(nearby[0].gym.id);
        }
      },
      (err) => {
        setLocating(false);
        triggerHaptic("warning");
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location permission denied. Allow access in browser settings.");
        } else if (err.code === err.TIMEOUT) {
          setError("Location timed out. Turn on GPS and try again.");
        } else {
          setError("Unable to read your location.");
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const handleJoinNearby = async (targetGym: PublicGym) => {
    triggerHaptic("success");
    const res = joinPublicGym(targetGym.id, userId);
    void apiJoinPublicGym(targetGym.id);
    if (res) {
      setGymId(res.gym.id);
      setName(res.gym.name);
      setCoords({ lat: res.gym.lat, lng: res.gym.lng });
      setRadius(res.gym.radiusMeters);
      onUpdated(
        res.config,
        `Joined ${res.gym.name} · ${res.gym.memberCount} members`
      );
      onClose();
    }
  };

  const handleSave = () => {
    if (!coords) {
      setError("Pin your current location first.");
      return;
    }
    triggerHaptic("success");
    const { gym, config: next } = registerOrUpdatePublicGym({
      name: name.trim() || "My Gym",
      lat: coords.lat,
      lng: coords.lng,
      radiusMeters: radius,
      userId,
      userName,
      existingGymId: gymId,
    });
    void apiRegisterOrUpdatePublicGym({
      name: gym.name,
      lat: gym.lat,
      lng: gym.lng,
      radiusMeters: radius,
      existingGymId: gym.id,
    });
    setGymGeoSuppressed(userId, false);
    onUpdated(
      next,
      enabled
        ? `Saved ${gym.name} · Auto-check-in ON`
        : `Saved ${gym.name} · Auto-check-in paused`
    );
    onClose();
  };

  const handleClear = () => {
    triggerHaptic("light");
    clearGymLocation(userId);
    setGymId(undefined);
    onUpdated(null, "Gym location removed");
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Gym Location"
      subtitle="Pin your gym or join a nearby gym for automatic check-in."
    >
      <div className="space-y-4">
        <div className="p-3.5 rounded-2xl bg-[#1c1c1e] space-y-3">
          <button
            type="button"
            disabled={locating}
            onClick={handleCaptureCurrentLocation}
            className="w-full h-11 rounded-full bg-[#30d158]/15 hover:bg-[#30d158]/25 text-[#30d158] text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Navigation className="w-4 h-4" />
            {locating
              ? "Locating..."
              : coords
              ? "Update Current Location"
              : "Use Current Location"}
          </button>

          {coords && (
            <div className="flex items-center justify-between px-1 text-[12px]">
              <span className="flex items-center gap-1.5 text-[#30d158] font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Pinned
              </span>
              <span className="text-[#86868b] tabular-nums">
                {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                {accuracy !== null ? ` (±${accuracy}m)` : ""}
              </span>
            </div>
          )}
        </div>

        {/* Nearby Public Gyms */}
        {nearbyPublicGyms.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[12px] text-[#86868b] px-0.5">
              <span>Nearby Gyms</span>
              <span>{nearbyPublicGyms.length} found</span>
            </div>
            <div className="rounded-2xl bg-[#1c1c1e] divide-y divide-white/[0.06] overflow-hidden">
              {nearbyPublicGyms.map(({ gym: g, distanceMeters, isInside }) => {
                const isCurrent = gymId === g.id;
                return (
                  <div
                    key={g.id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-white truncate">
                          {g.name}
                        </span>
                        {isInside && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#30d158]/15 text-[#30d158] font-medium">
                            Here
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#86868b] mt-0.5 tabular-nums">
                        {g.memberCount} {g.memberCount === 1 ? "member" : "members"} ·{" "}
                        {distanceMeters}m away
                      </div>
                    </div>
                    {isCurrent ? (
                      <span className="text-[12px] font-medium text-[#30d158] shrink-0">
                        Joined
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleJoinNearby(g)}
                        className="px-3 py-1.5 rounded-full bg-white text-black text-[12px] font-semibold shrink-0 cursor-pointer"
                      >
                        Join
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {currentJoinedGym && (
          <div className="px-4 py-3 rounded-2xl bg-[#1c1c1e] flex items-center gap-3">
            <Users className="w-4 h-4 text-[#30d158] shrink-0" />
            <div className="text-[13px] text-white">
              Member of <span className="font-semibold">{currentJoinedGym.name}</span>{" "}
              <span className="text-[#86868b]">({currentJoinedGym.memberCount})</span>
            </div>
          </div>
        )}

        {/* Inset Grouped Settings */}
        <div className="rounded-2xl bg-[#1c1c1e] divide-y divide-white/[0.06] overflow-hidden">
          <div className="px-4 h-12 flex items-center justify-between gap-3">
            <label className="text-[14px] text-[#86868b] shrink-0">Gym Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Gym"
              className="flex-1 bg-transparent text-right text-[14px] font-medium text-white placeholder:text-[#636366] focus:outline-none"
            />
          </div>

          <div className="px-4 py-3 space-y-2">
            <div className="text-[13px] text-[#86868b]">Detection Radius</div>
            <div className="apple-segmented !bg-black/40">
              {[100, 150, 250, 500].map((r) => (
                <button
                  key={r}
                  type="button"
                  data-active={radius === r}
                  onClick={() => {
                    triggerHaptic("selection");
                    setRadius(r);
                  }}
                  className="apple-segmented-btn h-8 tabular-nums"
                >
                  {r}m
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[14px] font-medium text-white">Auto-Check-In</div>
              <div className="text-[11px] text-[#86868b]">
                Turns In the Gym on at this spot
              </div>
            </div>
            <button
              type="button"
              data-checked={enabled}
              onClick={() => {
                triggerHaptic("selection");
                setEnabled((v) => !v);
              }}
              className="ios-switch"
            >
              <span className="ios-switch-thumb" />
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500/10 text-[12px] text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {getSavedGymLocation(userId) && (
            <button
              type="button"
              onClick={handleClear}
              className="h-12 px-4 rounded-full bg-[#1c1c1e] hover:bg-red-500/20 text-[#86868b] hover:text-red-300 text-[13px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 h-12 rounded-full bg-[#30d158] hover:opacity-90 text-black font-semibold text-[15px] transition-opacity cursor-pointer"
          >
            Save Gym
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
