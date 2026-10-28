import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) { try { const user = await requireUser(); const { id } = await context.params; await db.paymentRequest.updateMany({ where: { id, mandate: { userId: user.id } }, data: { status: "REJECTED", decision: "BLOCKED" } }); await appendAudit(user.id, "USER_REJECTED", { requestId: id }); return Response.json({ ok: true }); } catch (e) { return errorResponse(e); } }
