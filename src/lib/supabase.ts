import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function supabaseUrl() {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ""
  );
}

export function supabasePublishableKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
}

export function supabaseSecretKey() {
  return process.env.SUPABASE_SECRET_KEY?.trim() || "";
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isSupabaseConfigured() {
  return Boolean(
    isHttpUrl(supabaseUrl()) &&
      supabasePublishableKey() &&
      supabaseSecretKey(),
  );
}

async function apiKeyAccepted(path: string, key: string) {
  const url = supabaseUrl().replace(/\/$/, "");
  try {
    const response = await fetch(`${url}${path}`, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return response.status !== 401 && response.status !== 403;
  } catch {
    return false;
  }
}

/** False when URL/keys are missing, malformed, unreachable, or rejected. */
export async function supabaseConnectionOk() {
  if (!isSupabaseConfigured()) return false;
  const [publishableOk, secretOk] = await Promise.all([
    apiKeyAccepted("/auth/v1/settings", supabasePublishableKey()),
    apiKeyAccepted("/rest/v1/", supabaseSecretKey()),
  ]);
  return publishableOk && secretOk;
}

/** Server-only Data API client. Secret key, never a publishable/anon key. */
export function createAdminClient(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = supabaseSecretKey();
  if (!isHttpUrl(url) || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
