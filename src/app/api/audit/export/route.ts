import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const format = new URL(request.url).searchParams.get("format") || "json";
    const events = await db.auditEvent.findMany({ where: { userId: user.id }, orderBy: { sequence: "asc" } });
    if (format === "csv") {
      const header = "sequence,type,createdAt,prevHash,hash,payload";
      const rows = events.map(e => [e.sequence, e.type, e.createdAt.toISOString(), e.prevHash, e.hash, JSON.stringify(e.payload).replaceAll('"', '""')].map(value => `"${value}"`).join(","));
      return new Response([header, ...rows].join("\n"), { headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=audit.csv" } });
    }
    return Response.json(events);
  } catch (error) { return errorResponse(error); }
}
