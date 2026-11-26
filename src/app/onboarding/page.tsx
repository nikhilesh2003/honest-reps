"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
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
  const [showOptional, setShowOptional] = useState(false);
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
        <span className="text-[13px] text-[#86868b]">Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-5 py-10 pt-safe pb-safe">
      <form onSubmit={handleSubmit} className="w-full max-w-[400px] space-y-6">
        {/* Clean Apple Health-style Header */}
        <div className="text-center space-y-2">
          <div className="brand-icon-box w-12 h-12 mx-auto rounded-2xl p-1.5 flex items-center justify-center">
            <img
              src="/icons/logo-icon.png"
              alt="Honest Reps"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-white">
            Set Up Profile
          </h1>
          <p className="text-[13px] text-[#86868b]">
            Body metrics stay private and are never shared with friends.
          </p>
        </div>

        {/* Unit Segmented Controls */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="apple-segmented">
            {(["kg", "lb"] as WeightUnit[]).map((u) => (
              <button
                key={u}
                type="button"
                data-active={weightUnit === u}
                onClick={() => handleSwitchWeightUnit(u)}
                className="apple-segmented-btn h-8"
              >
                {u}
              </button>
            ))}
          </div>
          <div className="apple-segmented">
            {(["cm", "ft-in"] as HeightUnit[]).map((u) => (
              <button
                key={u}
                type="button"
                data-active={heightUnit === u}
                onClick={() => handleSwitchHeightUnit(u)}
                className="apple-segmented-btn h-8"
              >
                {u === "ft-in" ? "ft / in" : "cm"}
              </button>
            ))}
          </div>
        </div>

        {/* Native iOS Inset Grouped Rows */}
        <div className="apple-card divide-y divide-white/[0.06] overflow-hidden">
          <div className="px-4 h-12 flex items-center justify-between gap-3">
            <label className="text-[14px] text-[#86868b] shrink-0">Name</label>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="flex-1 bg-transparent text-right text-[15px] text-white placeholder:text-[#636366] focus:outline-none"
            />
          </div>

          <div className="px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <label className="text-[14px] text-[#86868b] shrink-0">Username</label>
              <input
                required
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="alex_lifts"
                className="flex-1 bg-transparent text-right text-[15px] text-white placeholder:text-[#636366] focus:outline-none"
              />
            </div>
            <div
              className={`text-right text-[11px] mt-0.5 tabular-nums ${
                usernameCheck.valid ? "text-[#30d158]" : "text-[#86868b]"
              }`}
            >
              {usernameCheck.hint}
            </div>
          </div>

          <div className="px-4 h-12 flex items-center justify-between gap-3">
            <label className="text-[14px] text-[#86868b] shrink-0">
              Weight ({weightUnit})
            </label>
            <input
              required
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-28 bg-transparent text-right text-[15px] font-medium text-white tabular-nums focus:outline-none"
            />
          </div>

          <div className="px-4 h-12 flex items-center justify-between gap-3">
            <label className="text-[14px] text-[#86868b] shrink-0">
              Height ({heightUnit === "ft-in" ? "ft / in" : "cm"})
            </label>
            {heightUnit === "cm" ? (
              <input
                required
                type="number"
                inputMode="numeric"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="w-28 bg-transparent text-right text-[15px] font-medium text-white tabular-nums focus:outline-none"
              />
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <input
                    required
                    type="number"
                    inputMode="numeric"
                    min={3}
                    max={8}
                    value={heightFeet}
                    onChange={(e) => setHeightFeet(e.target.value)}
                    className="w-10 bg-[#1c1c1e] rounded-lg h-8 text-center text-[14px] font-medium text-white tabular-nums focus:outline-none"
                  />
                  <span className="text-[12px] text-[#86868b]">ft</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    required
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={11}
                    value={heightInches}
                    onChange={(e) => setHeightInches(e.target.value)}
                    className="w-10 bg-[#1c1c1e] rounded-lg h-8 text-center text-[14px] font-medium text-white tabular-nums focus:outline-none"
                  />
                  <span className="text-[12px] text-[#86868b]">in</span>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 h-12 flex items-center justify-between gap-3">
            <label className="text-[14px] text-[#86868b] shrink-0">Activity Level</label>
            <select
              value={activeStatus}
              onChange={(e) => setActiveStatus(e.target.value as ActiveStatus)}
              className="bg-transparent text-right text-[14px] font-medium text-white focus:outline-none cursor-pointer"
            >
              <option value="Sedentary" className="bg-[#1c1c1e] text-white">
                Sedentary
              </option>
              <option value="Lightly active" className="bg-[#1c1c1e] text-white">
                Lightly active
              </option>
              <option value="Moderately active" className="bg-[#1c1c1e] text-white">
                Moderately active
              </option>
              <option value="Very active" className="bg-[#1c1c1e] text-white">
                Very active
              </option>
            </select>
          </div>
        </div>

        {/* Progressive Disclosure: Optional Details */}
        <div className="apple-card overflow-hidden">
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            className="w-full px-4 h-11 flex items-center justify-between text-[13px] text-[#86868b] hover:text-white transition-colors cursor-pointer"
          >
            <span>Optional details (Age, Sex, Goal)</span>
            {showOptional ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showOptional && (
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              <div className="px-4 h-11 flex items-center justify-between gap-3">
                <label className="text-[14px] text-[#86868b]">Age</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Optional"
                  className="w-28 bg-transparent text-right text-[14px] text-white placeholder:text-[#636366] tabular-nums focus:outline-none"
                />
              </div>
              <div className="px-4 h-11 flex items-center justify-between gap-3">
                <label className="text-[14px] text-[#86868b]">Sex</label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                  className="bg-transparent text-right text-[14px] text-white focus:outline-none cursor-pointer"
                >
                  <option value="" className="bg-[#1c1c1e] text-white">
                    Skip
                  </option>
                  <option value="Male" className="bg-[#1c1c1e] text-white">
                    Male
                  </option>
                  <option value="Female" className="bg-[#1c1c1e] text-white">
                    Female
                  </option>
                  <option value="Other" className="bg-[#1c1c1e] text-white">
                    Other
                  </option>
                </select>
              </div>
              <div className="px-4 h-11 flex items-center justify-between gap-3">
                <label className="text-[14px] text-[#86868b]">Goal</label>
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. Consistency"
                  className="flex-1 bg-transparent text-right text-[14px] text-white placeholder:text-[#636366] focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-[12px] text-amber-400 text-center">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-12 rounded-full bg-[#30d158] hover:opacity-90 disabled:opacity-50 text-black font-semibold text-[15px] transition-opacity cursor-pointer"
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </form>
    </div>
  );
}
