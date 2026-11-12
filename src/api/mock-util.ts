// Helpers of the in-browser fake API. Not part of the contract: the real backend replaces all of this.
import type { AuditEntry, ID } from "./types"
import * as db from "@/mock/seed"
import { viewerUser } from "@/mock/scope"

export const LATENCY = 30
// A network-like answer: async and a deep copy, so the UI never holds references into the fake database.
export const wait = <T,>(v: T, ms = LATENCY): Promise<T> => new Promise((res) => setTimeout(() => res(structuredClone(v)), ms))
export const nextId = (xs: { id: number }[]) => xs.reduce((m, x) => Math.max(m, x.id), 0) + 1
export const now = () => new Date().toISOString()

// Audit log entry by the current viewer (the backend writes it from the session).
export function audit(resource: AuditEntry["resource"], summary: string, resource_id: ID | null = null, action: AuditEntry["action"] = "update") {
  db.audit.unshift({ id: nextId(db.audit), datetime: now(), user_id: viewerUser().id, action, resource, resource_id, summary, ip: "203.0.113.10" })
}
