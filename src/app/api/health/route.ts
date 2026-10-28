import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, service: "agent-wallet-guard", database: "connected" });
  } catch {
    return Response.json({ ok: false, service: "agent-wallet-guard", database: "unavailable" }, { status: 503 });
  }
}
