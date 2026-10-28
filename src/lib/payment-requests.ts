import { z } from "zod";
import { db } from "./db";
import { evaluate, type Result } from "./decision";
import { appendAudit } from "./audit";
import { provider } from "./paypal";

export const paymentRequestSchema = z.object({
  mandateId: z.string().min(1).max(128), merchantName: z.string().trim().min(1).max(160),
  merchantPayPalEmail: z.string().trim().email().max(254).optional(),
  amount: z.number().positive().finite().max(1000000), currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  category: z.string().trim().min(1).max(80), userInstruction: z.string().trim().min(1).max(1000),
  agentReasoning: z.string().trim().min(1).max(1000), idempotencyKey: z.string().min(8).max(38).regex(/^[A-Za-z0-9_-]+$/),
});
export type PaymentRequestInput = z.infer<typeof paymentRequestSchema>;

export async function processPaymentRequest(userId: string, agentId: string, input: PaymentRequestInput, source: "agent" | "simulator") {
  const prior = await db.paymentRequest.findUnique({ where: { agentId_idempotencyKey: { agentId, idempotencyKey: input.idempotencyKey } }, include: { payment: true } });
  if (prior) return { status: 200, request: prior };

  let result: Result = await evaluate({ ...input, agentId });
  let created;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      created = await db.$transaction(async (tx) => {
        // Recheck wallet state and limits in a serializable transaction. This
        // reserves the approved request before another concurrent request can
        // pass the same remaining balance.
        const agent = await tx.agent.findFirst({ where: { id: agentId, userId, status: "ACTIVE" }, include: { mandates: { where: { id: input.mandateId }, include: { policy: true } } } });
        const mandate = agent?.mandates[0];
        const policy = mandate?.policy;
        if (!agent || !mandate || mandate.expiresAt <= new Date()) result = { status: "BLOCKED", reasons: [...result.reasons, "Blocked: Agent or mandate changed before payment reservation"] };
        else if (!policy) result = { status: "BLOCKED", reasons: [...result.reasons, "Blocked: Mandate policy was removed before payment reservation"] };
        else {
          const now = new Date();
          const recent = await tx.paymentRequest.findMany({ where: { agentId, decision: "APPROVED", status: { in: ["COMPLETED", "PENDING", "APPROVAL_REQUIRED"] }, createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } }, select: { amount: true, createdAt: true } });
          const total = (days: number) => recent.filter((row) => row.createdAt >= new Date(now.getTime() - days * 86400000)).reduce((sum, row) => sum + row.amount, 0);
          const currentCount = await tx.paymentRequest.count({ where: { agentId, createdAt: { gte: new Date(now.getTime() - 3600000) } } });
          if (result.status !== "BLOCKED" && total(1) + input.amount > policy.dailyLimit) result = { status: "BLOCKED", reasons: [...result.reasons, "Blocked: Daily spending limit was reached by another request"] };
          else if (result.status !== "BLOCKED" && total(7) + input.amount > policy.weeklyLimit) result = { status: "BLOCKED", reasons: [...result.reasons, "Blocked: Weekly spending limit was reached by another request"] };
          else if (result.status !== "BLOCKED" && total(30) + input.amount > policy.monthlyLimit) result = { status: "BLOCKED", reasons: [...result.reasons, "Blocked: Monthly spending limit was reached by another request"] };
          else if (result.status !== "BLOCKED" && currentCount >= policy.maxRequestsPerHour) result = { status: "BLOCKED", reasons: [...result.reasons, "Blocked: Hourly request limit was reached by another request"] };
        }
        const status = result.status === "BLOCKED" ? "REJECTED" : result.status === "NEEDS_USER_APPROVAL" ? "APPROVAL_REQUIRED" : "PENDING";
        const row = await tx.paymentRequest.create({ data: { ...input, agentId, decision: result.status, reasons: result.reasons, llmResult: result.llmResult as object, status } });
        await tx.decision.create({ data: { paymentRequestId: row.id, status: result.status, reasons: result.reasons } });
        return row;
      }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 15000 });
      break;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2002") {
        const concurrent = await db.paymentRequest.findUnique({ where: { agentId_idempotencyKey: { agentId, idempotencyKey: input.idempotencyKey } }, include: { payment: true } });
        if (concurrent) return { status: 200, request: concurrent };
      }
      if (code !== "P2034" || attempt === 2) throw error;
      result = await evaluate({ ...input, agentId });
    }
  }
  if (!created) throw new Error("Payment request could not be reserved");

  try {
    await appendAudit(userId, "PAYMENT_REQUESTED", { requestId: created.id, source, merchantName: input.merchantName, merchantPayPalEmail: input.merchantPayPalEmail, amount: input.amount, currency: input.currency, category: input.category, userInstruction: input.userInstruction, agentReasoning: input.agentReasoning, decision: result.status, reasons: result.reasons, llmResult: result.llmResult ?? null });
  } catch (error) {
    await db.paymentRequest.update({ where: { id: created.id }, data: { status: "FAILED" } });
    throw error;
  }

  if (result.status === "APPROVED") {
    let payment;
    try {
      payment = await provider().execute({ amount: input.amount, currency: input.currency, merchantName: input.merchantName, merchantEmail: input.merchantPayPalEmail, idempotencyKey: input.idempotencyKey });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payment provider failed";
      await db.paymentRequest.update({ where: { id: created.id }, data: { status: "FAILED", reasons: [...result.reasons, `Payment failed safely: ${message}`] } });
      await appendAudit(userId, "PAYPAL_ERROR", { requestId: created.id, error: message }).catch(() => undefined);
      return { status: 201, request: await db.paymentRequest.findUnique({ where: { id: created.id }, include: { payment: true } }) };
    }
    await db.$transaction(async (tx) => {
      await tx.payment.create({ data: { paymentRequestId: created.id, paypalId: payment.paypalId, approvalUrl: payment.approvalUrl, status: payment.status, result: payment.result as object } });
      await tx.paymentRequest.update({ where: { id: created.id }, data: { status: payment.status } });
    });
    await appendAudit(userId, "PAYPAL_RESULT", { requestId: created.id, status: payment.status, paypalId: payment.paypalId, result: payment.result ?? null });
  }
  const request = await db.paymentRequest.findUnique({ where: { id: created.id }, include: { payment: true } });
  return { status: 201, request };
}
