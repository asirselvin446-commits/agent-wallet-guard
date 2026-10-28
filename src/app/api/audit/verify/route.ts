import { requireUser, errorResponse } from "@/lib/api";
import { verifyAudit } from "@/lib/audit";
export async function GET() { try { const user = await requireUser(); return Response.json(await verifyAudit(user.id)); } catch (e) { return errorResponse(e); } }
