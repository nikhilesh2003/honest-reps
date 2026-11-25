import { createSupabaseServerClient } from "./supabase/server";
import {
  ensureGoogleUserInDb,
  getActiveUser,
  isUserAdmin,
  loadDatabase,
} from "./db/store";
import { DatabaseState, Profile } from "./types";

export async function resolveRequestUser(): Promise<{
  state: DatabaseState;
  user: Profile | null;
  isAdmin: boolean;
  authMode: "supabase-google" | "local";
}> {
  const state = loadDatabase();

  // Check if a live Supabase Google OAuth session exists
  try {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.email) {
        const profile = ensureGoogleUserInDb(
          state,
          data.user.email,
          data.user.user_metadata?.full_name || data.user.user_metadata?.name
        );
        return {
          state,
          user: profile,
          isAdmin: isUserAdmin(state, profile.email),
          authMode: "supabase-google",
        };
      }
    }
  } catch {
    // Fall back cleanly to local session
  }

  const localUser = getActiveUser(state);
  return {
    state,
    user: localUser,
    isAdmin: isUserAdmin(state, localUser?.email),
    authMode: "local",
  };
}
