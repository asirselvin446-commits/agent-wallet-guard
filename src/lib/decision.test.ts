import { beforeEach, describe, expect, it, vi } from "vitest";

const { agentFindUnique, requestFindMany, requestCount, verifyMandate } = vi.hoisted(() => ({
  agentFindUnique: vi.fn(), requestFindMany: vi.fn(), requestCount: vi.fn(), verifyMandate: vi.fn(),
}));
vi.mock("./db", () => ({ db: { agent: { findUnique: agentFindUnique }, paymentRequest: { findMany: requestFindMany, count: requestCount } } }));
vi.mock("./security", () => ({ verifyMandate }));

import { evaluate } from "./decision";

const policy = {
  perTransactionCap: 20, dailyLimit: 50, weeklyLimit: 100, monthlyLimit: 300, currency: "USD",
  allowedMerchants: ["sandbox-store.example"], allowedMerchantEmails: ["merchant@example.com"], blockedMerchants: ["giftcards.example"],
  allowedCategories: ["electronics"], askUserAboveAmount: 15, allowedHours: null, maxRequestsPerHour: 20,
};

beforeEach(() => {
  vi.stubEnv("PAYMENT_MODE", "payouts");
  vi.stubEnv("GEMINI_API_KEY", "");
  agentFindUnique.mockResolvedValue({ id: "agent-1", userId: "owner-1", status: "ACTIVE", mandates: [{ userId: "owner-1", expiresAt: new Date(Date.now() + 86400000), token: "signed-token", policy }] });
  verifyMandate.mockResolvedValue({ payload: { typ: "mandate", sub: "agent-1", userId: "owner-1", scope: "spend" } });
  requestFindMany.mockResolvedValue([]);
  requestCount.mockResolvedValue(0);
});

describe("payment decision engine", () => {
  it("blocks an amount above the hard per-transaction cap before any LLM call", async () => {
    const result = await evaluate({ agentId: "agent-1", mandateId: "mandate-1", merchantName: "sandbox-store.example", merchantPayPalEmail: "merchant@example.com", amount: 45, currency: "USD", category: "electronics", userInstruction: "Buy a case", agentReasoning: "The case is $45." });
    expect(result.status).toBe("BLOCKED");
    expect(result.reasons.at(-1)).toContain("per-transaction cap");
    expect(requestFindMany).not.toHaveBeenCalled();
  });

  it("blocks payout recipient substitution even when the merchant name is allowlisted", async () => {
    const result = await evaluate({ agentId: "agent-1", mandateId: "mandate-1", merchantName: "sandbox-store.example", merchantPayPalEmail: "attacker@example.com", amount: 12, currency: "USD", category: "electronics", userInstruction: "Buy a case", agentReasoning: "The case is $12." });
    expect(result.status).toBe("BLOCKED");
    expect(result.reasons.at(-1)).toContain("recipient is not on the mandate allowlist");
  });

  it("routes an otherwise permitted request to a human if the LLM is unavailable", async () => {
    const result = await evaluate({ agentId: "agent-1", mandateId: "mandate-1", merchantName: "SANDBOX-STORE.EXAMPLE", merchantPayPalEmail: "Merchant@Example.com", amount: 12, currency: "usd", category: "Electronics", userInstruction: "Buy a case", agentReasoning: "The case matches the request." });
    expect(result.status).toBe("NEEDS_USER_APPROVAL");
    expect(result.reasons.at(-1)).toContain("fail-safe");
    expect(requestFindMany).toHaveBeenCalledOnce();
  });
});
