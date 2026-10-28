import { db } from "@/lib/db";
import { requireAgent, errorResponse } from "@/lib/api";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const agent = await requireAgent(request); const { id } = await context.params; const item = await db.paymentRequest.findFirst({ where: { id, agentId: agent.id }, include: { payment: true } }); if (!item) return Response.json({ error: "Not found" }, { status: 404 }); return Response.json(item); } catch (error) { return errorResponse(error); }
}
