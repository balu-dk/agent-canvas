/**
 * Canonical security constants for extension webviews — the single source of truth
 * shared by the runtime (`ExtensionWebview`, host transport) and the asset server
 * (the dev middleware in `vite.config.ts`; a real deployment must send the same
 * headers from wherever it serves bundle assets).
 *
 * Threat model: a webview runs **untrusted, customer-supplied** HTML/JS. The defences
 * are layered so no single regression is catastrophic:
 *
 * 1. Sandbox — `allow-scripts` only (deliberately NO `allow-same-origin`), so the
 *    frame has an opaque ("null") origin and cannot read host cookies, storage, or the
 *    parent DOM, nor submit forms / navigate the top frame / open popups.
 * 2. CSP — `connect-src 'none'` removes every network channel (fetch/XHR/WebSocket/
 *    EventSource/beacon), so a webview **cannot exfiltrate data**; its only outbound
 *    path is the capability-gated `postMessage` RPC. `default-src 'none'` denies
 *    everything not explicitly re-allowed. A per-load **nonce** on `script-src` means
 *    only the host-stamped `<script>` tags run (an injected inline script is blocked),
 *    and `frame-ancestors` restricts who may embed the webview. A CSP-level
 *    `sandbox allow-scripts` mirrors the iframe sandbox as defence in depth.
 * 3. Origin-checked RPC — the host only accepts messages whose `event.source` is the
 *    frame AND whose `event.origin` is the opaque origin (see below), and every
 *    privileged call is gated by the extension's granted capabilities.
 */

/** `sandbox` attribute for extension webview iframes. Never add `allow-same-origin`. */
export const WEBVIEW_SANDBOX = "allow-scripts";

/**
 * Serialized origin of a sandboxed (no `allow-same-origin`) iframe. The host requires
 * inbound RPC messages to carry this origin; if the sandbox were ever loosened to add
 * `allow-same-origin`, the frame's origin would change and RPC would fail loudly
 * rather than silently widening the trust boundary.
 */
export const WEBVIEW_OPAQUE_ORIGIN = "null";

export interface WebviewCspOptions {
  /**
   * Per-load nonce. When provided, `script-src` uses `'nonce-…'` (and `'unsafe-inline'`
   * is dropped) so only the host-stamped `<script>` tags execute; an injected inline
   * script without the nonce is blocked. Omit it only where the asset server cannot
   * rewrite the HTML (then it falls back to `'unsafe-inline'`, still sandboxed +
   * `connect-src 'none'`).
   */
  nonce?: string;
  /**
   * `frame-ancestors` value — who may embed the webview. Defaults to `'self'`, correct
   * when assets are served same-origin as the host (e.g. the dev middleware). A
   * production deployment that serves assets from a dedicated isolated origin MUST set
   * this to the host app's origin so only the host can frame the webview.
   */
  frameAncestors?: string;
}

/**
 * Builds the strict Content-Security-Policy directives enforced on webview documents.
 * Sent as an HTTP header by the asset server so it is authoritative regardless of any
 * `<meta>` CSP a bundle ships (header + meta combine — a script must satisfy both).
 *
 * Load-bearing directives: `default-src 'none'` denies everything by default;
 * `connect-src 'none'` removes every network channel (no exfiltration); the CSP-level
 * `sandbox allow-scripts` mirrors the iframe sandbox so the document keeps an opaque
 * origin even if opened outside our `<iframe>`.
 */
export function buildWebviewCspDirectives(
  options: WebviewCspOptions = {},
): Record<string, string> {
  const { nonce, frameAncestors = "'self'" } = options;
  return {
    "default-src": "'none'",
    "script-src": nonce ? `'nonce-${nonce}'` : "'unsafe-inline'",
    "style-src": "'unsafe-inline'",
    "img-src": "data: blob:",
    "font-src": "data:",
    "connect-src": "'none'",
    "form-action": "'none'",
    "base-uri": "'none'",
    "frame-ancestors": frameAncestors,
    sandbox: "allow-scripts",
  };
}

/** {@link buildWebviewCspDirectives} serialized as a single CSP header value. */
export function buildWebviewCsp(options: WebviewCspOptions = {}): string {
  return Object.entries(buildWebviewCspDirectives(options))
    .map(([directive, value]) => `${directive} ${value}`)
    .join("; ");
}

/** A random, single-use CSP nonce (hex). Works in both Node and the browser. */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

// Opening `<script` tags that don't already carry a nonce attribute.
const UNNONCED_SCRIPT_TAG = /<script\b(?![^>]*\bnonce=)/gi;

/**
 * Stamps `nonce="…"` onto every `<script>` tag in `html` so they satisfy a
 * nonce-based `script-src`. Run by the asset server at serve time with the same nonce
 * placed in the CSP header.
 */
export function stampCspNonce(html: string, nonce: string): string {
  return html.replace(UNNONCED_SCRIPT_TAG, `<script nonce="${nonce}"`);
}
