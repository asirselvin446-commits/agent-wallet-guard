import { afterEach, describe, expect, it, vi } from "vitest";
import { provider } from "./paypal";

afterEach(() => vi.unstubAllEnvs());

describe("PayPal provider", () => {
  it("returns an explicitly labeled pending simulation when local Sandbox credentials are absent", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PAYMENT_MODE", "payouts");
    vi.stubEnv("PAYPAL_CLIENT_ID", "");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "");
    vi.stubEnv("ALLOW_SIMULATED_PAYMENTS", "false");
    const result = await provider().execute({ amount: 12, currency: "USD", merchantName: "demo shop", merchantEmail: "merchant@example.com", idempotencyKey: "demo-key-0001" });
    expect(result.status).toBe("PENDING");
    expect(result.result).toMatchObject({ environment: "SIMULATED" });
  });

  it("refuses a live PayPal endpoint before making a network call", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PAYMENT_MODE", "payouts");
    vi.stubEnv("PAYPAL_CLIENT_ID", "sandbox-client");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "sandbox-secret");
    vi.stubEnv("PAYPAL_BASE_URL", "https://api-m.paypal.com");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(provider().execute({ amount: 12, currency: "USD", merchantName: "demo shop", merchantEmail: "merchant@example.com", idempotencyKey: "demo-key-0002" })).rejects.toThrow("Live endpoints are disabled");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("requires an explicit production flag for simulated payments", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_MODE", "orders");
    vi.stubEnv("PAYPAL_CLIENT_ID", "");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "");
    vi.stubEnv("ALLOW_SIMULATED_PAYMENTS", "false");
    await expect(provider().execute({ amount: 12, currency: "USD", merchantName: "demo shop", idempotencyKey: "demo-key-0003" })).rejects.toThrow("credentials are required");
  });
});
