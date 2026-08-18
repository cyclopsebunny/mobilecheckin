/**
 * Shared-secret gate for the hosted prototype.
 *
 * This is deliberately NOT user authentication — it is one password shared with
 * the team so a public URL is not left open to the internet (and so nobody can
 * call the OpenAI-backed extraction routes anonymously). Swap for real SSO
 * before this handles anything sensitive.
 */
export const ACCESS_COOKIE = "dp_access";

/** Cookie value = SHA-256 of the shared secret, so the raw password never leaves the server. */
export async function accessToken(secret: string): Promise<string> {
  const data = new TextEncoder().encode(`dockpass:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent comparison — callers pass equal-length digests. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
