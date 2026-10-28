import { cookies } from "next/headers";
import { db } from "./db";
import { hashApiKey, readSession } from "./security";
import { Prisma } from "@prisma/client";
import { z } from "zod";

export async function requireUser() {
  const token = (await cookies()).get("awg_session")?.value;
  const id = token ? await readSession(token) : null;
  if (!id) throw new Error("UNAUTHORIZED");
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
export async function requireAgent(request: Request) {
  const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!key) throw new Error("UNAUTHORIZED");
  const agent = await db.agent.findFirst({ where: { apiKeyHash: hashApiKey(key) } });
  if (!agent) throw new Error("UNAUTHORIZED");
  return agent;
}
export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: "Invalid request", details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400 });
  if (error instanceof Error && error.message === "UNAUTHORIZED") return Response.json({ error: "Sign in or provide a valid agent key." }, { status: 401 });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return Response.json({ error: "A record with these details already exists." }, { status: 409 });
    if (error.code === "P2025") return Response.json({ error: "The requested record was not found." }, { status: 404 });
  }
  return Response.json({ error: "The request could not be completed. Try again." }, { status: 500 });
}
