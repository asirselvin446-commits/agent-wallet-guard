import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(); const { id } = await context.params;
    const request = await db.paymentRequest.findFirst({ where: { id, mandate: { userId: user.id } } });
    if (!request) return Response.json({ error: "Payment request not found" }, { status: 404 });
    if (request.decision !== "NEEDS_USER_APPROVAL" || request.status !== "APPROVAL_REQUIRED") return Response.json({ error: "This request is no longer waiting for approval" }, { status: 409 });
    const reasons = [...(request.reasons as string[]), "User rejected the request"];
    await db.$transaction(async (tx) => {
      await tx.paymentRequest.update({ where: { id }, data: { status: "REJECTED", decision: "BLOCKED", reasons } });
      await tx.decision.update({ where: { paymentRequestId: id }, data: { status: "BLOCKED", reasons } });
    });
    await appendAudit(user.id, "USER_REJECTED", { requestId: id });
    return Response.json({ ok: true, message: "Payment request rejected." });
  } catch (error) { return errorResponse(error); }
}
