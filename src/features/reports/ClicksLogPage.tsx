// Clicks log: server-like pagination (api.clicks.log limit/offset), filters, search, columns menu, CSV export, row → side sheet.
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { DownloadIcon } from "lucide-react"
import type { Click, ReportFilter } from "@/api/types"
import { api } from "@/api/client"
import { useApp, useHiddenMetrics, usePeriod, useUrlParam } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { PeriodSelect } from "@/components/period-select"
import { SearchInput, downloadCsv } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/dates"
import { fmtMoney } from "@/lib/format"
import { ClickSheet, DEVICE, FIELD_LABELS, fieldText } from "./ClickSheet"
import { FilterBuilder, RELAX_HINT, hasExactFilter } from "./FilterBuilder"
import { CampaignSelect, Clip, EntityName, decodeFilters, encodeFilters, reportLink, useColumnPrefixes, usePage, useNames } from "./shared"

// sub_id_1..6 aliases (Facebook campaign parameters)
const SUB_ALIASES: Record<string, string> = {
  sub_id_1: "Кабинет", sub_id_2: "Плейсмент", sub_id_3: "ID группы", sub_id_4: "Группа", sub_id_5: "Пиксель", sub_id_6: "ID объявления",
}
const SUBS = ["sub_id_1", "sub_id_2", "sub_id_3", "sub_id_4", "sub_id_5", "sub_id_6"] as const

