import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
import { signMandate } from "@/lib/security";
import { appendAudit } from "@/lib/audit";

const schema = z.object({
  agentId: z.string().min(1), expiresInDays: z.number().int().min(1).max(365),
  perTransactionCap: z.number().positive(), dailyLimit: z.number().positive(), weeklyLimit: z.number().positive(), monthlyLimit: z.number().positive(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()), allowedMerchants: z.array(z.string().trim().min(1)).max(50),
  allowedMerchantEmails: z.array(z.string().trim().email().toLowerCase()).max(50),
  blockedMerchants: z.array(z.string().trim().min(1)).max(50), allowedCategories: z.array(z.string().trim().min(1)).min(1).max(30),
  askUserAboveAmount: z.number().nonnegative(), maxRequestsPerHour: z.number().int().min(1).max(1000),
  allowedHours: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(1).max(24) }).optional(),
}).refine((value) => value.dailyLimit <= value.weeklyLimit && value.weeklyLimit <= value.monthlyLimit, { message: "Limits must increase from daily to weekly to monthly." });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const agent = await db.agent.findFirst({ where: { id: input.agentId, userId: user.id, status: { not: "REVOKED" } }, select: { id: true, name: true } });
    if (!agent) return Response.json({ error: "Choose an active agent you own." }, { status: 404 });
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86400000);
    const token = await signMandate({ sub: agent.id, userId: user.id, exp: Math.floor(expiresAt.getTime() / 1000), scope: "spend" });
    const { expiresInDays, agentId, ...policyInput } = input;
    const { mandate, supersededCount } = await db.$transaction(async (tx) => {
      const superseded = await tx.mandate.updateMany({ where: { agentId }, data: { expiresAt: new Date() } });
      const created = await tx.mandate.create({ data: { userId: user.id, agentId, token, expiresAt, policy: { create: { ...policyInput, allowedHours: policyInput.allowedHours ?? undefined } } }, select: { id: true, expiresAt: true, agentId: true } });
      return { mandate: created, supersededCount: superseded.count };
    });
    await appendAudit(user.id, "MANDATE_ISSUED", { mandateId: mandate.id, agentId, agentName: agent.name, expiresAt: expiresAt.toISOString(), expiresInDays, supersededCount, policy: policyInput });
    return Response.json({ ...mandate, message: "Mandate issued with the new spending policy." }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
