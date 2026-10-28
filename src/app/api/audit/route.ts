import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
export async function GET() { try { const user = await requireUser(); return Response.json(await db.auditEvent.findMany({ where: { userId: user.id }, orderBy: { sequence: "desc" }, take: 100 })); } catch (e) { return errorResponse(e); } }
