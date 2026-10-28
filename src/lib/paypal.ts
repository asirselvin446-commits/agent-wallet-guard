export type PaymentInput = { amount: number; currency: string; merchantName: string; merchantEmail?: string; idempotencyKey: string };
export interface PaymentProvider { execute(input: PaymentInput): Promise<{ status: "COMPLETED" | "APPROVAL_REQUIRED" | "FAILED"; paypalId?: string; approvalUrl?: string; result?: unknown }> }

async function token() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com"}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  if (!response.ok) throw new Error(`PayPal token error ${response.status}`);
  return (await response.json()).access_token as string;
}

class PayoutsProvider implements PaymentProvider {
  async execute(input: PaymentInput) {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET || !input.merchantEmail) return { status: "COMPLETED" as const, paypalId: `demo_payout_${input.idempotencyKey}` };
    const access = await token();
    const response = await fetch(`${process.env.PAYPAL_BASE_URL}/v1/payments/payouts`, { method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json", "PayPal-Request-Id": input.idempotencyKey }, body: JSON.stringify({ sender_batch_header: { sender_batch_id: input.idempotencyKey, email_subject: "Agent Wallet Guard payment" }, items: [{ recipient_type: "EMAIL", amount: { value: input.amount.toFixed(2), currency: input.currency }, receiver: input.merchantEmail, note: input.merchantName }] }) });
    const result = await response.json();
    if (!response.ok) throw new Error(`PayPal payout error ${response.status}`);
    return { status: "COMPLETED" as const, paypalId: result.batch_header?.payout_batch_id, result };
  }
}

class OrdersProvider implements PaymentProvider {
  async execute(input: PaymentInput) {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return { status: "APPROVAL_REQUIRED" as const, paypalId: `demo_order_${input.idempotencyKey}`, approvalUrl: `${process.env.APP_BASE_URL || "http://localhost:3000"}/demo/checkout?request=${input.idempotencyKey}` };
    const access = await token();
    const response = await fetch(`${process.env.PAYPAL_BASE_URL}/v2/checkout/orders`, { method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json", "PayPal-Request-Id": input.idempotencyKey }, body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: input.currency, value: input.amount.toFixed(2) }, description: input.merchantName }], application_context: { return_url: `${process.env.APP_BASE_URL}/api/payments/return`, cancel_url: `${process.env.APP_BASE_URL}/dashboard` } }) });
    const result = await response.json();
    if (!response.ok) throw new Error(`PayPal order error ${response.status}`);
    return { status: "APPROVAL_REQUIRED" as const, paypalId: result.id, approvalUrl: result.links?.find((link: { rel: string }) => link.rel === "approve")?.href, result };
  }
}

export function provider(): PaymentProvider { return process.env.PAYMENT_MODE === "orders" ? new OrdersProvider() : new PayoutsProvider(); }
