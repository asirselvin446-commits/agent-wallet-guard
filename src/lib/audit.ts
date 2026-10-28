import crypto from "node:crypto";
import { db } from "./db";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

// Verify older chains written by the original shallow JSON canonicalizer while
// all newly appended rows use the recursive canonical representation above.
function legacyCanonical(value: unknown): string {
  const keys = value && typeof value === "object" ? Object.keys(value).sort() : [];
  return JSON.stringify(value, keys);
}

function digest(prevHash: string, payload: unknown, legacy = false) {
  return crypto.createHash("sha256").update(prevHash + (legacy ? legacyCanonical(payload) : canonical(payload))).digest("hex");
}

export function hashAuditPayload(prevHash: string, payload: unknown) { return digest(prevHash, payload); }

export async function appendAudit(userId: string, type: string, payload: unknown) {
  const safePayload = JSON.parse(JSON.stringify(payload ?? null)) as object;
  // A serializable transaction prevents concurrent requests from assigning the
  // same sequence or forking the chain. Retry normal serialization conflicts.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        const last = await tx.auditEvent.findFirst({ where: { userId }, orderBy: { sequence: "desc" } });
        const sequence = (last?.sequence ?? 0) + 1;
        const prevHash = last?.hash ?? "GENESIS";
        return tx.auditEvent.create({ data: { userId, sequence, type, payload: safePayload, prevHash, hash: digest(prevHash, safePayload) } });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if ((code !== "P2034" && code !== "P2002") || attempt === 3) throw error;
    }
  }
  throw new Error("Could not append audit event");
}

export async function verifyAudit(userId: string) {
  const events = await db.auditEvent.findMany({ where: { userId }, orderBy: { sequence: "asc" } });
  let prev = "GENESIS";
  for (const event of events) {
    const validHash = digest(prev, event.payload) === event.hash || digest(prev, event.payload, true) === event.hash;
    if (!validHash || event.prevHash !== prev) return { intact: false, brokenSequence: event.sequence };
    prev = event.hash;
  }
  return { intact: true, count: events.length };
}
