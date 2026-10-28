import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { hashApiKey, randomApiKey, signMandate } from "@/lib/security";
import { rateLimit } from "@/lib/rate-limit";

const demoDescription = "Seeded agent for the simulator";

export async function POST() {
  try {
    const user = await requireUser();
    const limit = rateLimit(`simulator-repair:${user.id}`, 3, 60_000);
    if (!limit.allowed) return Response.json({ error: "Please wait before repairing the demo setup." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });

    const result = await db.$transaction(async (tx) => {
      const agents = await tx.agent.findMany({
        where: { userId: user.id, description: demoDescription },
        include: { mandates: { include: { policy: true }, orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
      });
      const activeAgent = agents.find((agent) => agent.status === "ACTIVE");
      if (!activeAgent && agents.some((agent) => agent.status === "PAUSED")) throw new Error("DEMO_AGENT_PAUSED");

      let agentId = activeAgent?.id;
      let replaced = false;
      let agentCreated = false;
      if (!agentId) {
        const apiKey = randomApiKey();
        const agent = await tx.agent.create({ data: { userId: user.id, name: "Demo Shopping Agent", description: demoDescription, apiKeyHash: hashApiKey(apiKey) } });
        agentId = agent.id;
        agentCreated = true;
        replaced = agents.some((item) => item.status === "REVOKED");
      }

      const now = new Date();
      const currentMandate = activeAgent?.mandates.find((mandate) => mandate.expiresAt > now && mandate.policy);
      if (currentMandate) return { agentId, mandateId: currentMandate.id, created: false, replaced: false, agentCreated: false };

      const previousPolicy = activeAgent?.mandates.find((mandate) => mandate.policy)?.policy;
      const expiresAt = new Date(now.getTime() + 30 * 86400000);
      const token = await signMandate({ sub: agentId, userId: user.id, exp: Math.floor(expiresAt.getTime() / 1000), scope: "spend" });
      const mandate = await tx.mandate.create({ data: { userId: user.id, agentId, token, expiresAt } });
      await tx.policy.create({
        data: {
          mandateId: mandate.id,
          perTransactionCap: previousPolicy?.perTransactionCap ?? 20,
          dailyLimit: previousPolicy?.dailyLimit ?? 50,
          weeklyLimit: previousPolicy?.weeklyLimit ?? 100,
          monthlyLimit: previousPolicy?.monthlyLimit ?? 300,
          currency: previousPolicy?.currency ?? "USD",
          allowedMerchants: previousPolicy?.allowedMerchants ?? ["sandbox-store.example"],
          allowedMerchantEmails: previousPolicy?.allowedMerchantEmails ?? [process.env.DEMO_MERCHANT_PAYPAL_EMAIL || "merchant@example.com"],
          blockedMerchants: previousPolicy?.blockedMerchants ?? ["giftcards.example"],
          allowedCategories: previousPolicy?.allowedCategories ?? ["electronics", "household"],
          askUserAboveAmount: previousPolicy?.askUserAboveAmount ?? 15,
          allowedHours: previousPolicy?.allowedHours ?? { start: 8, end: 22 },
          maxRequestsPerHour: previousPolicy?.maxRequestsPerHour ?? 20,
        },
      });
      return { agentId, mandateId: mandate.id, created: true, replaced, agentCreated };
    }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 15000 });

    if (result.created) {
      const event = result.replaced ? "DEMO_AGENT_REPLACED" : result.agentCreated ? "DEMO_AGENT_CREATED" : "DEMO_MANDATE_RENEWED";
      await appendAudit(user.id, event, { agentId: result.agentId, mandateId: result.mandateId });
    }
    return Response.json({ agentId: result.agentId, mandateId: result.mandateId, message: result.created ? "The demo agent and its mandate are ready." : "The demo agent is already ready." });
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_AGENT_PAUSED") return Response.json({ error: "The demo agent is paused. Resume it in Agents before running simulator scenarios.", code: error.message }, { status: 409 });
    return errorResponse(error);
  }
}
