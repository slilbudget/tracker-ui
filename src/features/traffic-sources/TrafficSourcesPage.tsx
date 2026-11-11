// Traffic sources: list with stats, sheet with parameter-matrix editor, S2S postback and «apply to campaigns».
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { EllipsisIcon, PlusIcon, XIcon } from "lucide-react"
import type { CampaignParameter, ConversionStatus, TrafficSource } from "@/api/types"
import { api } from "@/api/client"
import { CONVERSION_STATUSES } from "@/api/meta"
import { useAccess, useHiddenMetrics, usePeriod, useUrlParam, useMissingRecord } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { PeriodSelect } from "@/components/period-select"
import { ConfirmDialog, EntitySheet, FormRow, SearchInput, EntityName, StateFilter, metricColumns, metricSummary } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FormSection, LIST_METRICS, LIST_METRICS_EXTRA, UsedInCampaigns, sortMetrics } from "@/features/catalog/ui"

const METRICS = sortMetrics([...LIST_METRICS, ...LIST_METRICS_EXTRA])

const PARAM_NAMES = [
  ...Array.from({ length: 30 }, (_, i) => `sub_id_${i + 1}`),
  "keyword", "external_id", "creative_id", "ad_campaign_id", "source", "cost",
]

const TEMPLATES: { value: string; label: string; hint: string; parameters: CampaignParameter[] }[] = [
  {
    value: "facebook", label: "Facebook", hint: "Параметры динамических макросов Facebook Ads",
    parameters: [
      { name: "sub_id_1", alias: "Кабинет", placeholder: "{{account.id}}" },
      { name: "sub_id_2", alias: "Плейсмент", placeholder: "{{placement}}" },
      { name: "sub_id_3", alias: "ID группы", placeholder: "{{adset.id}}" },
      { name: "sub_id_4", alias: "Группа", placeholder: "{{adset.name}}" },
      { name: "sub_id_6", alias: "ID объявления", placeholder: "{{ad.id}}" },
    ],
  },
  {
    value: "pwa", label: "PWA", hint: "Трафик из PWA-приложений: click id и пиксель",
    parameters: [
      { name: "external_id", alias: "Click ID PWA", placeholder: "{clickId}" },
      { name: "sub_id_5", alias: "Пиксель", placeholder: "{fbp}" },
    ],
  },
  {
    value: "tiktok", label: "TikTok", hint: "Макросы TikTok Ads",
    parameters: [
      { name: "sub_id_1", alias: "Кабинет", placeholder: "__ADVERTISER_ID__" },
      { name: "sub_id_3", alias: "ID группы", placeholder: "__AID__" },
      { name: "sub_id_6", alias: "ID объявления", placeholder: "__CID__" },
      { name: "external_id", alias: "Click ID", placeholder: "__CALLBACK_PARAM__" },
    ],
  },
  { value: "custom", label: "Своё", hint: "Параметры задаются вручную", parameters: [] },
]
const templateOf = (name: string) => TEMPLATES.find((t) => t.value === name) ?? TEMPLATES[3]

type Op = "enable" | "disable" | "delete"

