import type React from "react"
// Dashboard: KPI strip, hourly charts, top-10 tables (campaigns / offers / landings / streams), latest clicks and deposits.
import { useMemo } from "react"
import { Link } from "react-router"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { DateRange, ReportFilter } from "@/api/types"
import { api } from "@/api/client"
import { dimensionDef, metricDef } from "@/api/meta"
import { useApp, useCanSeeMoney, useHiddenMetrics, usePeriod, useUrlParam } from "@/app/state"
import { Page, PageHeader, RefreshButton, Section } from "@/components/page"
import { PeriodSelect } from "@/components/period-select"
import { MetricChart, colorOf, toSeries } from "@/features/trends/MetricChart"
import { CampaignSelect, Clip, EntityLink, SubidLink, MidText, commonPrefix, reportLink, stripPrefix, useNames } from "@/features/reports/shared"
import { formatDateTime } from "@/lib/dates"
import { fmtMetric, fmtMoney, signClass } from "@/lib/format"
import { cn } from "@/lib/utils"

const TOP: { dim: string; title: string }[] = [
  { dim: "campaign", title: "Кампании" },
  { dim: "offer", title: "Офферы" },
  { dim: "landing", title: "Лендинги" },
  { dim: "stream", title: "Потоки" },
]
const TOP_METRICS = ["clicks", "cost", "sale_revenue", "profit_confirmed", "roi_confirmed"]

