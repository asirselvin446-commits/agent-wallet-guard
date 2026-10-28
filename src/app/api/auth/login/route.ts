import { db } from "@/lib/db";
import { signSession, verifySecret } from "@/lib/security";
import { NextResponse } from "next/server";
export async function POST(request: Request) {
  const { email, password } = await request.json();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifySecret(password, user.passwordHash))) return Response.json({ error: "Invalid credentials" }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set("awg_session", await signSession(user.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7, path: "/" });
  return response;
}
