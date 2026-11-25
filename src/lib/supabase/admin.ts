import { createClient } from "@supabase/supabase-js";

// Server-only Supabase admin client (NFR-1: SUPABASE_SECRET_KEY is never exposed to browser)
export function createSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) return null;

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export interface SupabaseHealthStatus {
  configured: boolean;
  reachable: boolean;
  schemaReady: boolean;
  projectUrl: string | null;
  jwksVerified: boolean;
  note: string;
}

export async function checkSupabaseHealth(): Promise<SupabaseHealthStatus> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null;
  const jwksUrl = process.env.SUPABASE_JWKS_URL || (url ? `${url}/auth/v1/.well-known/jwks.json` : null);
  const admin = createSupabaseAdminClient();

  if (!url || !admin) {
    return {
      configured: false,
      reachable: false,
      schemaReady: false,
      projectUrl: url,
      jwksVerified: false,
      note: "Running with local persistent store. Add Supabase env vars to enable cloud sync.",
    };
  }

  let jwksVerified = false;
  let reachable = false;
  try {
    if (jwksUrl) {
      const res = await fetch(jwksUrl, { cache: "no-store" });
      if (res.ok) {
        reachable = true;
        jwksVerified = true;
      }
    }
  } catch {
    reachable = false;
  }

  let schemaReady = false;
  try {
    const { error } = await admin.from("profiles").select("user_id").limit(1);
    if (!error) {
      reachable = true;
      schemaReady = true;
    } else if (error.code === "42P01" || error.message.includes("does not exist") || error.message.includes("schema cache")) {
      reachable = true;
      schemaReady = false;
    }
  } catch {
    schemaReady = false;
  }

  return {
    configured: true,
    reachable,
    schemaReady,
    projectUrl: url,
    jwksVerified,
    note: schemaReady
      ? "Connected to live Supabase project with schema active."
      : reachable
      ? "Supabase connected & JWKS verified. Run supabase/migrations/0001_initial_schema.sql in Supabase SQL Editor to enable Postgres sync; local persistent store is active in the meantime."
      : "Supabase configured but currently unreachable; local persistent store active.",
  };
}
