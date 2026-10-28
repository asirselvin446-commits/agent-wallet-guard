import { cookies } from "next/headers";
import { db } from "./db";
import { hashApiKey, readSession } from "./security";

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
  const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 400;
  return Response.json({ error: error instanceof Error ? error.message : "Request failed" }, { status });
}
