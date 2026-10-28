import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
import { provider } from "@/lib/paypal";
import { appendAudit } from "@/lib/audit";
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireUser(); const { id } = await context.params; const request = await db.paymentRequest.findFirst({ where: { id, mandate: { userId: user.id } }, include: { mandate: true } }); if (!request) return Response.json({ error: "Not found" }, { status: 404 }); const payment = await provider().execute({ amount: request.amount, currency: request.currency, merchantName: request.merchantName, merchantEmail: request.merchantPayPalEmail || undefined, idempotencyKey: request.idempotencyKey }); await db.paymentRequest.update({ where: { id }, data: { status: payment.status, decision: "APPROVED" } }); await db.payment.create({ data: { paymentRequestId: id, paypalId: payment.paypalId, approvalUrl: payment.approvalUrl, status: payment.status, result: payment.result as object } }); await appendAudit(user.id, "USER_APPROVED", { requestId: id }); return Response.json(payment); } catch (e) { return errorResponse(e); }
}
