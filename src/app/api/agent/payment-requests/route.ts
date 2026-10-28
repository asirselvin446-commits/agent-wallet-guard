import { db } from "@/lib/db";
import { requireAgent, errorResponse } from "@/lib/api";
import { evaluate } from "@/lib/decision";
import { appendAudit } from "@/lib/audit";
import { provider } from "@/lib/paypal";
import { z } from "zod";
const schema = z.object({ mandateId: z.string(), merchantName: z.string().min(1), merchantPayPalEmail: z.string().email().optional(), amount: z.number().positive(), currency: z.string().length(3), category: z.string().min(1), userInstruction: z.string().min(1), agentReasoning: z.string().min(1), idempotencyKey: z.string().min(8) });
export async function POST(request: Request) {
  try {
    const agent = await requireAgent(request);
    const input = schema.parse(await request.json());
    const prior = await db.paymentRequest.findUnique({ where: { agentId_idempotencyKey: { agentId: agent.id, idempotencyKey: input.idempotencyKey } }, include: { payment: true } });
    if (prior) return Response.json(prior);
    const result = await evaluate({ ...input, agentId: agent.id });
    const created = await db.paymentRequest.create({ data: { ...input, agentId: agent.id, decision: result.status, reasons: result.reasons, llmResult: result.llmResult as object, status: result.status === "BLOCKED" ? "REJECTED" : result.status === "NEEDS_USER_APPROVAL" ? "APPROVAL_REQUIRED" : "PENDING" } });
    await db.decision.create({ data: { paymentRequestId: created.id, status: result.status, reasons: result.reasons } });
    await appendAudit(agent.userId, "PAYMENT_REQUESTED", { requestId: created.id, decision: result.status, reasons: result.reasons });
    if (result.status === "APPROVED") {
      try {
        const payment = await provider().execute(input);
        await db.payment.create({ data: { paymentRequestId: created.id, paypalId: payment.paypalId, approvalUrl: payment.approvalUrl, status: payment.status, result: payment.result as object } });
        await db.paymentRequest.update({ where: { id: created.id }, data: { status: payment.status } });
        await appendAudit(agent.userId, "PAYPAL_RESULT", { requestId: created.id, status: payment.status, paypalId: payment.paypalId });
      } catch (error) {
        await db.paymentRequest.update({ where: { id: created.id }, data: { status: "FAILED" } });
        await appendAudit(agent.userId, "PAYPAL_ERROR", { requestId: created.id, error: error instanceof Error ? error.message : "unknown" });
      }
    }
    return Response.json(await db.paymentRequest.findUnique({ where: { id: created.id }, include: { payment: true } }), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