export default function ClicksLogPage() {
  const { timezone } = useApp()
  const [range, setRange] = usePeriod()
  const [campaign, setCampaign] = useUrlParam("c")
  const [q, setQ] = useUrlParam("q")
  const [fRaw, setFRaw] = useUrlParam("f")
  const [open, setOpen] = useUrlParam("click")
  const userFilters = useMemo(() => decodeFilters(fRaw), [fRaw])
  const filters = useMemo<ReportFilter[]>(
    () => [...(campaign ? [{ name: "campaign_id", operator: "EQUALS" as const, expression: campaign }] : []), ...userFilters],
    [campaign, userFilters],
  )
  const names = useNames()
  const hiddenMetrics = useHiddenMetrics()
  const showCost = !hiddenMetrics.includes("cost")
  const [exporting, setExporting] = useState(false)
  const resetKey = JSON.stringify([range, filters, q])
  const pg = usePage(resetKey)

  const log = useQuery({
    queryKey: ["clicks", "log", range, filters, q, pg.page, pg.size],
    queryFn: () => api.clicks.log({ range, filters, search: q || undefined, limit: pg.size, offset: pg.page * pg.size }),
    placeholderData: keepPreviousData,
  })

  const pre = useColumnPrefixes(log.data?.rows, names.data)
  const filtered = !!(campaign || q || userFilters.length)
  const [, setParams] = useSearchParams()
  // one update for all keys (several useUrlParam setters in a row overwrite each other)
  const resetFilters = () => setParams((p) => { const n = new URLSearchParams(p); ["c", "q", "f"].forEach((k) => n.delete(k)); return n }, { replace: true })

  const columns = useMemo<ColumnDef<Click, unknown>[]>(() => {
    const nm = names.data
    const col = (id: string, header: string, accessorFn: (c: Click) => string | number | null | undefined, extra: Partial<ColumnDef<Click, unknown>> = {}) =>
      ({ id, header, accessorFn, enableSorting: false, ...extra }) as ColumnDef<Click, unknown>
    return [
      col("datetime", "Время клика", (c) => formatDateTime(c.datetime, timezone), { enableHiding: false }),
      col("sub_id", "Subid", (c) => c.sub_id, { enableHiding: false, cell: ({ row }) => <span className="font-mono">{row.original.sub_id}</span> }),
      col("campaign", "Кампания", (c) => nm?.campaigns[c.campaign_id] ?? c.campaign_id, {
        meta: { grow: true },
        cell: ({ row }) => <Clip><EntityName id={row.original.campaign_id} name={nm?.campaigns[row.original.campaign_id]} prefix={pre.campaign} /></Clip>,
      }),
      col("buyer", "Байер", (c) => nm?.buyers[c.buyer_id] ?? "—"),
      col("stream", "Поток", (c) => nm?.streams[c.stream_id] ?? c.stream_id, {
        cell: ({ row }) => <Clip><EntityName id={row.original.stream_id} name={nm?.streams[row.original.stream_id]} prefix={pre.stream} /></Clip>,
      }),
      col("landing", "Лендинг", (c) => (c.landing_id ? nm?.landings[c.landing_id] ?? c.landing_id : "—"), {
        cell: ({ row }) => <Clip><EntityName id={row.original.landing_id} name={row.original.landing_id ? nm?.landings[row.original.landing_id] : undefined} prefix={pre.landing} /></Clip>,
      }),
      col("offer", "Оффер", (c) => (c.offer_id ? nm?.offers[c.offer_id] ?? c.offer_id : "—"), {
        cell: ({ row }) => <Clip><EntityName id={row.original.offer_id} name={row.original.offer_id ? nm?.offers[row.original.offer_id] : undefined} prefix={pre.offer} /></Clip>,
      }),
      col("country", "Страна", (c) => c.country),
      col("region", "Регион", (c) => c.region),
      col("city", "Город", (c) => c.city),
      col("os", "ОС", (c) => c.os),
      col("browser", "Браузер", (c) => c.browser),
      col("device", "Устройство", (c) => DEVICE[c.device_type] ?? c.device_type),
      col("ip", "IP", (c) => c.ip, { cell: ({ row }) => <span className="font-mono">{row.original.ip}</span> }),
      col("is_bot", "Бот", (c) => (c.is_bot ? "Да" : "—"), {
        cell: ({ row }) => (row.original.is_bot ? "Да" : <span className="text-muted-foreground">—</span>),
      }),
      col("is_unique", "Уник.", (c) => (c.is_unique_campaign ? "Да" : "—"), {
        cell: ({ row }) => (row.original.is_unique_campaign ? "Да" : <span className="text-muted-foreground">—</span>),
      }),
      ...(showCost ? [col("cost", "Расход", (c) => c.cost, { meta: { align: "right" }, cell: ({ row }) => fmtMoney(row.original.cost) })] : []),
      ...SUBS.map((k) => col(k, SUB_ALIASES[k], (c) => c[k], { meta: { label: `${k} · ${SUB_ALIASES[k]}` } })),
      col("external_id", "External ID", (c) => c.external_id, { cell: ({ row }) => <span className="font-mono">{row.original.external_id}</span> }),
    ]
  }, [names.data, timezone, showCost, pre])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const res = await api.clicks.log({ range, filters, search: q || undefined, limit: 100000, offset: 0 })
      const fields = FIELD_LABELS.filter(([k]) => showCost || k !== "cost")
      downloadCsv(
        "clicks.csv",
        fields.map(([, label]) => label),
        res.rows.map((c) => fields.map(([k]) => fieldText(k, c, names.data, timezone))),
      )
      toast.success(`Выгружено строк: ${res.rows.length}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Page>
      <PageHeader
        title="Лог кликов"
        actions={
          <>
            <Button variant="outline" asChild><Link to={reportLink({ g: ["campaign"], filters: userFilters, range })}>Открыть как отчёт</Link></Button>
            <Button variant="outline" onClick={exportCsv} disabled={exporting}>
              <Icon icon={DownloadIcon} size={14} /> Выгрузить CSV
            </Button>
          </>
        }
      />
      <Toolbar
        left={
          <>
            <CampaignSelect value={campaign} onChange={setCampaign} />
            <SearchInput value={q} onChange={setQ} placeholder="Subid, IP или external id" className="sm:w-60" />
            <FilterBuilder value={userFilters} onChange={(f) => setFRaw(encodeFilters(f))} />
          </>
        }
        right={<PeriodSelect value={range} onChange={setRange} />}
      />
      <DataTable
        data={log.data?.rows}
        loading={log.isLoading}
        columns={columns}
        getRowId={(c) => c.sub_id}
        onRowClick={(c) => setOpen(c.sub_id)}
        storageKey="clicks-log.v2"
        initialHidden={["buyer", "region", "city", "os", "browser", "device", "ip", "sub_id_1", "sub_id_2", "sub_id_3", "sub_id_4", "sub_id_5", "sub_id_6", "external_id"]}
        serverPaging={{ total: log.data?.total ?? 0, pageIndex: pg.page, pageSize: pg.size, onPageChange: pg.setPage, onPageSizeChange: pg.setSize }}
        empty="Кликов нет за выбранный период"
        onResetFilters={filtered ? resetFilters : undefined}
        emptyHint={hasExactFilter(userFilters) ? RELAX_HINT : undefined}
      />
      <ClickSheet subId={open} onClose={() => setOpen("")} />
    </Page>
  )
}
