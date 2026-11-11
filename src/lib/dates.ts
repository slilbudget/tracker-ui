import type { DateRange } from "@/api/types"

// Formatters are expensive to create: one per (kind, timezone), results memoized per instant.
const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(kind: "day" | "hour", tz: string) {
  const k = `${kind}|${tz}`
  let f = fmtCache.get(k)
  if (!f) {
    f = kind === "day"
      ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      : new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" })
    fmtCache.set(k, f)
  }
  return f
}
const memo = new Map<string, string>()
function cached(kind: "day" | "hour", d: Date | string, tz: string) {
  if (typeof d !== "string") return fmt(kind, tz).format(d)
  const k = `${kind}|${tz}|${d}`
  let v = memo.get(k)
  if (v === undefined) {
    v = fmt(kind, tz).format(new Date(d))
    if (memo.size > 400_000) memo.clear()
    memo.set(k, v)
  }
  return v
}

// Day key (YYYY-MM-DD) of an instant in a timezone.
export function dayKey(d: Date | string, tz: string) {
  return cached("day", d, tz)
}
export function hourKey(d: Date | string, tz: string) {
  return cached("hour", d, tz)
}
export function monthKey(d: Date | string, tz: string) {
  return dayKey(d, tz).slice(0, 7)
}
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
export function weekdayKey(d: Date | string, tz: string) {
  const [y, m, dd] = dayKey(d, tz).split("-").map(Number)
  const wd = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7
  return `${wd + 1} ${WD[wd]}`
}

function shiftDay(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

// Inclusive [from, to] day keys for a range in its timezone.
export function resolveRange(range: DateRange, now = new Date()): { from: string; to: string } {
  const today = dayKey(now, range.timezone)
  switch (range.interval) {
    case "today":
      return { from: today, to: today }
    case "yesterday":
      return { from: shiftDay(today, -1), to: shiftDay(today, -1) }
    case "7_days_ago":
      return { from: shiftDay(today, -6), to: today }
    case "first_day_of_this_week": {
      const wd = Number(weekdayKey(now, range.timezone)[0]) - 1
      return { from: shiftDay(today, -wd), to: today }
    }
    case "first_day_of_this_month":
      return { from: today.slice(0, 8) + "01", to: today }
    case "previous_month": {
      const first = today.slice(0, 8) + "01"
      const lastPrev = shiftDay(first, -1)
      return { from: lastPrev.slice(0, 8) + "01", to: lastPrev }
    }
    case "1_month_ago":
      return { from: shiftDay(today, -29), to: today }
    case "all_time":
      return { from: "2000-01-01", to: today }
    case "custom":
      return { from: range.from ?? today, to: range.to ?? today }
  }
}

// Same-length range right before the given one (for period comparison).
export function previousRange(range: DateRange, now = new Date()): DateRange {
  const { from, to } = resolveRange(range, now)
  const len = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1
  return { interval: "custom", from: shiftDay(from, -len), to: shiftDay(from, -1), timezone: range.timezone }
}

export function inRange(iso: string, r: { from: string; to: string }, tz: string) {
  if (r.from <= "2000-01-01") return true
  const k = dayKey(iso, tz)
  return k >= r.from && k <= r.to
}

const ruCache = new Map<string, Intl.DateTimeFormat>()
function ru(tz: string, withTime: boolean) {
  const k = `${tz}|${withTime}`
  let f = ruCache.get(k)
  if (!f) {
    f = new Intl.DateTimeFormat("ru-RU", withTime
      ? { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }
      : { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" })
    ruCache.set(k, f)
  }
  return f
}
export function formatDateTime(iso: string | null | undefined, tz = "Europe/London") {
  return iso ? ru(tz, true).format(new Date(iso)) : "—"
}
export function formatDate(iso: string | null | undefined, tz = "Europe/London") {
  return iso ? ru(tz, false).format(new Date(iso)) : "—"
}
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "никогда"
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return "только что"
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`
  return `${Math.floor(s / 86400)} дн назад`
}
