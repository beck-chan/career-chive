import { cookies } from "next/headers";
import { flags } from "./flags";

export const SESSION_COOKIE = "careerchive_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

type SessionPayload = {
  u: string;
  exp: number;
};

function sessionSecret() {
  return process.env.SESSION_SECRET?.trim() || "";
}

function bytesToB64url(bytes: Uint8Array) {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacSign(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return bytesToB64url(new Uint8Array(sig));
}

function timingEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(username: string) {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured.");
  }
  const payload: SessionPayload = {
    u: username,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  };
  const body = bytesToB64url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

export async function readSessionToken(token: string | undefined) {
  if (!token) return null;
  const secret = sessionSecret();
  if (!secret) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacSign(secret, body);
  if (!timingEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlToBytes(body)),
    ) as SessionPayload;
    if (!payload?.u || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return { username: payload.u };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  const secure =
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.SITE_URL?.startsWith("https://"));
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export async function getSession() {
  if (!flags.private) return { username: "local" };
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Error("Not signed in.");
  }
  return session;
}
