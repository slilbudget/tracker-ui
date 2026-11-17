// Conversions log: period, status, campaign, partner network, buyer, search by subid / tid; server-like pagination (api.conversions.log).
// Column settings: every field of the conversion and of its click, in the chosen order.
// Row → side sheet (full data, status / payout change with a reason); bulk «Подтвердить» / «Отклонить»;
// «Загрузить конверсии» (CSV text) and «Выгрузить CSV». Money columns are hidden for roles without money access.
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { CheckIcon, DownloadIcon, UploadIcon, XIcon } from "lucide-react"
import type { ConversionLogRow, ConversionStatus } from "@/api/types"
import { api } from "@/api/client"
import { CONVERSION_STATUSES, rejectReasonLabel } from "@/api/meta"
import { useAccess, useApp, useCanSeeMoney, usePeriod, useUrlParam } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { PeriodSelect } from "@/components/period-select"
import { SearchInput, downloadCsv } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { ColumnsButton, useColumnChoice, type ColumnChoice } from "@/components/columns-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDateTime } from "@/lib/dates"
import { fmtMoney } from "@/lib/format"
import { BulkStatusDialog, ConversionSheet, duration } from "./ConversionSheet"
import { ImportSheet } from "./ImportSheet"
import { CampaignSelect, Clip, ConversionStatusCell, EntityName, STATUS_SHORT, CLICK_FIELDS, useColumnPrefixes, usePage, useNames } from "./shared"

const DEFAULT_COLS = ["campaign", "buyer", "landing", "offer", "network", "status", "reject_reason", "revenue"]

const FIXED = ["postback", "sub_id"]

