import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(); const { id } = await context.params;
    const result = await db.agent.updateMany({ where: { id, userId: user.id, status: "PAUSED" }, data: { status: "ACTIVE" } });
    if (!result.count) return Response.json({ error: "Paused agent not found" }, { status: 404 });
    await appendAudit(user.id, "AGENT_RESUMED", { agentId: id });
    return Response.json({ ok: true, message: "Agent resumed." });
  } catch (error) { return errorResponse(error); }
}
