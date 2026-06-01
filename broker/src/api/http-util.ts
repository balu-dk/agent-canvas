import type { IncomingMessage, ServerResponse } from "node:http";

/** Read the full request body as a string. */
export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Read and JSON-parse the request body. Returns {} for an empty body. */
export async function readJson<T = unknown>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw.trim()) return {} as T;
  return JSON.parse(raw) as T;
}

/** Send a JSON response. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Send a plain-text error response. */
export function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

/** Parse the query string of a request URL into URLSearchParams. */
export function queryParams(url: string): URLSearchParams {
  const qIdx = url.indexOf("?");
  return new URLSearchParams(qIdx >= 0 ? url.slice(qIdx + 1) : "");
}

/** Strip the query string from a URL, returning just the path. */
export function pathOnly(url: string): string {
  const qIdx = url.indexOf("?");
  return qIdx >= 0 ? url.slice(0, qIdx) : url;
}
