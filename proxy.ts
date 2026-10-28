import { NextResponse } from "next/server";

// Authentication and authorization happen in each route handler. Proxy stays
// network-free so routine page/API requests do not wait on an unused provider.
export function proxy() {
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
