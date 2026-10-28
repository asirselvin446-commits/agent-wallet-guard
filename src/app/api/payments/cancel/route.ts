export async function GET(request: Request) {
  const origin = process.env.APP_BASE_URL || new URL(request.url).origin;
  return Response.redirect(`${origin.replace(/\/$/, "")}/dashboard?payment=cancelled`, 303);
}
