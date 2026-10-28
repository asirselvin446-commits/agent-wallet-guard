import { requireAgent, errorResponse } from "@/lib/api";
import { paymentRequestSchema, processPaymentRequest } from "@/lib/payment-requests";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 80);
    const ingressLimit = rateLimit(`agent-ingress:${ip}`, 120, 60_000);
    if (!ingressLimit.allowed) return Response.json({ error: "Too many requests. Retry shortly." }, { status: 429, headers: { "retry-after": String(ingressLimit.retryAfterSeconds) } });
    const agent = await requireAgent(request);
    const limit = rateLimit(`agent-payments:${agent.id}`, 30, 60_000);
    if (!limit.allowed) return Response.json({ error: "Too many payment requests. Retry shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
    const parsed = paymentRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid payment request", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    const result = await processPaymentRequest(agent.userId, agent.id, parsed.data, "agent");
    return Response.json(result.request, { status: result.status });
  } catch (error) { return errorResponse(error); }
}
