"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapPin,
  Navigation,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Users,
  Globe,
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
  saveGymLocation,
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

        // If standing inside an existing public gym, suggest its name
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
          setError(
            "Location permission denied. Allow location access in your browser/device settings."
          );
        } else if (err.code === err.TIMEOUT) {
          setError("Location timed out. Turn on GPS and try again.");
        } else {
          setError("Unable to read your location. Make sure device location is turned on.");
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
        `Joined ${res.gym.name}! ${res.gym.memberCount} members train here.`
      );
      onClose();
    }
  };

  const handleSave = () => {
    if (!coords) {
      setError("Capture your gym location first using the button above.");
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
        ? `Gym published (${gym.name}) · Auto-check-in ON for all members`
        : `Gym saved (${gym.name}) · Auto-check-in paused`
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
      subtitle="Save your gym or join a public gym for instant auto-check-in."
    >
      <div className="space-y-4">
        {/* GPS Capture Card */}
        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
          <div className="flex items-start gap-2.5 text-[12px] text-[#86868b] leading-snug">
            <MapPin className="w-4 h-4 text-[#10e760] shrink-0 mt-0.5" />
            <span>
              Stand at your gym and tap below to pin its GPS coordinates. When you set a gym, it is
              shared with everyone who trains at this spot.
            </span>
          </div>

          <button
            type="button"
            disabled={locating}
            onClick={handleCaptureCurrentLocation}
            className="w-full h-11 rounded-xl bg-[#10e760]/15 hover:bg-[#10e760]/25 border border-[#10e760]/40 text-[#10e760] text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Navigation className="w-4 h-4" />
            {locating
              ? "Getting GPS coordinates..."
              : coords
              ? "Update to Current Location"
              : "Use My Current Location"}
          </button>

          {coords && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/60 border border-white/[0.07] text-[12px]">
              <span className="flex items-center gap-1.5 text-[#10e760] font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Location pinned
              </span>
              <span className="text-[#86868b] tabular-nums">
                {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                {accuracy !== null ? ` (±${accuracy}m)` : ""}
              </span>
            </div>
          )}
        </div>

        {/* Nearby Public Gyms Auto-Discovered */}
        {nearbyPublicGyms.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              <span className="flex items-center gap-1 text-[#10e760]">
                <Globe className="w-3.5 h-3.5" />
                Nearby Public Gyms
              </span>
              <span>{nearbyPublicGyms.length} found</span>
            </div>
            <div className="space-y-1.5">
              {nearbyPublicGyms.map(({ gym: g, distanceMeters, isInside }) => {
                const isCurrent = gymId === g.id;
                return (
                  <div
                    key={g.id}
                    className={`p-3 rounded-2xl border transition-colors flex items-center justify-between gap-3 ${
                      isCurrent
                        ? "bg-[#10e760]/10 border-[#10e760]/40"
                        : isInside
                        ? "bg-white/[0.05] border-[#10e760]/30"
                        : "bg-white/[0.02] border-white/[0.07]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-white truncate">
                          {g.name}
                        </span>
                        {isInside && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#10e760]/20 text-[#10e760] font-medium">
                            You are here
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#86868b] mt-0.5 tabular-nums">
                        {g.memberCount} {g.memberCount === 1 ? "member" : "members"} ·{" "}
                        {distanceMeters}m away
                      </div>
                    </div>
                    {isCurrent ? (
                      <span className="text-[12px] font-semibold text-[#10e760] flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Joined
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleJoinNearby(g)}
                        className="px-3 py-1.5 rounded-xl bg-white text-black hover:bg-white/90 text-[12px] font-semibold shrink-0 cursor-pointer"
                      >
                        Join Gym
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Current Gym Member Badge */}
        {currentJoinedGym && (
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#10e760]/15 border border-[#10e760]/30 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-[#10e760]" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-white">
                  Member of {currentJoinedGym.name}
                </div>
                <div className="text-[11px] text-[#86868b]">
                  {currentJoinedGym.memberCount}{" "}
                  {currentJoinedGym.memberCount === 1 ? "member trains" : "members train"} here
                </div>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b] mb-1.5">
            Gym Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Gold's Gym"
            className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b] mb-1.5">
            Detection Radius
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[100, 150, 250, 500].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  triggerHaptic("selection");
                  setRadius(r);
                }}
                className={`h-9 rounded-xl text-[12px] font-semibold tabular-nums border transition-colors cursor-pointer ${
                  radius === r
                    ? "bg-white text-black border-white"
                    : "bg-white/[0.03] text-[#86868b] border-white/[0.08] hover:text-white"
                }`}
              >
                {r}m
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
          <div>
            <div className="text-[14px] font-medium text-white">Auto-activate at gym</div>
            <div className="text-[11px] text-[#86868b]">
              Turns In the Gym ON while using the app at this spot
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

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[12px] text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {getSavedGymLocation(userId) && (
            <button
              type="button"
              onClick={handleClear}
              className="h-12 px-4 rounded-2xl bg-white/[0.05] hover:bg-red-500/20 border border-white/[0.08] text-[#86868b] hover:text-red-300 text-[13px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 h-12 rounded-2xl bg-[#10e760] hover:bg-[#25d658] text-black font-semibold text-[15px] cursor-pointer"
          >
            Save & Publish Gym
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
