import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) { try { const user = await requireUser(); const { id } = await context.params; return Response.json(await db.agent.updateMany({ where: { id, userId: user.id }, data: { status: "REVOKED" } })); } catch (e) { return errorResponse(e); } }
