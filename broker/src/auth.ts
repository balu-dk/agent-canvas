import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/**
 * Constant-time comparison of two strings. Returns false (without leaking
 * length via early-return timing where avoidable) when the strings differ.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // timingSafeEqual requires equal-length buffers. Comparing lengths first
  // does leak length, which is acceptable for a fixed-length shared secret.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Read the X-Session-API-Key header (case-insensitive) from a request. */
export function readSessionApiKey(req: IncomingMessage): string {
  const raw = req.headers["x-session-api-key"];
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
}

/**
 * Validate the broker control-plane key. An empty configured key always fails
 * (so a misconfigured broker is closed, not open).
 */
export function isAuthorized(req: IncomingMessage, expectedKey: string): boolean {
  if (!expectedKey) return false;
  const provided = readSessionApiKey(req);
  if (!provided) return false;
  return constantTimeEquals(provided, expectedKey);
}
