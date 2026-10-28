import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const requests = await db.paymentRequest.findMany({
      where: { mandate: { userId: user.id } },
      include: { payment: true, agent: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return Response.json(requests);
  } catch (error) { return errorResponse(error); }
}
