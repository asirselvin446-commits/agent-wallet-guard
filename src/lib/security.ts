import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import crypto from "node:crypto";

function signingSecret() {
  const value = process.env.MANDATE_SIGNING_SECRET;
  if (!value && process.env.NODE_ENV === "production") throw new Error("MANDATE_SIGNING_SECRET must be configured in production.");
  if (process.env.NODE_ENV === "production" && (value?.length ?? 0) < 32) throw new Error("MANDATE_SIGNING_SECRET must contain at least 32 characters in production.");
  return new TextEncoder().encode(value || "dev-secret-change-me");
}

export async function hashSecret(value: string) { return bcrypt.hash(value, 12); }
export async function verifySecret(value: string, hash: string) { return bcrypt.compare(value, hash); }
export function randomApiKey() { return `awg_${crypto.randomBytes(24).toString("hex")}`; }
export function hashApiKey(key: string) { return crypto.createHash("sha256").update(key).digest("hex"); }
export async function signMandate(payload: Record<string, unknown>) {
  return new SignJWT({ ...payload, typ: "mandate" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(payload.exp as number).sign(signingSecret());
}
export async function verifyMandate(token: string) { return jwtVerify(token, signingSecret(), { algorithms: ["HS256"] }); }
export async function signSession(userId: string) {
  return new SignJWT({ userId, typ: "session" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(signingSecret());
}
export async function readSession(token: string) {
  try {
    const payload = (await jwtVerify(token, signingSecret(), { algorithms: ["HS256"] })).payload;
    return payload.typ === "session" && typeof payload.userId === "string" ? payload.userId : null;
  } catch { return null; }
}
