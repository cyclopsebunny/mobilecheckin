import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessToken, safeEqual } from "@/lib/access/token";

export const runtime = "nodejs";

/** Only allow same-site relative paths back, so the form cannot be used as an open redirect. */
function safeNext(raw: string): string {
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/checkin";
}

export async function POST(request: NextRequest) {
  const secret = process.env.SITE_PASSWORD;
  const form = await request.formData();
  const supplied = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/checkin"));

  // Compare digests, not raw strings, so timing does not leak the length.
  const ok = Boolean(secret) && safeEqual(await accessToken(supplied), await accessToken(secret as string));
  if (!ok) {
    return NextResponse.redirect(
      new URL(`/unlock?error=1&next=${encodeURIComponent(next)}`, request.url)
    );
  }

  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(ACCESS_COOKIE, await accessToken(secret as string), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}
