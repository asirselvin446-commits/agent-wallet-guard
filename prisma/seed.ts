import { PrismaClient } from "@prisma/client";
import { hashSecret, signMandate, hashApiKey } from "../src/lib/security";
const db = new PrismaClient();
async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "demo-password");
  if (!password || (process.env.NODE_ENV === "production" && password.length < 12)) throw new Error("Set an ADMIN_PASSWORD of at least 12 characters before seeding a production database.");
  const agentKey = process.env.DEMO_AGENT_API_KEY || (process.env.NODE_ENV === "production" ? "" : "demo-agent-key");
  if (!agentKey || (process.env.NODE_ENV === "production" && agentKey.length < 32)) throw new Error("Set a DEMO_AGENT_API_KEY of at least 32 characters before seeding a production database.");
  const passwordHash = await hashSecret(password);
  const user = await db.user.upsert({ where: { email }, update: { passwordHash }, create: { email, name: "Wallet Owner", passwordHash } });
  const existingDemoAgent = await db.agent.findUnique({ where: { id: "demo-agent" }, select: { userId: true, status: true } });
  if (existingDemoAgent && existingDemoAgent.userId !== user.id) throw new Error("The demo agent belongs to a different user than ADMIN_EMAIL. Refusing to change another user's agent.");
  const agent = await db.agent.upsert({
    where: { id: "demo-agent" },
    update: { apiKeyHash: hashApiKey(agentKey), ...(existingDemoAgent?.status === "REVOKED" ? {} : { status: "ACTIVE" as const }) },
    create: { id: "demo-agent", userId: user.id, name: "Demo Shopping Agent", description: "Seeded agent for the simulator", apiKeyHash: hashApiKey(agentKey) },
  });
  const expiresAt = new Date(Date.now() + 30 * 86400000);
  const token = await signMandate({ sub: agent.id, userId: user.id, exp: Math.floor(expiresAt.getTime() / 1000), scope: "spend" });
  const mandate = await db.mandate.upsert({ where: { id: "demo-mandate" }, update: { token, expiresAt }, create: { id: "demo-mandate", userId: user.id, agentId: agent.id, token, expiresAt } });
  await db.policy.upsert({ where: { mandateId: mandate.id }, update: { allowedMerchantEmails: [process.env.DEMO_MERCHANT_PAYPAL_EMAIL || "merchant@example.com"] }, create: { mandateId: mandate.id, perTransactionCap: 20, dailyLimit: 50, weeklyLimit: 100, monthlyLimit: 300, currency: "USD", allowedMerchants: ["sandbox-store.example"], allowedMerchantEmails: [process.env.DEMO_MERCHANT_PAYPAL_EMAIL || "merchant@example.com"], blockedMerchants: ["giftcards.example"], allowedCategories: ["electronics", "household"], askUserAboveAmount: 15, allowedHours: { start: 8, end: 22 }, maxRequestsPerHour: 20 } });
}
main().finally(() => db.$disconnect());
