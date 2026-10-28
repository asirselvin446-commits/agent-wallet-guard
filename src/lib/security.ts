import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import crypto from "node:crypto";

const secret = new TextEncoder().encode(process.env.MANDATE_SIGNING_SECRET || "dev-secret-change-me");

export async function hashSecret(value: string) { return bcrypt.hash(value, 12); }
export async function verifySecret(value: string, hash: string) { return bcrypt.compare(value, hash); }
export function randomApiKey() { return `awg_${crypto.randomBytes(24).toString("hex")}`; }
export function hashApiKey(key: string) { return crypto.createHash("sha256").update(key).digest("hex"); }
export async function signMandate(payload: Record<string, unknown>) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(payload.exp as number).sign(secret);
}
export async function verifyMandate(token: string) { return jwtVerify(token, secret); }
export async function signSession(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);
}
export async function readSession(token: string) {
  try { return (await jwtVerify(token, secret)).payload.userId as string; } catch { return null; }
}
