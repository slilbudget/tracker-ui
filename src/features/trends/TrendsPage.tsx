// Trends: one single-axis line chart per selected metric + table; grouping days / hours / weekdays / months.
import { useMemo } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { DownloadIcon, SettingsIcon } from "lucide-react"
import type { ReportFilter, ReportRow } from "@/api/types"
import { api } from "@/api/client"
import { dimensionDef, metricDef } from "@/api/meta"
import { useHiddenMetrics, usePeriod, useUrlParam } from "@/app/state"
import { PresetButtons } from "@/components/metric-presets"
import { Page, PageHeader, Section, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { PeriodSelect } from "@/components/period-select"
import { downloadCsv, metricColumns } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CampaignSelect } from "@/features/reports/shared"
import { sortMetrics } from "@/features/catalog/ui"
import { fmtMetric } from "@/lib/format"
import { fmtDayKey } from "@/features/reports/shared"
import { MetricChart, assignColors, toSeries, xFullFor, xLabelFor } from "./MetricChart"

const GROUPS = [
  { value: "day", label: "Дни" },
  { value: "hour", label: "Часы" },
  { value: "weekday", label: "Дни недели" },
  { value: "month", label: "Месяцы" },
]
// Confirmed money by default (same as the lists); the «все» variants stay available in the picker.
const CHOICES = sortMetrics(["clicks", "campaign_unique_clicks", "leads", "sales", "cr", "cost", "sale_revenue", "profit_confirmed", "roi_confirmed", "revenue", "profit", "roi", "epc_confirmed", "approve"])
const DEFAULT_M = ["clicks", "cost", "sale_revenue", "profit_confirmed", "roi_confirmed"]
const MAX_METRICS = 5

