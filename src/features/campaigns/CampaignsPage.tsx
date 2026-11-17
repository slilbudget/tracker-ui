import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { ChartColumnIcon, PlusIcon } from "lucide-react"
import type { Campaign } from "@/api/types"
import { api } from "@/api/client"
import { ApproachSelect } from "./ApproachSelect"
import { useAccess, useHiddenMetrics, usePeriod, useUrlParam } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { PeriodSelect } from "@/components/period-select"
import {
  ConfirmDialog, CopyButton, EntitySheet, FormRow, SearchInput, EntityName, StateFilter, metricColumns, metricSummary,
} from "@/components/common"
import { Icon } from "@/components/icon"
import { Slicer } from "@/components/slicer"
import { TagChips } from "@/components/tags-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GroupsButton } from "@/features/groups/GroupsDialog"
import { LIST_METRICS, LIST_METRICS_EXTRA, sortMetrics } from "@/features/catalog/ui"

const METRICS = sortMetrics([...LIST_METRICS, ...LIST_METRICS_EXTRA])

export default function CampaignsPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const { canEdit } = useAccess("campaigns")
  const hidden = useHiddenMetrics()
  const [range, setRange] = usePeriod()
  const [q, setQ] = useUrlParam("q")
  const [state, setState] = useUrlParam("state")
  const [group, setGroup] = useUrlParam("group")
  const [source, setSource] = useUrlParam("source")
  const [tagsRaw, setTagsRaw] = useUrlParam("tags")
  const tags = useMemo(() => (tagsRaw ? tagsRaw.split(",") : []), [tagsRaw])
  const [creating, setCreating] = useUrlParam("edit")
  const [toArchive, setToArchive] = useState<Campaign[] | null>(null)

  const list = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  const stats = useQuery({ queryKey: ["stats", "campaigns", range], queryFn: () => api.campaigns.stats(range) })
  const groups = useQuery({ queryKey: ["groups", "campaigns"], queryFn: () => api.groups.list("campaigns") })
  const sources = useQuery({ queryKey: ["trafficSources"], queryFn: api.trafficSources.list })
  const domains = useQuery({ queryKey: ["domains"], queryFn: api.domains.list })
  const streams = useQuery({ queryKey: ["streams", "all"], queryFn: async () => {
    const cs = await api.campaigns.list()
    const all = await Promise.all(cs.map((c) => api.streams.byCampaign(c.id)))
    return Object.fromEntries(cs.map((c, i) => [c.id, all[i]]))
  } })

  const rows = useMemo(
    () =>
      (list.data ?? []).filter(
        (c) =>
          (!q || c.name.toLowerCase().includes(q.toLowerCase()) || String(c.id) === q || c.alias === q) &&
          (!state || c.state === state) &&
          (!group || String(c.group_id) === group) &&
          (!source || String(c.traffic_source_id) === source) &&
          (!tags.length || c.tags.some((t) => tags.includes(t))),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.data, q, state, group, source, tags, stats.data, groups.data, streams.data, domains.data],
  )

  const bulk = useMutation({
    mutationFn: async ({ ids, op }: { ids: number[]; op: "enable" | "disable" | "delete" | "clone" }) => {
      // campaigns seen through a «read» grant are skipped (cloning only reads the source, so it is allowed)
      let skipped = 0
      for (const id of ids) {
        if (op !== "clone" && (await api.campaigns.access(id)).level !== "edit") { skipped++; continue }
        if (op === "delete") await api.campaigns.remove(id)
        else if (op === "clone") await api.campaigns.clone(id)
        else await api.campaigns.update(id, { state: op === "enable" ? "active" : "disabled" })
      }
      return skipped
    },
    onSuccess: (skipped, v) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] })
      qc.invalidateQueries({ queryKey: ["streams"] })
      const done = v.op === "clone" ? "Кампании клонированы" : v.op === "delete" ? "Перемещено в архив" : "Готово"
      if (skipped) toast.warning(`${done}. Пропущено ${skipped}: только просмотр`)
      else toast.success(done)
    },
    onError: (e: Error) => { qc.invalidateQueries({ queryKey: ["campaigns"] }); toast.error(e.message) },
  })
  const create = useMutation({
    mutationFn: async ({ template_id, ...c }: Pick<Campaign, "name" | "domain_id" | "group_id" | "traffic_source_id" | "template_id" | "approach">) => {
      const src = sources.data?.find((s) => s.id === c.traffic_source_id)
      const created = await api.campaigns.create({
        ...c, is_template: false, template_id, alias: Math.random().toString(36).slice(2, 10), state: "active", uniqueness_method: "ip_ua",
        uniqueness_use_cookies: true, cookies_ttl: 24, stats_excluded: false, tags: [],
        parameters: src ? structuredClone(src.parameters) : [], postbacks: [], notes: "", owner_id: 0, // the API sets the owner from the session
        created_at: "", updated_at: "",
      })
      // new campaign from a reference: its streams are copied in right away
      if (template_id) await api.campaigns.applyTemplate(template_id, [created.id], false)
      return created
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] })
      toast.success(c.template_id ? "Кампания создана, потоки скопированы из эталона" : "Кампания создана. Добавьте потоки")
      nav(`/campaigns/${c.id}`)
    },
  })

  const columns = useMemo<ColumnDef<Campaign, unknown>[]>(
    () => [
      { accessorKey: "id", header: "ID", size: 60, meta: { align: "right" } },
      {
        accessorKey: "name",
        header: "Название",
        enableHiding: false,
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-2">
            <EntityName state={row.original.state} name={row.original.name} />
            {row.original.is_template && <span className="shrink-0 rounded-sm border px-1 text-xs text-muted-foreground">эталон</span>}
            {row.original.stats_excluded && <span className="shrink-0 rounded-sm border px-1 text-xs text-warning" title="Не учитывается в отчётах, дашборде и трендах">не в статистике</span>}
            <TagChips tags={row.original.tags} />
            {/* straight to the report of this campaign, by stream (like the report icon in Keitaro's list) */}
            <Link
              to={`/reports?f_campaign=${encodeURIComponent(row.original.name)}&g=stream`}
              onClick={(e) => e.stopPropagation()}
              title="Отчёт по кампании"
              aria-label={`Отчёт по кампании ${row.original.name}`}
              className="ml-auto shrink-0 rounded-sm p-1 text-muted-foreground hover:text-foreground"
            >
              <Icon icon={ChartColumnIcon} size={14} />
            </Link>
          </span>
        ),
      },
      {
        id: "template",
        header: "Эталон",
        accessorFn: (c) => (c.is_template ? "это эталон" : c.template_id ? list.data?.find((x) => x.id === c.template_id)?.name ?? "—" : "—"),
      },
      { id: "approach", header: "Подход", accessorFn: (c) => c.approach || "—" },
      { id: "group", header: "Группа", accessorFn: (c) => groups.data?.find((g) => g.id === c.group_id)?.name ?? "—" },
      { id: "source", header: "Источник", accessorFn: (c) => sources.data?.find((s) => s.id === c.traffic_source_id)?.name ?? "—" },
      {
        id: "streams",
        header: "Потоки",
        meta: { align: "right", label: "Потоки (с трафиком / всего)" },
        accessorFn: (c) => streams.data?.[c.id]?.length ?? 0,
        cell: ({ row }) => {
          const ss = streams.data?.[row.original.id] ?? []
          const live = ss.filter((s) => s.state === "active" && (s.type !== "regular" || s.weight > 0)).length
          return <span className="num">{live} / {ss.length}</span>
        },
      },
      {
        id: "link",
        header: "Ссылка",
        enableSorting: false,
        accessorFn: (c) => `${domains.data?.find((d) => d.id === c.domain_id)?.name ?? ""}/${c.alias}`,
        cell: ({ getValue }) => (
          <span className="flex items-center gap-1">
            <span className="max-w-48 truncate font-mono text-muted-foreground">{getValue() as string}</span>
            <CopyButton value={`https://${getValue() as string}`} />
          </span>
        ),
      },
      ...metricColumns<Campaign>(METRICS, (c) => stats.data?.[c.id], hidden),
    ],
    [groups.data, sources.data, streams.data, domains.data, stats.data, hidden, list.data],
  )

  return (
    <Page>
      <PageHeader title="Кампании" />
      <Toolbar
        left={
          <>
            {canEdit && <Button onClick={() => setCreating("new")}><Icon icon={PlusIcon} size={14} /> Создать</Button>}
            <GroupsButton type="campaigns" />
            <SearchInput value={q} onChange={setQ} placeholder="Название или ID" className="sm:w-64" />
            <Slicer label="Теги" options={[...new Set((list.data ?? []).flatMap((c) => c.tags))].sort().map((t) => ({ value: t, label: t }))} value={tags} onChange={(v) => setTagsRaw(v.join(","))} />
          </>
        }
        right={
          <>
            <Select value={source || "all"} onValueChange={(v) => setSource(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все источники</SelectItem>
                {sources.data?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={group || "all"} onValueChange={(v) => setGroup(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все группы</SelectItem>
                {groups.data?.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <StateFilter value={state} onChange={setState} />
            <PeriodSelect value={range} onChange={setRange} />
          </>
        }
      />
      <DataTable
        data={rows}
        loading={list.isLoading}
        columns={columns}
        getRowId={(c) => String(c.id)}
        onRowClick={(c) => nav(`/campaigns/${c.id}`)}
        storageKey="campaigns.v3"
        initialSort={[{ id: "clicks", desc: true }]}
        initialHidden={["template", "group", "source", "streams", "link", ...LIST_METRICS_EXTRA]}
        summary={metricSummary(METRICS, rows.map((c) => stats.data?.[c.id] ?? {}))}
        bulkActions={
          canEdit
            ? (sel, clear) => (
                <>
                  <Button variant="ghost" onClick={() => { bulk.mutate({ ids: sel.map((x) => x.id), op: "enable" }); clear() }}>Включить</Button>
                  <Button variant="ghost" onClick={() => { bulk.mutate({ ids: sel.map((x) => x.id), op: "disable" }); clear() }}>Выключить</Button>
                  <Button variant="ghost" onClick={() => { bulk.mutate({ ids: sel.map((x) => x.id), op: "clone" }); clear() }}>Клонировать</Button>
                  <Button variant="destructive" onClick={() => setToArchive(sel)}>В архив</Button>
                </>
              )
            : undefined
        }
        empty={q || state || group || source ? "Ничего не найдено по фильтрам" : "Кампаний пока нет"}
      />

      <NewCampaignSheet
        open={creating === "new"}
        onClose={() => setCreating("")}
        domains={(domains.data ?? []).filter((d) => d.status === "ok")}
        groups={groups.data ?? []}
        sources={sources.data ?? []}
        templates={(list.data ?? []).filter((c) => c.is_template).map((c) => ({ id: c.id, name: c.name }))}
        onCreate={(v) => create.mutate(v)}
        saving={create.isPending}
      />
      <ConfirmDialog
        open={!!toArchive}
        onOpenChange={(v) => !v && setToArchive(null)}
        title={`Переместить кампании в архив: ${toArchive?.length ?? 0}`}
        description="Ссылки этих кампаний перестанут работать сразу. Статистика сохранится."
        confirmLabel="В архив"
        destructive
        onConfirm={() => { bulk.mutate({ ids: toArchive!.map((c) => c.id), op: "delete" }); setToArchive(null) }}
      />
    </Page>
  )
}

function NewCampaignSheet({ open, onClose, domains, groups, sources, templates, onCreate, saving }: {
  open: boolean; onClose: () => void; domains: { id: number; name: string }[]; groups: { id: number; name: string }[]
  sources: { id: number; name: string }[]; templates: { id: number; name: string }[]
  onCreate: (v: Pick<Campaign, "name" | "domain_id" | "group_id" | "traffic_source_id" | "template_id" | "approach">) => void; saving: boolean
}) {
  const [name, setName] = useState("")
  const [template, setTemplate] = useState("none")
  const [approach, setApproach] = useState("")
  const [domain, setDomain] = useState("")
  const [group, setGroup] = useState("none")
  const [source, setSource] = useState("")
  const [err, setErr] = useState<Record<string, string>>({})
  return (
    <EntitySheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Новая кампания"
      description="Основное сейчас, потоки и остальные настройки — на странице кампании"
      submitLabel="Создать"
      submitting={saving}
      onSubmit={() => {
        const e: Record<string, string> = {}
        if (!name.trim()) e.name = "Введите название"
        if (!domain) e.domain = "Выберите домен"
        if (!approach) e.approach = "Выберите подход"
        setErr(e)
        if (Object.keys(e).length) return
        onCreate({
          name: name.trim(), domain_id: Number(domain), group_id: group === "none" ? null : Number(group),
          traffic_source_id: source ? Number(source) : null, template_id: template === "none" ? null : Number(template), approach,
        })
      }}
    >
      <FormRow label="Название" error={err.name} hint="Подход + гео + байер, например: US | a_volkov | NEURO | iOS/PWA" htmlFor="c-name">
        <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err.name} />
      </FormRow>
      <FormRow label="Подход" error={err.approach} hint={err.approach ? undefined : "Из общего справочника. Нет нужного — «Новый»: появится у всех"}>
        <ApproachSelect value={approach} onChange={setApproach} invalid={!!err.approach} />
      </FormRow>
      <FormRow label="Эталон" hint="Потоки и офферы скопируются из эталонной кампании, дальше кампания обновляется вместе с ним">
        <Select value={template} onValueChange={setTemplate}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Без эталона: потоки настрою вручную</SelectItem>
            {templates.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormRow>
      <FormRow label="Домен" error={err.domain} hint="Показаны только домены со статусом «Работает»">
        <Select value={domain} onValueChange={setDomain}>
          <SelectTrigger className="w-full" aria-invalid={!!err.domain}><SelectValue placeholder="Выберите домен" /></SelectTrigger>
          <SelectContent>{domains.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
      </FormRow>
      <FormRow label="Источник" hint="Параметры ссылки возьмутся из источника">
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Не задан" /></SelectTrigger>
          <SelectContent>{sources.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </FormRow>
      <FormRow label="Группа">
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Без группы</SelectItem>
            {groups.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormRow>
    </EntitySheet>
  )
}
