import { NextResponse, type NextRequest } from "next/server";

// The public development Passenger entry uses the existing app login.
// Its bundled Driver rehearsal stays available only in the private hosted mode.
// No matcher: this also runs before files in public/review-driver are served.
export function proxy(request: NextRequest) {
  if (process.env.PAX_PUBLIC_PASSENGER_ONLY !== "true")
    return NextResponse.next();

  let pathname: string;
  try {
    const decoded = decodeURIComponent(request.nextUrl.pathname)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");
    pathname = new URL(decoded, request.nextUrl.origin).pathname;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (/^\/(?:review-driver|api\/review-driver-api)(?:\/|$)/.test(pathname)) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.next();
}
