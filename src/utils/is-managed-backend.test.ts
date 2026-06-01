import { describe, expect, it } from "vitest";
import { isManagedBackend } from "./utils";

describe("isManagedBackend", () => {
  it("treats cloud as managed", () => {
    expect(isManagedBackend("cloud")).toBe(true);
  });

  it("treats k8s as managed", () => {
    expect(isManagedBackend("k8s")).toBe(true);
  });

  it("treats local as not managed", () => {
    expect(isManagedBackend("local")).toBe(false);
  });
});