export default function TrendsPage() {
  const hidden = useHiddenMetrics()
  const [range, setRange] = usePeriod()
  const [gRaw, setG] = useUrlParam("g", "day")
  const [mRaw, setM] = useUrlParam("m")
  const [campaign, setCampaign] = useUrlParam("c")
  const dim = GROUPS.some((x) => x.value === gRaw) ? gRaw : "day"
  const choices = CHOICES.filter((k) => !hidden.includes(k))
  const selected = useMemo(() => {
    // always in the METRICS order (same as chips, report and tables)
    const picked = new Set(mRaw ? mRaw.split(",") : DEFAULT_M)
    const x = choices.filter((k) => picked.has(k)).slice(0, MAX_METRICS)
    return x.length ? x : choices.slice(0, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mRaw, hidden])

  const filters = useMemo<ReportFilter[]>(
    () => (campaign ? [{ name: "campaign_id", operator: "EQUALS", expression: campaign }] : []),
    [campaign],
  )
  const report = useQuery({
    queryKey: ["report", "trends", range, dim, selected, filters],
    queryFn: () => api.reports.build({ range, dimensions: [dim], measures: selected, filters, sort: [{ name: dim, order: "ASC" }] }),
    placeholderData: keepPreviousData,
  })
  const series = useMemo(() => toSeries(dim, report.data?.rows ?? [], selected), [dim, report.data, selected])
  const xLabel = useMemo(() => xLabelFor(dim), [dim])
  const xFull = useMemo(() => xFullFor(dim), [dim])
  const colors = useMemo(() => assignColors(selected), [selected])

  const columns = useMemo<ColumnDef<ReportRow, unknown>[]>(
    () => [
      // sorts by the raw key (2026-11-09), shows dd.mm.yyyy
      { id: dim, header: dimensionDef(dim)?.name, accessorFn: (r) => String(r[dim]), cell: ({ getValue }) => (dim === "day" ? fmtDayKey(String(getValue())) : String(getValue())), enableHiding: false },
      ...metricColumns<ReportRow>(selected, (r) => r as Record<string, number>),
    ],
    [dim, selected],
  )
  const summary = report.data ? { [dim]: "Итого", ...metricSummaryFrom(report.data.summary, selected) } : undefined

  const toggle = (keys: string[]) => {
    const next = choices.filter((k) => keys.includes(k)).slice(0, MAX_METRICS)
    setM(next.length ? next.join(",") : selected.join(","))
  }

  return (
    <Page>
      <PageHeader
        title="Тренды"
        actions={
          <Button
            variant="outline"
            disabled={!report.data}
            onClick={() =>
              downloadCsv(
                `trends-${dim}.csv`,
                [dimensionDef(dim)?.name ?? dim, ...selected.map((k) => metricDef(k)?.name ?? k)],
                (report.data?.rows ?? []).map((r) => [dim === "day" ? fmtDayKey(String(r[dim])) : r[dim], ...selected.map((k) => r[k])]),
              )
            }
          >
            <Icon icon={DownloadIcon} size={14} /> Выгрузить CSV
          </Button>
        }
      />
      <Toolbar
        left={
          <>
            <ToggleGroup type="single" variant="outline" value={dim} onValueChange={(v) => v && setG(v)} aria-label="Группировка" className="flex-wrap max-sm:!basis-full">
              {GROUPS.map((x) => <ToggleGroupItem key={x.value} value={x.value}>{x.label}</ToggleGroupItem>)}
            </ToggleGroup>
            <CampaignSelect value={campaign} onChange={setCampaign} />
          </>
        }
        right={<PeriodSelect value={range} onChange={setRange} />}
      />

      {/* phone: the chips would take 4+ rows, so one «Метрики» popover */}
      <div className="sm:hidden">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline"><Icon icon={SettingsIcon} className="text-muted-foreground" /> Метрики ({selected.length})</Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(20rem,calc(100vw-1.5rem))] gap-1 p-3">
            <PresetButtons small chart value={selected} hidden={hidden} onPick={(keys) => toggle(keys)} />
            <div className="pb-1 text-xs text-muted-foreground">Не более {MAX_METRICS} метрик</div>
            {choices.map((k) => {
              const on = selected.includes(k)
              return (
                <Label key={k} className="h-8 gap-2 rounded-md px-1 text-sm font-normal">
                  <Checkbox
                    checked={on}
                    disabled={!on && selected.length >= MAX_METRICS}
                    onCheckedChange={() => toggle(on ? selected.filter((x) => x !== k) : [...selected, k])}
                  />
                  <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: on ? colors[k] : "var(--muted-foreground)" }} />
                  {metricDef(k)?.name}
                </Label>
              )
            })}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 max-sm:hidden">
        <span className="text-xs text-muted-foreground">Набор</span>
        <PresetButtons chart value={selected} hidden={hidden} onPick={(keys) => toggle(keys)} />
        <span className="ml-3 text-xs text-muted-foreground">Метрики (до {MAX_METRICS})</span>
        <ToggleGroup type="multiple" variant="outline" spacing={1} value={selected} onValueChange={toggle} className="flex-wrap" aria-label="Метрики">
          {choices.map((k) => (
            <ToggleGroupItem key={k} value={k} disabled={!selected.includes(k) && selected.length >= MAX_METRICS} title={selected.includes(k) || selected.length < MAX_METRICS ? undefined : `Не более ${MAX_METRICS} метрик`} className="disabled:opacity-100 disabled:text-muted-foreground">
              {/* filled dot in the line color when on, hollow ring when off */}
              <span
                aria-hidden
                className="inline-block size-2 rounded-full border"
                style={selected.includes(k) ? { background: colors[k], borderColor: colors[k] } : { borderColor: "var(--muted-foreground)" }}
              />
              {metricDef(k)?.short ?? metricDef(k)?.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-full [&>*]:min-w-0">
        {selected.map((k) => (
          <Section
            key={k}
            title={metricDef(k)?.name}
            actions={<span className="num text-xs whitespace-nowrap text-muted-foreground">Итого: {report.data ? fmtMetric(k, report.data.summary[k]) : "…"}</span>}
          >
            <div className="p-2">
              <MetricChart data={series} metric={k} xLabel={xLabel} xFull={xFull} color={colors[k]} />
            </div>
          </Section>
        ))}
      </div>

      <DataTable
        key={dim}
        data={report.data?.rows}
        loading={report.isLoading}
        columns={columns}
        getRowId={(r) => String(r[dim])}
        storageKey={`trends-${dim}`}
        initialSort={[{ id: dim, desc: dim === "day" || dim === "month" }]}
        summary={summary}
        empty="Нет данных за период"
      />
    </Page>
  )
}

function metricSummaryFrom(s: ReportRow, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, fmtMetric(k, s[k])]))
}
