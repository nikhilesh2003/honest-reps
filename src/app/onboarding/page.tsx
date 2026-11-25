"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActiveStatus, HeightUnit, WeightUnit } from "@/lib/types";
import { apiGetState, apiUpdateProfile } from "@/lib/client-engine";

// Screen 2: Onboarding (FR-2 to FR-4, FR-65)
export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [weight, setWeight] = useState("74.5");
  const [heightCm, setHeightCm] = useState("178");
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
          setHeightCm(String(d.profile.heightCm || 175));
          setWeightUnit(d.profile.weightUnit || "kg");
          setHeightUnit(d.profile.heightUnit || "cm");
          setActiveStatus(d.profile.activeStatus || "Moderately active");
        }
        setChecking(false);
      })
      .catch(() => {
        setChecking(false);
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = await apiUpdateProfile({
        name,
        username,
        weightValue: Number(weight),
        heightCm: Number(heightCm),
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
    <div className="min-h-screen bg-black flex items-center justify-center px-5 py-10">
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
                  onClick={() => setWeightUnit(u)}
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
                  onClick={() => setHeightUnit(u)}
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
          <div>
            <label className="block text-[11px] text-[#86868b] mb-1">Username (unique)</label>
            <input
              required
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">
                Weight ({weightUnit})
              </label>
              <input
                required
                type="number"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] tabular-nums focus:outline-none focus:border-[#10e760]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">
                Height (cm)
              </label>
              <input
                required
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] tabular-nums focus:outline-none focus:border-[#10e760]"
              />
            </div>
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
