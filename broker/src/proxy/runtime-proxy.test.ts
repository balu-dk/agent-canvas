import { describe, expect, it } from "vitest";
import { isBenignSocketError, parseRuntimePath } from "./runtime-proxy.js";

describe("parseRuntimePath (prefix strip)", () => {
  it("strips the /sandbox-runtime/<uuid> prefix from an API path", () => {
    expect(parseRuntimePath("/sandbox-runtime/abc/api/conversations")).toEqual({
      conversationId: "abc",
      rest: "/api/conversations",
    });
  });

  it("preserves the query string", () => {
    expect(
      parseRuntimePath("/sandbox-runtime/abc/sockets/events/1?session_api_key=k"),
    ).toEqual({
      conversationId: "abc",
      rest: "/sockets/events/1?session_api_key=k",
    });
  });

  it("maps a bare /sandbox-runtime/<uuid> to '/'", () => {
    expect(parseRuntimePath("/sandbox-runtime/abc")).toEqual({
      conversationId: "abc",
      rest: "/",
    });
  });

  it("maps /sandbox-runtime/<uuid>/ to '/'", () => {
    expect(parseRuntimePath("/sandbox-runtime/abc/")).toEqual({
      conversationId: "abc",
      rest: "/",
    });
  });

  it("handles a query directly after the uuid", () => {
    expect(parseRuntimePath("/sandbox-runtime/abc?x=1")).toEqual({
      conversationId: "abc",
      rest: "/?x=1",
    });
  });

  it("handles a real UUID with dashes", () => {
    const id = "b6354027-13e8-4f81-a64e-a1b9b6dab44c";
    expect(parseRuntimePath(`/sandbox-runtime/${id}/api/conversations/${id}/events`)).toEqual({
      conversationId: id,
      rest: `/api/conversations/${id}/events`,
    });
  });

  it("returns null for non-runtime paths", () => {
    expect(parseRuntimePath("/api/k8s/app-conversations")).toBeNull();
    expect(parseRuntimePath("/sandbox-runtime/")).toBeNull();
    expect(parseRuntimePath("/")).toBeNull();
  });
});

describe("isBenignSocketError", () => {
  it("recognizes connection-teardown codes", () => {
    expect(isBenignSocketError({ code: "ECONNRESET" })).toBe(true);
    expect(isBenignSocketError({ code: "EPIPE" })).toBe(true);
    expect(isBenignSocketError({ code: "ERR_STREAM_PREMATURE_CLOSE" })).toBe(true);
  });

  it("rejects other errors and non-errors", () => {
    expect(isBenignSocketError({ code: "ENOTFOUND" })).toBe(false);
    expect(isBenignSocketError(null)).toBe(false);
    expect(isBenignSocketError(new Error("boom"))).toBe(false);
  });
});
