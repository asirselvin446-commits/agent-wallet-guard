import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
import { provider } from "@/lib/paypal";
import { appendAudit } from "@/lib/audit";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const payment = await db.payment.findFirst({ where: { id, paymentRequest: { mandate: { userId: user.id } } }, include: { paymentRequest: true } });
    if (!payment) return Response.json({ error: "Payment not found" }, { status: 404 });
    if (!payment.paypalId || payment.paypalId.startsWith("SIM-")) return Response.json({ payment, message: "This is a local simulation; no PayPal status exists." });
    if (payment.status === "COMPLETED" || payment.status === "FAILED") return Response.json({ payment, message: "Payment is already in a final state." });
    const activeProvider = provider();
    const refreshStatus = activeProvider.status;
    if (!refreshStatus) return Response.json({ error: "Status refresh is unavailable for this payment mode." }, { status: 409 });
    const result = await refreshStatus.call(activeProvider, payment.paypalId);
    await db.payment.update({ where: { id }, data: { status: result.status, result: result.result as object } });
    await db.paymentRequest.update({ where: { id: payment.paymentRequestId }, data: { status: result.status } });
    await appendAudit(user.id, "PAYPAL_STATUS_REFRESHED", { requestId: payment.paymentRequestId, paypalId: payment.paypalId, status: result.status });
    return Response.json({ ...result, message: `PayPal Sandbox status: ${result.status.toLowerCase()}.` });
  } catch (error) { return errorResponse(error); }
}
