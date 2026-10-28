import crypto from "node:crypto";
import { db } from "./db";

function canonical(value: unknown) { return JSON.stringify(value, Object.keys(value as object).sort()); }
export async function appendAudit(userId: string, type: string, payload: unknown) {
  const last = await db.auditEvent.findFirst({ where: { userId }, orderBy: { sequence: "desc" } });
  const sequence = (last?.sequence ?? 0) + 1;
  const prevHash = last?.hash ?? "GENESIS";
  const hash = crypto.createHash("sha256").update(prevHash + canonical(payload)).digest("hex");
  return db.auditEvent.create({ data: { userId, sequence, type, payload: payload as object, prevHash, hash } });
}
export async function verifyAudit(userId: string) {
  const events = await db.auditEvent.findMany({ where: { userId }, orderBy: { sequence: "asc" } });
  let prev = "GENESIS";
  for (const event of events) {
    const expected = crypto.createHash("sha256").update(prev + canonical(event.payload)).digest("hex");
    if (expected !== event.hash || event.prevHash !== prev) return { intact: false, brokenSequence: event.sequence };
    prev = event.hash;
  }
  return { intact: true, count: events.length };
}
