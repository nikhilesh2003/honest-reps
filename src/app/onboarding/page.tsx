"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ActiveStatus, HeightUnit, WeightUnit } from "@/lib/types";
import { apiGetState, apiUpdateProfile } from "@/lib/client-engine";
import {
  cmToFeetInches,
  convertWeightBetweenUnits,
  feetInchesToCm,
  validateUsernameInput,
} from "@/lib/effort";

// Screen 2: Onboarding (FR-2 to FR-4, FR-65)
export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [weight, setWeight] = useState("74.5");
  const [heightCm, setHeightCm] = useState("178");
  const [heightFeet, setHeightFeet] = useState("5");
  const [heightInches, setHeightInches] = useState("10");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");
  const [heightUnit, setHeightUnit] = useState<HeightUnit>("cm");
  const [activeStatus, setActiveStatus] = useState<ActiveStatus>("Moderately active");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGetState()
      .then((d) => {
        if (!d.authenticated) {
          router.replace("/signin/");
          return;
        }
        // Strictly one onboarding per email: already-onboarded users never re-enter onboarding
        if (d.profile?.onboardingComplete) {
          router.replace("/");
          return;
        }
        if (d.profile) {
          setName(d.profile.name || "");
          setUsername(d.profile.username || "");
          const cm = d.profile.heightCm || 175;
          setHeightCm(String(cm));
          const ftIn = cmToFeetInches(cm);
          setHeightFeet(String(ftIn.feet));
          setHeightInches(String(ftIn.inches));
          const wUnit = d.profile.weightUnit || "kg";
          setWeightUnit(wUnit);
          if (wUnit === "lb") {
            setWeight(String(convertWeightBetweenUnits(74.5, "kg", "lb")));
          }
          setHeightUnit(d.profile.heightUnit || "cm");
          setActiveStatus(d.profile.activeStatus || "Moderately active");
        }
        setChecking(false);
      })
      .catch(() => {
        setChecking(false);
      });
  }, [router]);

  const usernameCheck = useMemo(() => validateUsernameInput(username), [username]);

  const handleSwitchWeightUnit = (nextUnit: WeightUnit) => {
    if (nextUnit === weightUnit) return;
    const num = Number(weight);
    if (!Number.isNaN(num) && num > 0) {
      setWeight(String(convertWeightBetweenUnits(num, weightUnit, nextUnit)));
    }
    setWeightUnit(nextUnit);
  };

  const handleSwitchHeightUnit = (nextUnit: HeightUnit) => {
    if (nextUnit === heightUnit) return;
    if (nextUnit === "ft-in") {
      const ftIn = cmToFeetInches(Number(heightCm) || 175);
      setHeightFeet(String(ftIn.feet));
      setHeightInches(String(ftIn.inches));
    } else {
      const cm = feetInchesToCm(Number(heightFeet) || 5, Number(heightInches) || 9);
      setHeightCm(String(Math.round(cm)));
    }
    setHeightUnit(nextUnit);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameCheck.valid) {
      setError("Username must be 3–24 letters, numbers, or underscores.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const computedHeightCm =
        heightUnit === "ft-in"
          ? feetInchesToCm(Number(heightFeet) || 5, Number(heightInches) || 9)
          : Number(heightCm);

      const data = await apiUpdateProfile({
        name: name.trim() || usernameCheck.cleaned,
        username: usernameCheck.cleaned,
        weightValue: Number(weight),
        heightCm: computedHeightCm,
        weightUnit,
        heightUnit,
        activeStatus,
        age: age ? Number(age) : null,
        sex,
        goal,
        onboardingComplete: true,
      });
      if (!data.ok) {
        setError(data.error || "Please check your details.");
        return;
      }
      let nextUrl = "/";
      try {
        const pending = localStorage.getItem("hr_pending_invite_user");
        if (pending) {
          nextUrl = `/invite?u=${encodeURIComponent(pending)}&auto_send=1`;
        }
      } catch {}
      router.replace(nextUrl);
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="bg-black px-5 py-3 rounded-2xl">
          <img
            src="/icons/logo-wordmark.png"
            alt="honestreps.com"
            className="h-12 w-auto object-contain animate-pulse"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-5 py-10 pt-safe pb-safe">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md apple-card p-6 space-y-5"
      >
        <div className="flex items-center gap-3">
          <span className="brand-icon-box w-10 h-10 rounded-xl p-1.5 flex items-center justify-center shrink-0">
            <img
              src="/icons/logo-icon.png"
              alt="Honest Reps"
              className="w-full h-full object-contain"
            />
          </span>
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-white">
              Set Up Profile
            </h1>
            <p className="text-[12px] text-[#86868b]">
              Private body metrics stay visible only to you.
            </p>
          </div>
        </div>

        {/* Units */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-[#86868b]">Units</span>
          <div className="flex gap-2">
            <div className="flex bg-black border border-white/10 rounded-lg p-0.5">
              {(["kg", "lb"] as WeightUnit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => handleSwitchWeightUnit(u)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    weightUnit === u ? "bg-white text-black" : "text-[#86868b]"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <div className="flex bg-black border border-white/10 rounded-lg p-0.5">
              {(["cm", "ft-in"] as HeightUnit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => handleSwitchHeightUnit(u)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                    heightUnit === u ? "bg-white text-black" : "text-[#86868b]"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">Display Name</label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-[#86868b]">Username</label>
                <span
                  className={`text-[10px] font-mono ${
                    usernameCheck.valid ? "text-[#10e760]" : "text-[#86868b]"
                  }`}
                >
                  {usernameCheck.hint}
                </span>
              </div>
              <input
                required
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. alex_lifts"
                className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">
                Weight ({weightUnit})
              </label>
              <input
                required
                type="number"
                inputMode="decimal"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] tabular-nums focus:outline-none focus:border-[#10e760]"
              />
            </div>

            {heightUnit === "cm" ? (
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">
                  Height (cm)
                </label>
                <input
                  required
                  type="number"
                  inputMode="numeric"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] tabular-nums focus:outline-none focus:border-[#10e760]"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">
                  Height (ft / in)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="relative">
                    <input
                      required
                      type="number"
                      inputMode="numeric"
                      min={3}
                      max={8}
                      value={heightFeet}
                      onChange={(e) => setHeightFeet(e.target.value)}
                      className="w-full h-11 pl-3 pr-6 rounded-xl bg-black border border-white/12 text-white text-[14px] tabular-nums focus:outline-none focus:border-[#10e760]"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#86868b]">
                      ft
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      required
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={11}
                      value={heightInches}
                      onChange={(e) => setHeightInches(e.target.value)}
                      className="w-full h-11 pl-3 pr-6 rounded-xl bg-black border border-white/12 text-white text-[14px] tabular-nums focus:outline-none focus:border-[#10e760]"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#86868b]">
                      in
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-[#86868b] mb-1">Active Status</label>
            <select
              value={activeStatus}
              onChange={(e) => setActiveStatus(e.target.value as ActiveStatus)}
              className="w-full h-11 px-3 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
            >
              <option value="Sedentary">Sedentary</option>
              <option value="Lightly active">Lightly active</option>
              <option value="Moderately active">Moderately active</option>
              <option value="Very active">Very active</option>
            </select>
          </div>

          {/* Optional FR-3 fields */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">Age (optional)</label>
              <input
                type="number"
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] tabular-nums focus:outline-none focus:border-[#10e760]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">Sex (optional)</label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
              >
                <option value="">Skip</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#86868b] mb-1">Goal (optional)</label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Consistency"
              className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
            />
          </div>
        </div>

        {error && <p className="text-[12px] text-amber-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-12 rounded-2xl bg-[#10e760] hover:bg-[#25d658] disabled:opacity-50 text-black font-semibold text-[15px] cursor-pointer"
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </form>
    </div>
  );
}