export default function TrafficSourcesPage() {
  const qc = useQueryClient()
  const { canEdit } = useAccess("traffic_sources")
  const hidden = useHiddenMetrics()
  const [range, setRange] = usePeriod()
  const [q, setQ] = useUrlParam("q")
  const [state, setState] = useUrlParam("state")
  const [editId, setEditId] = useUrlParam("edit")
  const [toDelete, setToDelete] = useState<TrafficSource[] | null>(null)

  const list = useQuery({ queryKey: ["trafficSources"], queryFn: api.trafficSources.list })
  const stats = useQuery({ queryKey: ["stats", "trafficSources", range], queryFn: () => api.trafficSources.stats(range) })
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  const streams = useQuery({ queryKey: ["streams"], queryFn: api.streams.list })
  // Streams of the campaigns that use the given sources.
  const streamsOf = (sourceIds: number[]) => {
    const ids = new Set((campaigns.data ?? []).filter((c) => c.traffic_source_id && sourceIds.includes(c.traffic_source_id)).map((c) => c.id))
    return (streams.data ?? []).filter((s) => ids.has(s.campaign_id))
  }

  const campaignCount = useMemo(() => {
    const m = new Map<number, number>()
    for (const c of campaigns.data ?? []) if (c.traffic_source_id) m.set(c.traffic_source_id, (m.get(c.traffic_source_id) ?? 0) + 1)
    return m
  }, [campaigns.data])

  const rows = useMemo(
    () =>
      (list.data ?? []).filter(
        (t) => (!q || t.name.toLowerCase().includes(q.toLowerCase()) || String(t.id) === q) && (!state || t.state === state),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.data, q, state, stats.data, campaignCount],
  )

  const save = useMutation({
    mutationFn: (v: Partial<TrafficSource> & { id?: number }) =>
      v.id ? api.trafficSources.update(v.id, v) : api.trafficSources.create(v as Omit<TrafficSource, "id">),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["trafficSources"] })
      toast.success(v.id ? "Источник сохранён" : "Источник создан")
      setEditId("")
    },
  })
  // Saves the source and copies its parameters and traffic loss into every campaign that uses it.
  const apply = useMutation({
    mutationFn: async (v: Partial<TrafficSource> & { id: number }) => {
      await api.trafficSources.update(v.id, v)
      const mine = (campaigns.data ?? []).filter((c) => c.traffic_source_id === v.id)
      for (const c of mine) await api.campaigns.update(c.id, { parameters: structuredClone(v.parameters ?? []), traffic_loss: v.traffic_loss ?? 0 })
      return mine.length
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["trafficSources"] })
      qc.invalidateQueries({ queryKey: ["campaigns"] })
      toast.success(`Параметры применены к кампаниям: ${n}`)
      setEditId("")
    },
  })
  const bulk = useMutation({
    mutationFn: async ({ items, op }: { items: TrafficSource[]; op: Op }) => {
      for (const t of items) {
        if (op === "delete") await api.trafficSources.remove(t.id)
        else await api.trafficSources.update(t.id, { state: op === "enable" ? "active" : "disabled" })
      }
    },
    onSuccess: (_, { op, items }) => {
      qc.invalidateQueries({ queryKey: ["trafficSources"] })
      toast.success({ enable: "Включено", disable: "Выключено", delete: "Перемещено в архив" }[op] + `: ${items.length}`)
    },
  })

  const columns = useMemo<ColumnDef<TrafficSource, unknown>[]>(
    () => [
      { accessorKey: "id", header: "ID", size: 60, meta: { align: "right" } },
      {
        accessorKey: "name",
        header: "Название",
        enableHiding: false,
        cell: ({ row }) => <EntityName state={row.original.state} name={row.original.name} />,
      },
      { id: "template", header: "Шаблон", accessorFn: (t) => templateOf(t.template_name).label },
      { id: "campaigns", header: "Кампаний", meta: { align: "right" }, accessorFn: (t) => campaignCount.get(t.id) ?? 0 },
      ...metricColumns<TrafficSource>(METRICS, (t) => stats.data?.[t.id], hidden),
      {
        id: "_menu",
        enableHiding: false,
        enableSorting: false,
        size: 36,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon-sm" aria-label="Действия"><Icon icon={EllipsisIcon} size={14} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => setEditId(String(row.original.id))}>Изменить</DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.location.assign(`#/reports?f_ts=${encodeURIComponent(row.original.name)}`)}>Отчёт по источнику</DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setToDelete([row.original])}>В архив</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [stats.data, campaignCount, hidden, canEdit, setEditId],
  )

  const editing = editId && editId !== "new" ? list.data?.find((t) => String(t.id) === editId) : undefined
  useMissingRecord(editId, list.data, editing, setEditId)

  return (
    <Page>
      <PageHeader title="Источники трафика" />
      <Toolbar
        left={
          <>
            {canEdit && (
              <Button onClick={() => setEditId("new")}>
                <Icon icon={PlusIcon} size={14} /> Создать
              </Button>
            )}
            <SearchInput value={q} onChange={setQ} placeholder="Название или ID" />
          </>
        }
        right={
          <>
            <StateFilter value={state} onChange={setState} />
            <PeriodSelect value={range} onChange={setRange} />
          </>
        }
      />
      <DataTable
        data={rows}
        loading={list.isLoading}
        columns={columns}
        getRowId={(t) => String(t.id)}
        onRowClick={(t) => setEditId(String(t.id))}
        storageKey="traffic-sources.v2"
        initialHidden={["template", ...LIST_METRICS_EXTRA]}
        initialSort={[{ id: "clicks", desc: true }]}
        summary={{ campaigns: rows.reduce((s, t) => s + (campaignCount.get(t.id) ?? 0), 0), ...metricSummary(METRICS, rows.map((t) => stats.data?.[t.id] ?? {})) }}
        bulkActions={
          canEdit
            ? (sel, clear) => (
                <>
                  <Button variant="ghost" onClick={() => { bulk.mutate({ items: sel, op: "enable" }); clear() }}>Включить</Button>
                  <Button variant="ghost" onClick={() => { bulk.mutate({ items: sel, op: "disable" }); clear() }}>Выключить</Button>
                  <Button variant="destructive" onClick={() => setToDelete(sel)}>В архив</Button>
                </>
              )
            : undefined
        }
        empty={q || state ? "Ничего не найдено по фильтрам" : "Источников пока нет"}
      />

      <SourceSheet
        open={!!editId}
        source={editing}
        readOnly={!canEdit}
        campaignsCount={editing ? campaignCount.get(editing.id) ?? 0 : 0}
        streams={editing ? streamsOf([editing.id]) : []}
        campaigns={(campaigns.data ?? []).filter((c) => editing && c.traffic_source_id === editing.id)}
        onClose={() => setEditId("")}
        onSave={(v) => save.mutate(v)}
        onApply={(v) => apply.mutate(v)}
        saving={save.isPending || apply.isPending}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Переместить в архив: ${toDelete?.length ?? 0}`}
        description={`Кампании этих источников продолжат работать. Источники указаны в кампаниях: ${
          (toDelete ?? []).reduce((s, t) => s + (campaignCount.get(t.id) ?? 0), 0)
        }, в них потоков: ${streamsOf((toDelete ?? []).map((t) => t.id)).length}. Восстановить можно в разделе «Архив» в течение 60 дней.`}
        confirmLabel="В архив"
        destructive
        onConfirm={() => {
          bulk.mutate({ items: toDelete!, op: "delete" })
          setToDelete(null)
        }}
      />
    </Page>
  )
}

const EMPTY: Partial<TrafficSource> = {
  name: "", state: "active", template_name: "custom", postback_url: "", postback_statuses: [], parameters: [], traffic_loss: 0, notes: "",
}

function SourceSheet({
  open, source, campaignsCount, streams, campaigns, readOnly, onClose, onSave, onApply, saving,
}: {
  open: boolean; source?: TrafficSource; campaignsCount: number; readOnly: boolean
  streams: { id: number; name: string; campaign_id: number }[]; campaigns: { id: number; name: string }[]
  onClose: () => void; onSave: (v: Partial<TrafficSource>) => void; onApply: (v: Partial<TrafficSource> & { id: number }) => void; saving: boolean
}) {
  const [form, setForm] = useState<Partial<TrafficSource>>({})
  const [err, setErr] = useState<Record<string, string>>({})
  const [confirmApply, setConfirmApply] = useState(false)
  const key = source?.id ?? "new"
  const [loadedKey, setLoadedKey] = useState<string | number | null>(null)
  if (open && loadedKey !== key) {
    setLoadedKey(key)
    setErr({})
    setForm(source ? structuredClone(source) : EMPTY)
  }
  if (!open && loadedKey !== null) setLoadedKey(null)
  const set = <K extends keyof TrafficSource>(k: K, v: TrafficSource[K]) => setForm((f) => ({ ...f, [k]: v }))
  const params = form.parameters ?? []
  const setParam = (i: number, patch: Partial<CampaignParameter>) => set("parameters", params.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const statuses = form.postback_statuses ?? []
  const tpl = templateOf(form.template_name ?? "custom")

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name?.trim()) e.name = "Введите название"
    const names = params.map((p) => p.name)
    if (new Set(names).size !== names.length) e.params = "Один параметр выбран дважды: оставьте по одной строке на параметр"
    else if (params.some((p) => !p.placeholder.trim())) e.params = "Заполните токен у каждого параметра или удалите строку"
    const loss = form.traffic_loss ?? 0
    if (loss < 0 || loss > 100) e.loss = "Потери трафика: число от 0 до 100"
    setErr(e)
    return Object.keys(e).length === 0
  }
  const submit = () => validate() && onSave({ ...form, id: source?.id })

  return (
    <>
      <EntitySheet
        open={open}
        onOpenChange={(v) => !v && onClose()}
        title={source ? `Источник #${source.id}` : "Новый источник"}
        description={readOnly ? "Только просмотр: у вашей роли нет прав на изменение" : undefined}
        onSubmit={readOnly ? undefined : submit}
        submitLabel={source ? "Сохранить" : "Создать"}
        submitting={saving}
        wide
        footerExtra={
          !readOnly && source ? (
            <Button type="button" variant="outline" onClick={() => validate() && setConfirmApply(true)}>Применить к кампаниям</Button>
          ) : undefined
        }
      >
        <fieldset disabled={readOnly} className="flex min-w-0 flex-col">
          <FormSection title="Основное">
            <FormRow label="Название" error={err.name} htmlFor="t-name">
              <Input id="t-name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err.name} />
            </FormRow>
            <FormRow label="Шаблон" hint={`${tpl.hint}. Выбор шаблона заменяет таблицу параметров.`}>
              <Select
                value={tpl.value}
                onValueChange={(v) => {
                  const t = templateOf(v)
                  setForm((f) => ({ ...f, template_name: v, parameters: v === "custom" ? f.parameters : structuredClone(t.parameters) }))
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{TEMPLATES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </FormRow>
            <FormRow label="Потери трафика, %" error={err.loss} hint="Доля кликов, которую трекер не учитывает в статистике (расхождение с источником)">
              <Input
                type="number" min={0} max={100} step="0.1" inputMode="decimal" className="num"
                value={form.traffic_loss ?? 0} onChange={(e) => set("traffic_loss", Number(e.target.value))} aria-invalid={!!err.loss}
              />
            </FormRow>
          </FormSection>

          <FormSection title="Параметры">
            <div className="flex flex-col gap-1 py-2">
              <p className="text-xs text-muted-foreground">
                Какие метки источник передаёт в ссылке: имя в трекере, название в отчётах и токен, который подставляет источник.
              </p>
              {params.length > 0 && (
                <div className="hidden gap-2 text-xs text-muted-foreground sm:flex">
                  <span className="w-36">Параметр</span><span className="flex-1">Название в отчётах</span><span className="flex-1">Токен источника</span><span className="w-7" />
                </div>
              )}
              {params.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select value={p.name} onValueChange={(v) => setParam(i, { name: v })}>
                    <SelectTrigger className="w-36" aria-label="Параметр"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(PARAM_NAMES.includes(p.name) ? PARAM_NAMES : [p.name, ...PARAM_NAMES]).map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="min-w-28 flex-1" aria-label="Название в отчётах" placeholder="Название" value={p.alias} onChange={(e) => setParam(i, { alias: e.target.value })} />
                  <Input className="min-w-28 flex-1 font-mono" aria-label="Токен" placeholder="{{ad.id}}" value={p.placeholder} onChange={(e) => setParam(i, { placeholder: e.target.value })} />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Удалить параметр" onClick={() => set("parameters", params.filter((_, j) => j !== i))}>
                    <Icon icon={XIcon} size={14} />
                  </Button>
                </div>
              ))}
              {err.params && <p className="text-xs text-destructive">{err.params}</p>}
              <div>
                <Button
                  type="button" variant="outline"
                  onClick={() => set("parameters", [...params, { name: PARAM_NAMES.find((n) => !params.some((p) => p.name === n)) ?? "sub_id_1", alias: "", placeholder: "" }])}
                >
                  <Icon icon={PlusIcon} size={14} /> Добавить параметр
                </Button>
              </div>
            </div>
          </FormSection>

          <FormSection title="S2S-постбек">
            <FormRow label="URL постбека" hint="Адрес источника, куда трекер отправит конверсию. Макросы: {subid}, {status}, {payout}, {sub_id_1}…{sub_id_30}, {external_id}">
              <Input className="font-mono" value={form.postback_url ?? ""} onChange={(e) => set("postback_url", e.target.value)} placeholder="https://" />
            </FormRow>
            <FormRow label="Отправлять статусы" hint={statuses.length ? undefined : "Не выбрано ни одного статуса: постбеки не отправляются"}>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {CONVERSION_STATUSES.map((s) => (
                  <Label key={s.value} className="flex items-center gap-2 text-sm font-normal">
                    <Checkbox
                      checked={statuses.includes(s.value)}
                      onCheckedChange={(v) =>
                        set("postback_statuses", (v ? [...statuses, s.value] : statuses.filter((x) => x !== s.value)) as ConversionStatus[])
                      }
                    />
                    {s.label}
                  </Label>
                ))}
              </div>
            </FormRow>
          </FormSection>

          {source && (
            <FormSection title="Использование">
              <UsedInCampaigns campaigns={campaigns} streamsCount={streams.length} />
            </FormSection>
          )}

          <FormSection title="Заметки">
            <FormRow label="Заметки">
              <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
            </FormRow>
          </FormSection>
        </fieldset>
      </EntitySheet>
      <ConfirmDialog
        open={confirmApply}
        onOpenChange={setConfirmApply}
        title="Применить к кампаниям"
        description={`Источник будет сохранён, а его параметры и потери трафика перезапишут настройки в кампаниях этого источника: ${campaignsCount}. Свои параметры в кампаниях пропадут.`}
        confirmLabel="Применить"
        onConfirm={() => {
          setConfirmApply(false)
          if (source) onApply({ ...form, id: source.id })
        }}
      />
    </>
  )
}