export default function DashboardPage() {
  const hidden = useHiddenMetrics()
  const { timezone } = useApp()
  const money = useCanSeeMoney()
  const [range, setRange] = usePeriod("today", false)
  const [campaign, setCampaign] = useUrlParam("c")
  const filters = useMemo<ReportFilter[]>(
    () => (campaign ? [{ name: "campaign_id", operator: "EQUALS", expression: campaign }] : []),
    [campaign],
  )
  const names = useNames()

  const kpi = useQuery({
    queryKey: ["report", "dash-kpi", range, filters],
    queryFn: () =>
      api.reports.build({
        range, dimensions: [], filters, sort: [],
        measures: ["clicks", "campaign_unique_clicks", "leads", "cr", "cpa", "sales", "crs", "approve", "cost", "cpc", "sale_revenue", "epc_confirmed", "profit_confirmed", "roi_confirmed"],
      }),
    placeholderData: keepPreviousData,
  })
  const hourly = useQuery({
    queryKey: ["report", "dash-hourly", range, filters],
    queryFn: () => api.reports.build({ range, dimensions: ["hour"], measures: ["clicks", "sale_revenue"], filters, sort: [{ name: "hour", order: "ASC" }] }),
    placeholderData: keepPreviousData,
  })
  const series = useMemo(() => toSeries("hour", hourly.data?.rows ?? [], ["clicks", "sale_revenue"]), [hourly.data])

  const lastClicks = useQuery({
    queryKey: ["clicks", "log", "dash", campaign],
    queryFn: () => api.clicks.log({ range: { interval: "all_time", timezone }, filters, limit: 10, offset: 0 }),
  })
  const lastDeposits = useQuery({
    queryKey: ["conversions", "log", "dash", campaign],
    queryFn: () => api.conversions.log({ range: { interval: "all_time", timezone }, status: "sale", campaign_id: campaign ? Number(campaign) : undefined, limit: 10, offset: 0 }),
  })

  // names in one column share a long prefix: show the part that differs
  const clickPrefix = commonPrefix((lastClicks.data?.rows ?? []).map((c) => names.data?.campaigns[c.campaign_id] ?? ""))
  const salePrefix = {
    campaign: commonPrefix((lastDeposits.data?.rows ?? []).map((c) => names.data?.campaigns[c.campaign_id] ?? "")),
    offer: commonPrefix((lastDeposits.data?.rows ?? []).map((c) => (c.offer_id ? names.data?.offers[c.offer_id] ?? "" : ""))),
  }

  const s = kpi.data?.summary
  const cells: { label: string; value: string; sub: string; tone?: string; keys: string[] }[] = s
    ? [
        { label: metricDef("clicks")?.short ?? "Клики", value: fmtMetric("clicks", s.clicks), sub: `уник. ${fmtMetric("campaign_unique_clicks", s.campaign_unique_clicks)}`, keys: ["clicks"] },
        { label: metricDef("leads")?.short ?? "Лиды", value: fmtMetric("leads", s.leads), sub: `CR ${fmtMetric("cr", s.cr)} · CPL ${fmtMetric("cpa", s.cpa)}`, keys: ["leads"] },
        { label: metricDef("sales")?.short ?? "Продажи", value: fmtMetric("sales", s.sales), sub: `рег → деп ${fmtMetric("approve", s.approve)}`, keys: ["sales"] },
        { label: metricDef("cost")?.short ?? "Расход", value: fmtMetric("cost", s.cost), sub: `CPC ${fmtMetric("cpc", s.cpc)}`, keys: ["cost"] },
        { label: metricDef("sale_revenue")?.short ?? "Доход подтв.", value: fmtMetric("sale_revenue", s.sale_revenue), sub: `EPC ${fmtMetric("epc_confirmed", s.epc_confirmed)}`, keys: ["sale_revenue"] },
        {
          label: metricDef("profit_confirmed")?.short ?? "Прибыль подтв.", value: fmtMetric("profit_confirmed", s.profit_confirmed), sub: `ROI ${fmtMetric("roi_confirmed", s.roi_confirmed)}`,
          tone: signClass("profit_confirmed", s.profit_confirmed), keys: ["profit_confirmed", "roi_confirmed"],
        },
      ].filter((c) => !c.keys.some((k) => hidden.includes(k)))
    : []

  return (
    <Page>
      <PageHeader
        title="Дашборд"
        actions={
          <>
            <CampaignSelect value={campaign} onChange={setCampaign} className="w-44 sm:w-52" />
            <PeriodSelect value={range} onChange={setRange} />
            <RefreshButton className="max-sm:hidden" />
          </>
        }
      />

      {/* as many columns as there are tiles: a role without money metrics has fewer, and no empty cells */}
      <div
        className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 lg:grid-cols-[repeat(var(--tiles),minmax(0,1fr))]"
        style={{ "--tiles": kpi.isLoading ? 5 : cells.length } as React.CSSProperties}
      >
        {kpi.isLoading
          ? Array.from({ length: 5 }, (_, i) => <div key={i} className="h-[4.75rem] bg-card" />)
          : cells.map((c) => (
              <div key={c.label} className="bg-card px-3 py-2 max-sm:last:odd:col-span-2">
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className={cn("num text-2xl leading-tight font-semibold max-sm:text-xl", c.tone)}>{c.value}</div>
                <div className="num text-xs text-muted-foreground">{c.sub}</div>
              </div>
            ))}
      </div>

      <Section title="По часам">
        <div className="grid gap-3 p-3 md:grid-cols-2 [&>*]:min-w-0">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">{metricDef("clicks")?.name}</div>
            <MetricChart data={series} metric="clicks" xLabel={(x) => x.slice(0, 2)} xFull={(x) => x} color={colorOf("clicks")} />
          </div>
          {!hidden.includes("sale_revenue") && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">{metricDef("sale_revenue")?.name}, $</div>
              <MetricChart data={series} metric="sale_revenue" xLabel={(x) => x.slice(0, 2)} xFull={(x) => x} color={colorOf("sale_revenue")} />
            </div>
          )}
        </div>
      </Section>

      <div className="grid items-start gap-3 md:grid-cols-2 [&>*]:min-w-0">
        {TOP.map((t) => (
          <TopTable key={t.dim} dim={t.dim} title={t.title} range={range} filters={filters} hidden={hidden} />
        ))}
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2 [&>*]:min-w-0">
        <Section title="Последние клики">
          <Mini
            head={["Время клика", "Subid", "Кампания", "Страна", "Устройство"]}
            loading={lastClicks.isLoading}
            rows={(lastClicks.data?.rows ?? []).map((c) => [
              formatDateTime(c.datetime, timezone),
              <SubidLink key="s" subId={c.sub_id} />,
              <Clip compact key="c"><EntityLink kind="campaign" id={c.campaign_id} name={names.data?.campaigns[c.campaign_id]} prefix={clickPrefix} /></Clip>,
              c.country,
              `${c.os} · ${c.browser}`,
            ])}
          />
        </Section>
        <Section title="Последние продажи">
          <Mini
            head={["Время постбека", "Кампания", "Оффер", ...(money ? ["Выплата"] : [])]}
            right={money ? [3] : []}
            loading={lastDeposits.isLoading}
            rows={(lastDeposits.data?.rows ?? []).map((c) => [
              formatDateTime(c.postback_datetime, timezone),
              <Clip compact key="c"><EntityLink kind="campaign" id={c.campaign_id} name={names.data?.campaigns[c.campaign_id]} prefix={salePrefix.campaign} /></Clip>,
              <Clip compact key="o"><EntityLink kind="offer" id={c.offer_id} name={c.offer_id ? names.data?.offers[c.offer_id] : undefined} prefix={salePrefix.offer} /></Clip>,
              ...(money ? [c.revenue === 0 ? <span key="r" className="font-medium text-destructive" title="Продажа без выплаты">0 $</span> : fmtMoney(c.revenue)] : []),
            ])}
          />
        </Section>
      </div>
    </Page>
  )
}

