import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { constantTimeEquals, isAuthorized, readSessionApiKey } from "./auth.js";

function reqWithKey(key: string | string[] | undefined): IncomingMessage {
  return { headers: { "x-session-api-key": key } } as unknown as IncomingMessage;
}

describe("constantTimeEquals", () => {
  it("matches identical strings", () => {
    expect(constantTimeEquals("secret", "secret")).toBe(true);
  });
  it("rejects different strings", () => {
    expect(constantTimeEquals("secret", "secreT")).toBe(false);
  });
  it("rejects different-length strings", () => {
    expect(constantTimeEquals("secret", "secret-longer")).toBe(false);
  });
});

describe("readSessionApiKey", () => {
  it("reads a single header value", () => {
    expect(readSessionApiKey(reqWithKey("k"))).toBe("k");
  });
  it("reads the first value of an array header", () => {
    expect(readSessionApiKey(reqWithKey(["a", "b"]))).toBe("a");
  });
  it("returns empty for a missing header", () => {
    expect(readSessionApiKey(reqWithKey(undefined))).toBe("");
  });
});

describe("isAuthorized", () => {
  it("authorizes a matching key", () => {
    expect(isAuthorized(reqWithKey("good"), "good")).toBe(true);
  });
  it("rejects a wrong key", () => {
    expect(isAuthorized(reqWithKey("bad"), "good")).toBe(false);
  });
  it("rejects when no key is configured (fail closed)", () => {
    expect(isAuthorized(reqWithKey("anything"), "")).toBe(false);
  });
  it("rejects when no key is provided", () => {
    expect(isAuthorized(reqWithKey(undefined), "good")).toBe(false);
  });
});
