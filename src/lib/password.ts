import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const SALT_LEN = 16;
const KEY_LEN = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_LEN);
  const key = (await scrypt(password, salt, KEY_LEN)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  if (!stored) return false;
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  try {
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(hashB64, "base64url");
    const actual = (await scrypt(password, salt, expected.length)) as Buffer;
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function sessionKey() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
}

export function encryptPassword(password: string) {
  const key = sessionKey();
  if (!key || !password) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `aes256gcm$${iv.toString("base64url")}$${ciphertext.toString("base64url")}$${tag.toString("base64url")}`;
}

export function decryptPassword(stored: string | null | undefined) {
  const key = sessionKey();
  if (!key || !stored) return "";
  const [scheme, ivB64, dataB64, tagB64] = stored.split("$");
  if (scheme !== "aes256gcm" || !ivB64 || !dataB64 || !tagB64) return "";
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