export default function ConversionsLogPage() {
  const { timezone } = useApp()
  const [range, setRange] = usePeriod()
  const [status, setStatus] = useUrlParam("status")
  const [campaign, setCampaign] = useUrlParam("c")
  const [network, setNetwork] = useUrlParam("net")
  const [buyer, setBuyer] = useUrlParam("buyer")
  const [q, setQ] = useUrlParam("q")
  const [open, setOpen] = useUrlParam("conv")
  const [importing, setImporting] = useState(false)
  const [bulk, setBulk] = useState<{ status: ConversionStatus; ids: string[]; clear: () => void } | null>(null)
  const money = useCanSeeMoney()
  const { canEdit } = useAccess("conversions")
  const seeNetworks = useAccess("affiliate_networks").canView
  const names = useNames()
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  const networks = useQuery({ queryKey: ["affiliateNetworks"], queryFn: api.affiliateNetworks.list, enabled: seeNetworks })
  // buyers of the campaigns this viewer sees: the filter is useful only when there is more than one
  const buyerIds = [...new Set((campaigns.data ?? []).map((c) => c.owner_id))]
  const pg = usePage(JSON.stringify([range, status, campaign, network, buyer, q]))
  const query = {
    range, status: status || undefined, campaign_id: campaign ? Number(campaign) : undefined,
    network_id: network && seeNetworks ? Number(network) : undefined, buyer_id: buyer ? Number(buyer) : undefined, search: q || undefined,
  }

  const log = useQuery({
    queryKey: ["conversions", "log", range, status, campaign, network, buyer, q, pg.page, pg.size, seeNetworks],
    queryFn: () =>
      api.conversions.log({ ...query, limit: pg.size, offset: pg.page * pg.size }),
    placeholderData: keepPreviousData,
  })

  const pre = useColumnPrefixes(log.data?.rows, names.data)
  const filtered = !!(status || campaign || network || buyer || q)
  const [, setParams] = useSearchParams()
  // one update for all keys (several useUrlParam setters in a row overwrite each other)
  const resetFilters = () => setParams((p) => { const n = new URLSearchParams(p); ["status", "c", "net", "buyer", "q"].forEach((k) => n.delete(k)); return n }, { replace: true })

  // every field of the log + the fields of the click (Keitaro-like column settings); postback time and subid always shown
  const catalog = useMemo(() => {
    const nm = names.data
    type R = ConversionLogRow
    const defs: (ColumnChoice & { col: ColumnDef<R, unknown> })[] = []
    const add = (group: string, id: string, label: string, accessorFn: (c: R) => string | number | null | undefined, extra: Partial<ColumnDef<R, unknown>> = {}, header = label) =>
      defs.push({ id, label, group, col: { id, header, accessorFn, enableSorting: false, enableHiding: false, ...extra } as ColumnDef<R, unknown> })
    const entity = (id: number | null, name: string | undefined, prefix: string) => <Clip><EntityName id={id} name={name} prefix={prefix} /></Clip>
    const mono = (v: string) => <span className="font-mono">{v}</span>
    add("Основные", "postback", "Время постбека", (c) => formatDateTime(c.postback_datetime, timezone))
    add("Основные", "sub_id", "Subid", (c) => c.sub_id, { cell: ({ row }) => mono(row.original.sub_id) })
    add("Основные", "click_time", "Время клика", (c) => formatDateTime(c.click_datetime, timezone))
    add("Основные", "ttc", "До конверсии", (c) => duration(Date.parse(c.postback_datetime) - Date.parse(c.click_datetime)), { meta: { align: "right" } })
    add("Основные", "campaign", "Кампания", (c) => nm?.campaigns[c.campaign_id] ?? c.campaign_id, { cell: ({ row }) => entity(row.original.campaign_id, nm?.campaigns[row.original.campaign_id], pre.campaign) })
    add("Основные", "buyer", "Байер", (c) => nm?.buyers[nm.campaignOwner[c.campaign_id]] ?? "—")
    add("Основные", "stream", "Поток", (c) => nm?.streams[c.stream_id] ?? c.stream_id, { cell: ({ row }) => entity(row.original.stream_id, nm?.streams[row.original.stream_id], pre.stream) })
    add("Основные", "landing", "Лендинг", (c) => (c.landing_id ? nm?.landings[c.landing_id] ?? c.landing_id : "—"), {
      cell: ({ row }) => entity(row.original.landing_id, row.original.landing_id ? nm?.landings[row.original.landing_id] : undefined, pre.landing),
    })
    add("Основные", "offer", "Оффер", (c) => (c.offer_id ? nm?.offers[c.offer_id] ?? c.offer_id : "—"), {
      meta: { grow: true }, cell: ({ row }) => entity(row.original.offer_id, row.original.offer_id ? nm?.offers[row.original.offer_id] : undefined, pre.offer),
    })
    if (seeNetworks) add("Основные", "network", "Партнёрка", (c) => (c.offer_id ? nm?.networks[nm.offerNetwork[c.offer_id]] ?? "—" : "—"))
    add("Основные", "ts", "Источник", (c) => (c.click?.ts_id ? nm?.sources[c.click.ts_id] ?? c.click.ts_id : "—"))
    add("Статус", "status", "Статус", (c) => c.status, { cell: ({ row }) => <ConversionStatusCell status={row.original.status} /> })
    add("Статус", "original_status", "Исходный статус", (c) => c.original_status, { cell: ({ row }) => <span className="text-muted-foreground">{row.original.original_status}</span> })
    add("Статус", "previous_status", "Предыдущий статус", (c) => (c.previous_status ? STATUS_SHORT[c.previous_status] : "—"), {}, "Предыдущий")
    add("Статус", "reject_reason", "Причина отклонения", (c) => c.reject_reason || "—", {
      cell: ({ row }) => row.original.reject_reason
        ? <span title={rejectReasonLabel(row.original.reject_reason)}>{row.original.reject_reason}</span>
        : <span className="text-muted-foreground">—</span>,
    })
    if (money) {
      add("Деньги", "revenue", "Выплата", (c) => c.revenue, {
        meta: { align: "right" },
        cell: ({ row }) => {
          const c = row.original
          return c.status === "sale" && c.revenue === 0
            ? <span className="font-medium text-destructive" title="Продажа без выплаты: проверьте оффер и постбек">0 $</span>
            : fmtMoney(c.revenue)
        },
      })
      add("Деньги", "rejected_revenue", "Потерянная выплата", (c) => c.rejected_revenue, { meta: { align: "right" }, cell: ({ row }) => (row.original.rejected_revenue ? fmtMoney(row.original.rejected_revenue) : "—") })
    }
    add("ID", "tid", "TID", (c) => c.tid, { cell: ({ row }) => mono(row.original.tid) })
    add("ID", "conversion_id", "ID конверсии", (c) => c.conversion_id, { cell: ({ row }) => mono(row.original.conversion_id) })
    add("ID", "campaign_id", "ID кампании", (c) => c.campaign_id, { meta: { align: "right" } })
    add("ID", "stream_id", "ID потока", (c) => c.stream_id, { meta: { align: "right" } })
    add("ID", "offer_id", "ID оффера", (c) => c.offer_id ?? "—", { meta: { align: "right" } })
    // the click of the conversion: geo (with the flag), device, connection, every sub_id
    for (const f of CLICK_FIELDS) add(f.group === "Параметры" ? "Параметры клика" : f.group, f.id, f.label, (c) => (c.click ? f.value(c.click) || "—" : "—"), f.mono ? { cell: ({ row }) => <span className="font-mono">{row.original.click ? f.value(row.original.click) || "—" : "—"}</span> } : {}, f.header ?? f.label)
    return defs
  }, [names.data, timezone, money, pre, seeNetworks])
  const choice = useColumnChoice("conversions", catalog, DEFAULT_COLS, FIXED)
  const columns = useMemo(
    () => [...FIXED, ...choice.visible].map((id) => catalog.find((d) => d.id === id)?.col).filter((c): c is ColumnDef<ConversionLogRow, unknown> => !!c),
    [catalog, choice.visible],
  )

  const [exporting, setExporting] = useState(false)
  const exportCsv = async () => {
    setExporting(true)
    try {
      const nm = names.data
      const res = await api.conversions.log({ ...query, limit: 100000, offset: 0 })
      downloadCsv(
        "conversions.csv",
        ["Время постбека", "Subid", "Время клика", "Кампания", "Байер", "Поток", "Лендинг", "Оффер", ...(seeNetworks ? ["Партнёрка"] : []), "Статус", "Исходный статус", "Предыдущий статус", ...(money ? ["Выплата"] : []), "TID"],
        res.rows.map((c) => [
          formatDateTime(c.postback_datetime, timezone), c.sub_id, formatDateTime(c.click_datetime, timezone),
          nm?.campaigns[c.campaign_id] ?? c.campaign_id, nm?.buyers[nm.campaignOwner[c.campaign_id]] ?? "", nm?.streams[c.stream_id] ?? c.stream_id,
          c.landing_id ? nm?.landings[c.landing_id] ?? c.landing_id : "", c.offer_id ? nm?.offers[c.offer_id] ?? c.offer_id : "",
          ...(seeNetworks ? [c.offer_id ? nm?.networks[nm.offerNetwork[c.offer_id]] ?? "" : ""] : []),
          STATUS_SHORT[c.status], c.original_status, c.previous_status ? STATUS_SHORT[c.previous_status] : "",
          ...(money ? [c.revenue] : []), c.tid,
        ]),
      )
      toast.success(`Выгружено строк: ${res.rows.length}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Page>
      <PageHeader
        title="Лог конверсий"
        actions={
          <>
            {canEdit && (
              <Button variant="outline" onClick={() => setImporting(true)}>
                <Icon icon={UploadIcon} size={14} /> Загрузить конверсии
              </Button>
            )}
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
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {CONVERSION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {seeNetworks && (
              <Select value={network || "all"} onValueChange={(v) => setNetwork(v === "all" ? "" : v)}>
                <SelectTrigger className="w-44" aria-label="Партнёрка"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все партнёрки</SelectItem>
                  {(networks.data ?? []).map((n) => <SelectItem key={n.id} value={String(n.id)}>{n.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {buyerIds.length > 1 && (
              <Select value={buyer || "all"} onValueChange={(v) => setBuyer(v === "all" ? "" : v)}>
                <SelectTrigger className="w-40" aria-label="Байер"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все байеры</SelectItem>
                  {buyerIds.map((id) => <SelectItem key={id} value={String(id)}>{names.data?.buyers[id] ?? `#${id}`}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <SearchInput value={q} onChange={setQ} placeholder="Subid или TID" />
          </>
        }
        right={
          <>
            <ColumnsButton all={catalog} value={choice.visible} defaults={DEFAULT_COLS} fixed={FIXED} onChange={choice.setVisible} />
            <PeriodSelect value={range} onChange={setRange} />
          </>
        }
      />
      <DataTable
        data={log.data?.rows}
        loading={log.isLoading}
        columns={columns}
        getRowId={(c) => c.conversion_id}
        onRowClick={(c) => setOpen(c.conversion_id)}
        bulkActions={
          canEdit
            ? (sel, clear) => (
                <>
                  <Button variant="ghost" onClick={() => setBulk({ status: "sale", ids: sel.map((c) => c.conversion_id), clear })}>
                    <Icon icon={CheckIcon} size={14} /> Подтвердить
                  </Button>
                  <Button variant="ghost" onClick={() => setBulk({ status: "rejected", ids: sel.map((c) => c.conversion_id), clear })}>
                    <Icon icon={XIcon} size={14} /> Отклонить
                  </Button>
                </>
              )
            : undefined
        }
        storageKey="conversions-log.v4"
        serverPaging={{ total: log.data?.total ?? 0, pageIndex: pg.page, pageSize: pg.size, onPageChange: pg.setPage, onPageSizeChange: pg.setSize }}
        empty="Конверсий нет за выбранный период"
        onResetFilters={filtered ? resetFilters : undefined}
      />
      <ConversionSheet id={open} onClose={() => setOpen("")} />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
      <BulkStatusDialog status={bulk?.status ?? null} ids={bulk?.ids ?? []} onClose={() => setBulk(null)} onDone={() => bulk?.clear()} />
    </Page>
  )
}
