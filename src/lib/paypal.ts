export type PaymentInput = { amount: number; currency: string; merchantName: string; merchantEmail?: string; idempotencyKey: string };
export type ProviderResult = { status: "COMPLETED" | "APPROVAL_REQUIRED" | "PENDING" | "FAILED"; paypalId?: string; approvalUrl?: string; result?: unknown };
export interface PaymentProvider {
  execute(input: PaymentInput): Promise<ProviderResult>;
  capture?(orderId: string): Promise<ProviderResult>;
  status?(paypalId: string): Promise<ProviderResult>;
}

function baseUrl() {
  const raw = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== "api-m.sandbox.paypal.com" || url.port || url.username || url.password || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    throw new Error("PayPal is restricted to https://api-m.sandbox.paypal.com. Live endpoints are disabled.");
  }
  return "https://api-m.sandbox.paypal.com";
}

function credentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal Sandbox credentials are not configured.");
  return { clientId, clientSecret };
}

async function token() {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof data !== "object" || data === null || !("access_token" in data) || typeof data.access_token !== "string") throw new Error(`PayPal Sandbox authentication failed (${response.status}).`);
  return data.access_token;
}

async function paypalJson(path: string, init: RequestInit = {}) {
  const accessToken = await token();
  const response = await fetch(`${baseUrl()}${path}`, { ...init, signal: init.signal ?? AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers } });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const issue = typeof data === "object" && data !== null && "name" in data && typeof data.name === "string" ? data.name : "request failed";
    throw new Error(`PayPal Sandbox ${issue} (${response.status}).`);
  }
  return data as Record<string, unknown>;
}

class SimulatedProvider implements PaymentProvider {
  async execute(input: PaymentInput): Promise<ProviderResult> {
    if (process.env.ALLOW_SIMULATED_PAYMENTS !== "true" && process.env.NODE_ENV === "production") throw new Error("PayPal Sandbox credentials are required. Enable ALLOW_SIMULATED_PAYMENTS=true only for an explicitly labeled demo.");
    return { status: "PENDING", paypalId: `SIM-${input.idempotencyKey}`, result: { environment: "SIMULATED", message: "No PayPal API call was made. Configure Sandbox credentials to transfer funds." } };
  }
}

class PayoutsProvider implements PaymentProvider {
  async execute(input: PaymentInput): Promise<ProviderResult> {
    if (!input.merchantEmail) throw new Error("A PayPal recipient email is required for a payout.");
    const data = await paypalJson("/v1/payments/payouts", {
      method: "POST", headers: { "PayPal-Request-Id": input.idempotencyKey },
      body: JSON.stringify({ sender_batch_header: { sender_batch_id: input.idempotencyKey, email_subject: "Agent Wallet Guard Sandbox payment" }, items: [{ recipient_type: "EMAIL", amount: { value: input.amount.toFixed(2), currency: input.currency }, receiver: input.merchantEmail, note: input.merchantName }] }),
    });
    const header = typeof data.batch_header === "object" && data.batch_header !== null ? data.batch_header as Record<string, unknown> : {};
    if (typeof header.payout_batch_id !== "string") throw new Error("PayPal Sandbox did not return a payout batch ID.");
    return { status: header.batch_status === "SUCCESS" ? "COMPLETED" : "PENDING", paypalId: header.payout_batch_id, result: data };
  }
  async status(paypalId: string): Promise<ProviderResult> {
    const data = await paypalJson(`/v1/payments/payouts/${encodeURIComponent(paypalId)}`);
    const header = typeof data.batch_header === "object" && data.batch_header !== null ? data.batch_header as Record<string, unknown> : {};
    const status = header.batch_status;
    return { status: status === "SUCCESS" ? "COMPLETED" : status === "DENIED" || status === "CANCELED" ? "FAILED" : "PENDING", paypalId, result: data };
  }
}

class OrdersProvider implements PaymentProvider {
  async execute(input: PaymentInput): Promise<ProviderResult> {
    const appUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
    const data = await paypalJson("/v2/checkout/orders", {
      method: "POST", headers: { "PayPal-Request-Id": input.idempotencyKey },
      body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: input.currency, value: input.amount.toFixed(2) }, description: input.merchantName }], application_context: { return_url: `${appUrl}/api/payments/return`, cancel_url: `${appUrl}/api/payments/cancel` } }),
    });
    const links = Array.isArray(data.links) ? data.links as Array<{ rel?: string; href?: string }> : [];
    const approvalUrl = links.find((link) => link.rel === "approve")?.href;
    if (typeof data.id !== "string" || !approvalUrl) throw new Error("PayPal Sandbox did not return a valid approval link.");
    return { status: "APPROVAL_REQUIRED", paypalId: data.id, approvalUrl, result: data };
  }
  async capture(orderId: string): Promise<ProviderResult> {
    const data = await paypalJson(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", headers: { "PayPal-Request-Id": `capture-${orderId}` }, body: "{}" });
    const status = data.status === "COMPLETED" ? "COMPLETED" : data.status === "VOIDED" ? "FAILED" : "PENDING";
    return { status, paypalId: orderId, result: data };
  }
  async status(orderId: string): Promise<ProviderResult> {
    const data = await paypalJson(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    return { status: data.status === "COMPLETED" ? "COMPLETED" : data.status === "VOIDED" ? "FAILED" : "APPROVAL_REQUIRED", paypalId: orderId, result: data };
  }
}

export function provider(): PaymentProvider {
  const mode = process.env.PAYMENT_MODE || "payouts";
  const hasCredentials = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  if (mode === "orders") return hasCredentials ? new OrdersProvider() : new SimulatedProvider();
  if (mode === "payouts") return hasCredentials ? new PayoutsProvider() : new SimulatedProvider();
  throw new Error("PAYMENT_MODE must be orders or payouts.");
}
