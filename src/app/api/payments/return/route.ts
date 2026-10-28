import { db } from "@/lib/db";
import { requireUser } from "@/lib/api";
import { appendAudit } from "@/lib/audit";
import { provider } from "@/lib/paypal";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("token");
  const origin = process.env.APP_BASE_URL || url.origin;
  const redirect = (status: string) => Response.redirect(`${origin.replace(/\/$/, "")}/dashboard?payment=${encodeURIComponent(status)}`, 303);
  if (!orderId || orderId.length > 128) return redirect("invalid");
  let userId: string | undefined;
  try {
    const user = await requireUser();
    userId = user.id;
    const payment = await db.payment.findFirst({ where: { paypalId: orderId, paymentRequest: { mandate: { userId: user.id } } }, include: { paymentRequest: true } });
    if (!payment) return redirect("not-found");
    if (payment.status === "COMPLETED") return redirect("completed");
    if (payment.status !== "APPROVAL_REQUIRED") return redirect("not-awaiting-capture");
    const activeProvider = provider();
    if (!activeProvider.capture) return redirect("capture-unavailable");
    const result = await activeProvider.capture(orderId);
    await db.payment.update({ where: { id: payment.id }, data: { status: result.status, result: result.result as object } });
    await db.paymentRequest.update({ where: { id: payment.paymentRequestId }, data: { status: result.status } });
    await appendAudit(user.id, "PAYPAL_CAPTURE_RESULT", { requestId: payment.paymentRequestId, paypalId: orderId, status: result.status });
    return redirect(result.status === "COMPLETED" ? "completed" : result.status.toLowerCase());
  } catch (error) {
    if (userId) await appendAudit(userId, "PAYPAL_CAPTURE_ERROR", { error: error instanceof Error ? error.message : "PayPal capture could not be confirmed" }).catch(() => undefined);
    return redirect(error instanceof Error && error.message === "UNAUTHORIZED" ? "sign-in-required" : "capture-pending");
  }
}
