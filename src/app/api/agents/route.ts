import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
import { hashApiKey, randomApiKey } from "@/lib/security";
import { z } from "zod";
export async function GET() { try { const user = await requireUser(); return Response.json(await db.agent.findMany({ where: { userId: user.id }, include: { mandates: { include: { policy: true } } } })); } catch (e) { return errorResponse(e); } }
export async function POST(request: Request) {
  try { const user = await requireUser(); const input = z.object({ name: z.string().min(2), description: z.string().optional() }).parse(await request.json()); const apiKey = randomApiKey(); const agent = await db.agent.create({ data: { ...input, userId: user.id, apiKeyHash: hashApiKey(apiKey) } }); return Response.json({ agent, apiKey }, { status: 201 }); } catch (e) { return errorResponse(e); }
}
