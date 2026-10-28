import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(); const { id } = await context.params;
    const result = await db.agent.updateMany({ where: { id, userId: user.id, status: { not: "REVOKED" } }, data: { status: "PAUSED" } });
    if (!result.count) return Response.json({ error: "Agent not found or already revoked" }, { status: 404 });
    await appendAudit(user.id, "AGENT_PAUSED", { agentId: id });
    return Response.json({ ok: true, message: "Agent paused." });
  } catch (error) { return errorResponse(error); }
}
