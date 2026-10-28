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
    const demoAgents = await db.agent.findMany({
      where: { userId: user.id, description: "Seeded agent for the simulator" },
      include: { mandates: { where: { id: parsed.data.mandateId }, include: { policy: true } } },
      orderBy: { createdAt: "desc" },
    });
    const agent = demoAgents.find((item) => item.status === "ACTIVE" && item.mandates.length > 0);
    if (!agent) {
      const code = demoAgents.some((item) => item.status === "PAUSED") ? "DEMO_AGENT_PAUSED" : demoAgents.some((item) => item.status === "REVOKED") ? "DEMO_AGENT_REVOKED" : demoAgents.length ? "DEMO_MANDATE_INACTIVE" : "DEMO_AGENT_MISSING";
      const error = code === "DEMO_AGENT_PAUSED" ? "The demo agent is paused. Resume it in Agents before running simulator scenarios." : code === "DEMO_AGENT_REVOKED" ? "The demo agent was revoked. Create a replacement to continue the simulator." : code === "DEMO_MANDATE_INACTIVE" ? "The demo mandate is missing or expired. Repair the demo setup before continuing." : "The demo agent is not set up for this wallet. Repair the demo setup before continuing.";
      return Response.json({ error, code }, { status: 409 });
    }
    const demoMandate = agent.mandates[0];
    if (!demoMandate || demoMandate.expiresAt <= new Date() || !demoMandate.policy) return Response.json({ error: "The demo mandate is missing, expired, or has no policy. Repair the demo setup before continuing.", code: "DEMO_MANDATE_INACTIVE" }, { status: 409 });
    const result = await processPaymentRequest(user.id, agent.id, parsed.data, "simulator");
    return Response.json(result.request, { status: result.status });
  } catch (error) { return errorResponse(error); }
}
