import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { signSession, verifySecret } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Enter a valid email and password." }, { status: 400 });
  const email = input.data.email.toLowerCase();
  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] || "local").trim().slice(0, 80);
  const key = crypto.createHash("sha256").update(`${email}:${ip}`).digest("hex");
  const limit = rateLimit(`login:${key}`, 8, 15 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Too many sign-in attempts. Wait a few minutes and try again." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });

  const user = await db.user.findUnique({ where: { email } });
  const valid = user ? await verifySecret(input.data.password, user.passwordHash) : false;
  if (!user || !valid) return Response.json({ error: "Invalid email or password." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set("awg_session", await signSession(user.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7, path: "/" });
  return response;
}
