import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessToken, safeEqual } from "@/lib/access/token";

/**
 * Gates the whole app behind SITE_PASSWORD when that variable is set.
 * When it is unset the gate is inert, so local development is unaffected.
 *
 * API routes are gated too — otherwise /api/extract-document could be called
 * anonymously and billed to our OpenAI key.
 */
export async function middleware(request: NextRequest) {
  const secret = process.env.SITE_PASSWORD;
  if (!secret) {
    return NextResponse.next();
  }

  const supplied = request.cookies.get(ACCESS_COOKIE)?.value;
  if (supplied && safeEqual(supplied, await accessToken(secret))) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "This prototype is locked." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = `next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the unlock screen itself and static assets.
  matcher: [
    "/((?!unlock|api/unlock|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"
  ]
};
