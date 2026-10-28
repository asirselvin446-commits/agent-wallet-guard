import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
import { hashApiKey, randomApiKey } from "@/lib/security";
import { appendAudit } from "@/lib/audit";
import { z } from "zod";

export async function GET() {
  try {
    const user = await requireUser();
    const agents = await db.agent.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, description: true, status: true, createdAt: true, mandates: { select: { id: true, expiresAt: true, policy: true } } },
      orderBy: { createdAt: "desc" },
    });
    return Response.json(agents);
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(240).optional() }).parse(await request.json());
    const apiKey = randomApiKey();
    const agent = await db.agent.create({ data: { ...input, userId: user.id, apiKeyHash: hashApiKey(apiKey) }, select: { id: true, name: true, description: true, status: true, createdAt: true } });
    try { await appendAudit(user.id, "AGENT_CREATED", { agentId: agent.id, name: agent.name }); }
    catch (error) { await db.agent.delete({ where: { id: agent.id } }).catch(() => undefined); throw error; }
    return Response.json({ agent, apiKey }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
