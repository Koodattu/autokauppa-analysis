import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE_NAME = "nettiauto_admin";
export const ADMIN_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AdminSessionPayload {
  v: 1;
  iat: number;
  exp: number;
  scope: "admin";
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string, sessionSecret: string) {
  return createHmac("sha256", sessionSecret).update(encodedPayload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export function verifyAdminPassword(candidate: string, expectedPassword: string) {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expectedPassword).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

export function issueAdminSessionCookieValue(
  sessionSecret: string,
  now = new Date(),
  ttlSeconds = ADMIN_SESSION_TTL_SECONDS,
) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: AdminSessionPayload = {
    v: 1,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    scope: "admin",
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, sessionSecret);
  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionCookieValue(
  cookieValue: string | undefined,
  sessionSecret: string,
  now = new Date(),
): AdminSessionPayload | null {
  if (!cookieValue) {
    return null;
  }

  const [encodedPayload, signature, extra] = cookieValue.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, sessionSecret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AdminSessionPayload;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (payload.v !== 1 || payload.scope !== "admin" || payload.exp <= nowSeconds) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
