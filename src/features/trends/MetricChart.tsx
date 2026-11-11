// One metric = one single-axis line chart (no dual axes: different scales get separate charts).
// Thin line, no dots, no gradient, no animation, theme chart colors.
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { metricDef } from "@/api/meta"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { fmtMetric } from "@/lib/format"
import { cn } from "@/lib/utils"

// Chart palette: theme --chart-1..3, 5 plus the foreground color (white-ish on dark). --chart-4 is red: never a series color.
const PALETTE = ["var(--chart-2)", "var(--chart-1)", "var(--chart-3)", "var(--chart-5)", "var(--foreground)"] as const
// Preferred color per metric (it follows the metric, not its position), the same on the dashboard and on trends:
// clicks blue, cost yellow, revenue green, profit white, ROI blue (grey when clicks take the blue), the rest grey.
// Metrics that share a preferred color get distinct ones in assignColors().
const PREFERRED: Record<string, string> = {
  clicks: "var(--chart-2)", campaign_unique_clicks: "var(--chart-5)", leads: "var(--chart-1)", sales: "var(--chart-5)",
  cr: "var(--chart-5)", cost: "var(--chart-3)", revenue: "var(--chart-1)", sale_revenue: "var(--chart-1)",
  profit: "var(--foreground)", profit_confirmed: "var(--foreground)", roi: "var(--chart-2)", roi_confirmed: "var(--chart-2)",
  epc: "var(--chart-3)", epc_confirmed: "var(--chart-3)",
}
export const colorOf = (k: string) => PREFERRED[k] ?? "var(--chart-5)"

// One distinct color per selected metric: the preferred one unless an earlier metric already took it.
export function assignColors(keys: string[]): Record<string, string> {
  const used = new Set<string>()
  const out: Record<string, string> = {}
  for (const k of keys) {
    const pref = colorOf(k)
    const c = used.has(pref) ? PALETTE.find((x) => !used.has(x)) ?? pref : pref
    used.add(c)
    out[k] = c
  }
  return out
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

export function MetricChart({
  data, metric, xLabel, xFull, color, className,
}: {
  data: Record<string, string | number | null>[]; metric: string; xLabel: (x: string) => string
  xFull?: (x: string) => string // full label for the tooltip (axis ticks stay short)
  color?: string; className?: string
}) {
  const def = metricDef(metric)
  const config: ChartConfig = { [metric]: { label: def?.name ?? metric, color: color ?? colorOf(metric) } }
  return (
    <ChartContainer config={config} className={cn("aspect-auto h-36 w-full justify-start", className)}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="x" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} tickMargin={6} minTickGap={24} tickFormatter={(v) => xLabel(String(v))} />
        <YAxis width={40} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => compact.format(Number(v))} />
        <ChartTooltip
          cursor={{ strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              className="shadow-none"
              hideIndicator
              labelFormatter={(_, payload) => (xFull ?? xLabel)(String(payload?.[0]?.payload?.x ?? ""))}
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">{def?.name ?? metric}</span>
                  <span className="num font-medium text-foreground">{fmtMetric(metric, Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <Line
          dataKey={metric}
          type="linear"
          stroke={`var(--color-${metric})`}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  )
}

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
// Report rows → chart rows keyed by `x`, with missing hours / weekdays filled by zeros.
export function toSeries(dim: string, rows: Record<string, string | number | null>[], measures: string[]) {
  const zero = (x: string) => ({ x, ...Object.fromEntries(measures.map((k) => [k, 0])) })
  const map = new Map(rows.map((r) => [String(r[dim]), { x: String(r[dim]), ...Object.fromEntries(measures.map((k) => [k, r[k] ?? 0])) }]))
  let keys: string[]
  if (dim === "hour") keys = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`)
  else if (dim === "weekday") keys = WD.map((d, i) => `${i + 1} ${d}`)
  else keys = [...map.keys()].sort()
  // hours after the last one with data stay empty (a gap), not a drop to zero
  const lastIdx = dim === "hour" ? keys.reduce((a, x, i) => (map.has(x) ? i : a), -1) : keys.length - 1
  const gap = (x: string) => ({ x, ...Object.fromEntries(measures.map((k) => [k, null])) })
  return keys.map((x, i) => map.get(x) ?? (i > lastIdx ? gap(x) : zero(x)))
}

// Axis ticks are short (dd.mm); tooltips show the full date (dd.mm.yyyy, same as tables).
export function xLabelFor(dim: string) {
  return (x: string) => {
    if (dim === "day") return x.split("-").reverse().slice(0, 2).join(".")
    if (dim === "month") return x.split("-").reverse().join(".")
    if (dim === "weekday") return x.slice(2)
    return x
  }
}
export function xFullFor(dim: string) {
  return (x: string) => {
    if (dim === "day") return x.split("-").reverse().join(".")
    if (dim === "weekday") return x.slice(2)
    return xLabelFor(dim)(x)
  }
}
