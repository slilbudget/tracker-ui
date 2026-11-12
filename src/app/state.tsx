import { toast } from "sonner"
// App-wide UI state: viewer role (permissions demo), global period.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useSearchParams } from "react-router"
import type { AccessLevel, DateInterval, DateRange, Resource, Role } from "@/api/types"
import { DATE_INTERVALS } from "@/api/meta"
import { useQueryClient } from "@tanstack/react-query"
import { roles } from "@/mock/seed"
import { setViewerRole } from "@/mock/scope"

const store = {
  get(key: string) {
    try { return localStorage.getItem(key) } catch { return null }
  },
  set(key: string, v: string) {
    try { localStorage.setItem(key, v) } catch { /* private mode */ }
  },
}

interface AppState {
  role: Role
  setRoleId: (id: number) => void
  timezone: string
}
const Ctx = createContext<AppState | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [roleId, setRoleIdState] = useState(() => Number(store.get("trk.role") ?? 1))
  // Dark only: the product has one theme.
  useEffect(() => {
    document.documentElement.classList.add("dark")
  }, [])
  const qc = useQueryClient()
  const role = roles.find((r) => r.id === roleId) ?? roles[0]
  setViewerRole(role) // before any query of this render
  useEffect(() => { qc.invalidateQueries() }, [roleId, qc])
  const value = useMemo<AppState>(() => ({
    role,
    setRoleId: (id) => { store.set("trk.role", String(id)); setRoleIdState(id) },
    timezone: "Europe/London",
  }), [role])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useApp outside AppStateProvider")
  return v
}

const RANK: Record<AccessLevel, number> = { none: 0, read: 1, own: 2, groups: 3, full: 4 }

// Permissions. canView: section visible. canEdit: may create / change (own and groups count as edit
// within their scope; the backend enforces the scope, the UI only hides what is never allowed).
export function useAccess(resource: Resource) {
  const { role } = useApp()
  const level = role.access[resource] ?? "none"
  return {
    level,
    canView: RANK[level] >= 1,
    canEdit: RANK[level] >= 2,
    isFull: level === "full",
  }
}
export function useHiddenMetrics() {
  return useApp().role.hidden_metrics
}
// Money of affiliate networks (payouts, revenue, profit). Hidden for roles that hide "revenue".
export function useCanSeeMoney() {
  return !useApp().role.hidden_metrics.includes("revenue")
}

// Period lives in the URL (?period=7_days_ago or ?from=2026-11-01&to=2026-11-07) so any view is shareable.
// Without ?period the last period chosen anywhere in this session applies (sessionStorage), else «Последние 7 дней».
type PeriodPick = Pick<DateRange, "interval" | "from" | "to">
const PERIOD_KEY = "trk.period"
function readPeriod(): PeriodPick | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(PERIOD_KEY) ?? "null")
    return v && typeof v.interval === "string" ? v : null
  } catch {
    return null
  }
}
// Several URL-param setters called in one handler (e.g. close a sheet + switch a tab) must all apply.
// react-router's functional setSearchParams reads the location at call time, so the last call would
// overwrite the earlier ones. Changes made in the same tick are accumulated here and sent together.
let pending: URLSearchParams | null = null
function patchParams(current: URLSearchParams, setParams: ReturnType<typeof useSearchParams>[1], change: (n: URLSearchParams) => void) {
  if (!pending) {
    pending = new URLSearchParams(current)
    queueMicrotask(() => { pending = null })
  }
  change(pending)
  setParams(new URLSearchParams(pending), { replace: true })
}

// remember = false: the page keeps its own default (dashboard = today, audit = month) and does not change the shared choice.
export function usePeriod(defaultInterval: DateInterval = "7_days_ago", remember = true) {
  const [params, setParams] = useSearchParams()
  const { timezone } = useApp()
  // a broken or outdated link (unknown interval, bad custom dates) falls back to the default instead of crashing
  const day = /^\d{4}-\d{2}-\d{2}$/
  const urlInterval = params.get("period")
  const urlFrom = params.get("from") ?? undefined
  const urlTo = params.get("to") ?? undefined
  const urlOk = !!urlInterval && DATE_INTERVALS.some((d) => d.value === urlInterval) &&
    (urlInterval !== "custom" || (!!urlFrom && !!urlTo && day.test(urlFrom) && day.test(urlTo) && urlFrom <= urlTo))
  const base: PeriodPick = urlOk
    ? { interval: urlInterval as DateInterval, from: urlFrom, to: urlTo }
    : (remember ? readPeriod() : null) ?? { interval: defaultInterval }
  const range: DateRange = { interval: base.interval, from: base.from, to: base.to, timezone }
  const setRange = (r: PeriodPick) => {
    if (remember) try { sessionStorage.setItem(PERIOD_KEY, JSON.stringify(r)) } catch { /* private mode */ }
    patchParams(params, setParams, (n) => {
      n.set("period", r.interval)
      if (r.interval === "custom" && r.from && r.to) { n.set("from", r.from); n.set("to", r.to) }
      else { n.delete("from"); n.delete("to") }
    })
  }
  return [range, setRange] as const
}

// Generic URL-backed string param.
export function useUrlParam(key: string, def = "") {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) ?? def
  const set = (v: string) =>
    patchParams(params, setParams, (n) => {
      if (v && v !== def) n.set(key, v)
      else n.delete(key)
    })
  return [value, set] as const
}

// ?edit=<id> that points to a deleted / archived / foreign record: close the sheet and say so,
// instead of showing an empty «new» form.
export function useMissingRecord(editId: string, list: unknown[] | undefined, found: unknown, close: (v: string) => void) {
  const missing = !!editId && editId !== "new" && !!list && !found
  const latest = useRef(missing)
  latest.current = missing
  useEffect(() => {
    if (!missing) return
    // a record created a moment ago appears after the list refetch: give it time before giving up
    const t = setTimeout(() => {
      if (!latest.current) return
      toast.error("Запись не найдена: она удалена или в архиве")
      close("")
    }, 800)
    return () => clearTimeout(t)
  }, [missing, editId]) // eslint-disable-line react-hooks/exhaustive-deps
}
