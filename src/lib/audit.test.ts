import { describe, expect, it } from "vitest";
import { hashAuditPayload } from "./audit";

describe("audit payload hashing", () => {
  it("canonicalizes nested object keys independent of insertion order", () => {
    const first = { request: { amount: 12, merchant: "shop" }, flags: ["risk"] };
    const reordered = { flags: ["risk"], request: { merchant: "shop", amount: 12 } };
    expect(hashAuditPayload("GENESIS", first)).toBe(hashAuditPayload("GENESIS", reordered));
  });

  it("includes nested values in the hash", () => {
    expect(hashAuditPayload("GENESIS", { request: { amount: 12 } })).not.toBe(hashAuditPayload("GENESIS", { request: { amount: 13 } }));
  });

  it("binds the previous event hash into the next event", () => {
    expect(hashAuditPayload("hash-a", { event: "payment" })).not.toBe(hashAuditPayload("hash-b", { event: "payment" }));
  });
});
