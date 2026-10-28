import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
import { provider } from "@/lib/paypal";
import { appendAudit } from "@/lib/audit";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    let request;
    try {
      request = await db.$transaction(async (tx) => {
        const row = await tx.paymentRequest.findFirst({ where: { id, mandate: { userId: user.id } }, include: { payment: true, mandate: { include: { agent: true, policy: true } } } });
        if (!row) throw new Error("REQUEST_NOT_FOUND");
        if (row.payment) return { existing: row.payment, request: row };
        if (row.decision !== "NEEDS_USER_APPROVAL" || row.status !== "APPROVAL_REQUIRED") throw new Error("REQUEST_NOT_PENDING");
        if (row.mandate.agent.status !== "ACTIVE" || row.mandate.expiresAt <= new Date()) throw new Error("MANDATE_NOT_ACTIVE");
        const policy = row.mandate.policy;
        if (!policy) throw new Error("POLICY_MISSING");
        const now = new Date();
        const recent = await tx.paymentRequest.findMany({ where: { agentId: row.agentId, id: { not: row.id }, decision: "APPROVED", status: { in: ["COMPLETED", "PENDING", "APPROVAL_REQUIRED"] }, createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } }, select: { amount: true, createdAt: true } });
        const total = (days: number) => recent.filter((payment) => payment.createdAt >= new Date(now.getTime() - days * 86400000)).reduce((sum, payment) => sum + payment.amount, 0);
        const velocity = await tx.paymentRequest.count({ where: { agentId: row.agentId, id: { not: row.id }, createdAt: { gte: new Date(now.getTime() - 3600000) } } });
        if (total(1) + row.amount > policy.dailyLimit) throw new Error("DAILY_LIMIT_REACHED");
        if (total(7) + row.amount > policy.weeklyLimit) throw new Error("WEEKLY_LIMIT_REACHED");
        if (total(30) + row.amount > policy.monthlyLimit) throw new Error("MONTHLY_LIMIT_REACHED");
        if (velocity >= policy.maxRequestsPerHour) throw new Error("VELOCITY_LIMIT_REACHED");
        const reasons = [...(row.reasons as string[]), "User approved after the policy and spending limits were rechecked"];
        const updated = await tx.paymentRequest.update({ where: { id }, data: { decision: "APPROVED", status: "PENDING", reasons } });
        await tx.decision.update({ where: { paymentRequestId: id }, data: { status: "APPROVED", reasons } });
        return { request: updated, existing: null };
      }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 15000 });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const status = code === "REQUEST_NOT_FOUND" ? 404 : code === "REQUEST_NOT_PENDING" || code === "MANDATE_NOT_ACTIVE" || code.endsWith("_LIMIT_REACHED") ? 409 : 400;
      if (code === "MANDATE_NOT_ACTIVE") return Response.json({ error: "This request's agent is inactive or its mandate has expired. Resume the agent and issue a new mandate, then submit a new request." }, { status });
      if (["REQUEST_NOT_FOUND", "REQUEST_NOT_PENDING", "DAILY_LIMIT_REACHED", "WEEKLY_LIMIT_REACHED", "MONTHLY_LIMIT_REACHED", "VELOCITY_LIMIT_REACHED"].includes(code)) return Response.json({ error: code.replaceAll("_", " ").toLowerCase() }, { status });
      throw error;
    }
    if (request.existing) return Response.json({ payment: request.existing, message: "This request already has a payment attempt." });
    try { await appendAudit(user.id, "USER_APPROVED", { requestId: id, amount: request.request.amount, currency: request.request.currency, merchantName: request.request.merchantName }); }
    catch { await db.paymentRequest.update({ where: { id }, data: { status: "FAILED" } }); return Response.json({ error: "Approval could not be recorded in the audit trail, so no payment was sent." }, { status: 503 }); }
    let payment;
    try {
      payment = await provider().execute({ amount: request.request.amount, currency: request.request.currency, merchantName: request.request.merchantName, merchantEmail: request.request.merchantPayPalEmail || undefined, idempotencyKey: request.request.idempotencyKey });
    } catch (error) {
      await db.paymentRequest.update({ where: { id }, data: { status: "FAILED" } });
      await appendAudit(user.id, "PAYPAL_ERROR", { requestId: id, error: error instanceof Error ? error.message : "Payment provider failed" }).catch(() => undefined);
      return Response.json({ error: "Payment provider failed safely. No successful transfer was confirmed." }, { status: 502 });
    }
    await db.$transaction(async (tx) => {
      await tx.payment.create({ data: { paymentRequestId: id, paypalId: payment.paypalId, approvalUrl: payment.approvalUrl, status: payment.status, result: payment.result as object } });
      await tx.paymentRequest.update({ where: { id }, data: { status: payment.status } });
    });
    await appendAudit(user.id, "PAYPAL_RESULT", { requestId: id, status: payment.status, paypalId: payment.paypalId, result: payment.result ?? null });
    return Response.json({ ...payment, message: "Payment approved." });
  } catch (error) { return errorResponse(error); }
}
