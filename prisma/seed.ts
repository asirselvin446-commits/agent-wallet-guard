import { PrismaClient } from "@prisma/client";
import { hashSecret, signMandate, hashApiKey } from "../src/lib/security";
const db = new PrismaClient();
async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const user = await db.user.upsert({ where: { email }, update: {}, create: { email, name: "Wallet Owner", passwordHash: await hashSecret(process.env.ADMIN_PASSWORD || "demo-password") } });
  const agent = await db.agent.upsert({ where: { id: "demo-agent" }, update: {}, create: { id: "demo-agent", userId: user.id, name: "Demo Shopping Agent", description: "Seeded agent for the simulator", apiKeyHash: hashApiKey(process.env.DEMO_AGENT_API_KEY || "demo-agent-key") } });
  const expiresAt = new Date(Date.now() + 30 * 86400000);
  const token = await signMandate({ sub: agent.id, userId: user.id, exp: Math.floor(expiresAt.getTime() / 1000), scope: "spend" });
  const mandate = await db.mandate.upsert({ where: { id: "demo-mandate" }, update: { token, expiresAt }, create: { id: "demo-mandate", userId: user.id, agentId: agent.id, token, expiresAt } });
  await db.policy.upsert({ where: { mandateId: mandate.id }, update: {}, create: { mandateId: mandate.id, perTransactionCap: 20, dailyLimit: 50, weeklyLimit: 100, monthlyLimit: 300, currency: "USD", allowedMerchants: ["sandbox-store.example"], blockedMerchants: ["giftcards.example"], allowedCategories: ["electronics", "household"], askUserAboveAmount: 15, allowedHours: { start: 8, end: 22 }, maxRequestsPerHour: 20 } });
}
main().finally(() => db.$disconnect());
