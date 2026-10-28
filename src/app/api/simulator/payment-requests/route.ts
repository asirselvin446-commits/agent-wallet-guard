import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
import { paymentRequestSchema, processPaymentRequest } from "@/lib/payment-requests";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const limit = rateLimit(`simulator:${user.id}`, 20, 60_000);
    if (!limit.allowed) return Response.json({ error: "Too many simulator requests. Retry shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
    const parsed = paymentRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid payment request", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    const agent = await db.agent.findFirst({ where: { id: "demo-agent", userId: user.id, status: "ACTIVE" }, select: { id: true } });
    if (!agent) return Response.json({ error: "The active demo agent is unavailable. Run the database seed command." }, { status: 409 });
    const result = await processPaymentRequest(user.id, agent.id, parsed.data, "simulator");
    return Response.json(result.request, { status: result.status });
  } catch (error) { return errorResponse(error); }
}
