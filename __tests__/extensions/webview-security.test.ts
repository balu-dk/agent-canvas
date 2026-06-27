import { describe, expect, it } from "vitest";
import {
  buildWebviewCsp,
  buildWebviewCspDirectives,
  generateCspNonce,
  stampCspNonce,
  WEBVIEW_OPAQUE_ORIGIN,
  WEBVIEW_SANDBOX,
} from "#/extensions/webview-security";

/**
 * These assert the security posture so a regression that quietly widens the trust
 * boundary fails CI instead of shipping.
 */
describe("webview security constants", () => {
  it("sandboxes without allow-same-origin", () => {
    expect(WEBVIEW_SANDBOX).toContain("allow-scripts");
    expect(WEBVIEW_SANDBOX).not.toContain("allow-same-origin");
  });

  it("expects the opaque origin for sandboxed frames", () => {
    expect(WEBVIEW_OPAQUE_ORIGIN).toBe("null");
  });
});

describe("buildWebviewCspDirectives", () => {
  it("denies all by default and blocks every network channel", () => {
    const d = buildWebviewCspDirectives();
    expect(d["default-src"]).toBe("'none'");
    // No exfiltration: connect-src 'none' kills fetch/XHR/WebSocket/EventSource/beacon.
    expect(d["connect-src"]).toBe("'none'");
    expect(d["base-uri"]).toBe("'none'");
    expect(d["form-action"]).toBe("'none'");
  });

  it("mirrors the iframe sandbox at the document level", () => {
    expect(buildWebviewCspDirectives().sandbox).toBe("allow-scripts");
  });

  it("defaults frame-ancestors to 'self' and honours an override", () => {
    expect(buildWebviewCspDirectives()["frame-ancestors"]).toBe("'self'");
    expect(
      buildWebviewCspDirectives({ frameAncestors: "https://app.example" })[
        "frame-ancestors"
      ],
    ).toBe("https://app.example");
  });

  it("uses 'unsafe-inline' for scripts only when no nonce is supplied", () => {
    expect(buildWebviewCspDirectives()["script-src"]).toBe("'unsafe-inline'");
  });

  it("pins script-src to the nonce (dropping 'unsafe-inline') when given one", () => {
    const d = buildWebviewCspDirectives({ nonce: "abc123" });
    expect(d["script-src"]).toBe("'nonce-abc123'");
    expect(d["script-src"]).not.toContain("unsafe-inline");
  });
});

describe("buildWebviewCsp", () => {
  it("serializes to a single header value", () => {
    const csp = buildWebviewCsp();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("sandbox allow-scripts");
    expect(csp.includes("\n")).toBe(false);
  });

  it("embeds the nonce in script-src", () => {
    expect(buildWebviewCsp({ nonce: "deadbeef" })).toContain(
      "script-src 'nonce-deadbeef'",
    );
  });
});

describe("generateCspNonce", () => {
  it("returns a 32-char hex token", () => {
    expect(generateCspNonce()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is unique across calls", () => {
    expect(generateCspNonce()).not.toBe(generateCspNonce());
  });
});

describe("stampCspNonce", () => {
  it("adds the nonce to every script tag", () => {
    const html = "<script>a()</script><script src='x.js'></script>";
    expect(stampCspNonce(html, "n1")).toBe(
      '<script nonce="n1">a()</script><script nonce="n1" src=\'x.js\'></script>',
    );
  });

  it("leaves non-script tags untouched and does not double-stamp", () => {
    const html = '<style>.a{}</style><script nonce="kept">b()</script>';
    expect(stampCspNonce(html, "n2")).toBe(html);
  });
});
