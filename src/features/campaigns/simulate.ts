// «Проверить клик»: which stream a visitor with the given attributes lands in, over the current
// (possibly unsaved) weights. The real backend evaluates by IP / UA; here the visitor is typed in.
import type { Stream, StreamFilter } from "@/api/types"

export interface Visitor {
  country: string
  region: string
  device_type: string
  os: string
  browser: string
  language: string
  connection_type: string
  bot: boolean
}

const VISITOR_KEYS = ["country", "region", "device_type", "os", "browser", "language", "connection_type", "bot"] as const

export interface SimCheck { filter: StreamFilter; ok: boolean | null } // null = not checked in the simulator
export interface SimStream { stream: Stream; checks: SimCheck[]; passed: boolean; chance: number }
export interface SimResult { steps: SimStream[]; caughtBy: Stream | null; fallback: boolean }

function check(f: StreamFilter, v: Visitor): boolean | null {
  let hit: boolean
  if (f.name === "bot") hit = v.bot === (f.payload[0] !== "0")
  else if ((VISITOR_KEYS as readonly string[]).includes(f.name)) {
    const value = String(v[f.name as keyof Visitor] ?? "")
    if (!value) return null
    hit = f.payload.some((p) => p.toLowerCase() === value.toLowerCase())
  } else return null
  return f.mode === "accept" ? hit : !hit
}

function passes(s: Stream, checks: SimCheck[]) {
  const known = checks.map((c) => c.ok).filter((x): x is boolean => x !== null)
  if (!known.length) return true
  return s.filter_or ? known.some(Boolean) : known.every(Boolean)
}

// regular streams always rotate by weight (owner 15/11)
export function simulate(streams: Stream[], weightOf: (s: Stream) => number, v: Visitor): SimResult {
  const active = streams.filter((s) => s.state === "active").sort((a, b) => a.position - b.position)
  const eval_ = (s: Stream): SimStream => {
    const checks = s.filters.map((f) => ({ filter: f, ok: check(f, v) }))
    return { stream: s, checks, passed: passes(s, checks), chance: 0 }
  }
  const forced = active.filter((s) => s.type === "forced").map(eval_)
  const regular = active.filter((s) => s.type === "regular").map(eval_)
  const fallback = active.filter((s) => s.type === "default").map(eval_)
  const steps = [...forced, ...regular, ...fallback]

  const f = forced.find((x) => x.passed)
  if (f) { f.chance = 100; return { steps, caughtBy: f.stream, fallback: false } }

  const pool = regular.filter((x) => x.passed && weightOf(x.stream) > 0)
  if (pool.length) {
    const sum = pool.reduce((a, x) => a + weightOf(x.stream), 0)
    for (const x of pool) x.chance = (weightOf(x.stream) / sum) * 100
    return { steps, caughtBy: null, fallback: false }
  }
  const d = fallback.find((x) => x.passed)
  if (d) d.chance = 100
  return { steps, caughtBy: d?.stream ?? null, fallback: true }
}
