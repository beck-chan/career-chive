"use server";

import { cookies } from "next/headers";
import { clientIp } from "../../lib/clientIp";
import { flags } from "../../lib/flags";
import { verifyPassword } from "../../lib/password";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "../../lib/session";
import {
  createAdminClient,
  supabaseConnectionOk,
} from "../../lib/supabase";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_FAILURES = 3;

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

async function failureCount(
  client: NonNullable<ReturnType<typeof createAdminClient>>,
  column: "ip" | "username",
  value: string,
) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await client
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("attempted_at", since);
  if (error) throw error;
  return count ?? 0;
}

export async function loginAction(
  username: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!flags.private) return { ok: true };

  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    return { ok: false, error: "Login is not configured." };
  }

  const submittedUser = username.trim();
  const submittedPass = password;
  if (!submittedUser || !submittedPass) {
    return { ok: false, error: "Invalid username or password." };
  }

  if (!(await supabaseConnectionOk())) {
    return { ok: false, error: "No database connection." };
  }
  const client = createAdminClient();
  if (!client) {
    return { ok: false, error: "No database connection." };
  }

  const ip = await clientIp();
  const userKey = normalizeUsername(submittedUser);

  try {
    const [ipCount, userCount] = await Promise.all([
      failureCount(client, "ip", ip),
      failureCount(client, "username", userKey),
    ]);
    if (ipCount >= MAX_FAILURES || userCount >= MAX_FAILURES) {
      return {
        ok: false,
        error: "Too many failed login attempts. Try again in an hour.",
      };
    }

    const { data, error } = await client
      .from("settings")
      .select("username, password_hash")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;

    const storedUser = (data?.username ?? "").trim();
    const storedHash = data?.password_hash ?? "";
    const userOk =
      Boolean(storedUser) &&
      normalizeUsername(storedUser) === userKey;
    const passOk = storedHash
      ? await verifyPassword(submittedPass, storedHash)
      : false;

    if (!userOk || !passOk) {
      await client.from("login_attempts").insert({
        ip,
        username: userKey,
      });
      return { ok: false, error: "Invalid username or password." };
    }

    const token = await signSession(storedUser);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, sessionCookieOptions());
    await client.rpc("ensure_generated_days");
    return { ok: true };
  } catch {
    return { ok: false, error: "No database connection." };
  }
}

export async function logoutAction(): Promise<{ ok: true }> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  jar.delete(SESSION_COOKIE);
  return { ok: true };
}
