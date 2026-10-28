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
    const demoAgent = await db.agent.findUnique({ where: { id: "demo-agent" }, select: { id: true, userId: true, status: true } });
    if (!demoAgent) return Response.json({ error: "The demo agent has not been seeded in this database. Run the seed command against the same database used by this app." }, { status: 409 });
    if (demoAgent.userId !== user.id) return Response.json({ error: "The demo agent belongs to a different wallet account. Sign in with the account configured as ADMIN_EMAIL." }, { status: 409 });
    if (demoAgent.status === "PAUSED") return Response.json({ error: "The demo agent is paused. Resume it in Agents before running simulator scenarios." }, { status: 409 });
    if (demoAgent.status === "REVOKED") return Response.json({ error: "The demo agent was revoked and cannot be used in the simulator. Ask the wallet owner to create a new demo agent." }, { status: 409 });
    const agent = demoAgent;
    const result = await processPaymentRequest(user.id, agent.id, parsed.data, "simulator");
    return Response.json(result.request, { status: result.status });
  } catch (error) { return errorResponse(error); }
}