function Mini({ head, rows, loading, right = [] }: { head: string[]; rows: React.ReactNode[][]; loading?: boolean; right?: number[] }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-[13px] text-muted-foreground">
          <tr>{head.map((h, i) => <th key={h} className={cn("h-9 border-b px-2.5 font-medium whitespace-nowrap", right.includes(i) ? "text-right" : "text-left")}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => <td key={j} className={cn("h-9 border-b px-2.5 whitespace-nowrap", right.includes(j) && "num text-right")}>{c}</td>)}
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={head.length} className="h-16 text-center text-muted-foreground">{loading ? "Загрузка…" : "Нет данных за период"}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function TopTable({ dim, title, range, filters, hidden }: { dim: string; title: string; range: DateRange; filters: ReportFilter[]; hidden: string[] }) {
  const measures = TOP_METRICS.filter((k) => !hidden.includes(k))
  const q = useQuery({
    queryKey: ["report", "dash-top", range, dim, measures, filters],
    queryFn: () => api.reports.build({ range, dimensions: [dim], measures, filters, sort: [{ name: "clicks", order: "DESC" }], limit: 10 }),
    placeholderData: keepPreviousData,
  })
  const prefix = commonPrefix((q.data?.rows ?? []).map((r) => String(r[dim])))
  return (
    <Section title={`Топ ${title.toLowerCase()}`} actions={prefix ? <span className="max-w-48 truncate text-xs text-muted-foreground" title={`Общее начало названий: ${prefix}`}>без «{prefix.trim().replace(/\|$/, "").trim()}»</span> : undefined}>
      <Mini
        head={[dimensionDef(dim)?.name ?? dim, ...measures.map((k) => metricDef(k)?.short ?? metricDef(k)?.name ?? k)]}
        right={measures.map((_, i) => i + 1)}
        loading={q.isLoading}
        rows={(q.data?.rows ?? []).map((r) => {
          const name = String(r[dim])
          return [
            name === "—" ? name : (
              <Link
                key="n" title={name} className="flex max-w-32 text-link min-[1400px]:max-w-52"
                to={reportLink({ g: [dim], filters: [...filters, { name: dim, operator: "EQUALS", expression: name }], range })}
              >
                <MidText text={stripPrefix(name, prefix)} />
              </Link>
            ),
            ...measures.map((k) => <span key={k} className={signClass(k, r[k])}>{fmtMetric(k, r[k])}</span>),
          ]
        })}
      />
    </Section>
  )
}
