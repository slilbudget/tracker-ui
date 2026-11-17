// REFERENCE SECTION. Other list sections follow this structure:
// toolbar (create, search, filters, period) → DataTable with stats → side sheet form → bulk actions.
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { EllipsisIcon, FileIcon, FolderIcon, PlusIcon, ShieldCheckIcon } from "lucide-react"
import type { Landing } from "@/api/types"
import { api } from "@/api/client"

import { useAccess, useHiddenMetrics, usePeriod, useUrlParam, useMissingRecord } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { PeriodSelect } from "@/components/period-select"
import {
  ConfirmDialog, CopyButton, EntitySheet, FormRow, SearchInput, EntityName, StateFilter, metricColumns, metricSummary,
} from "@/components/common"
import { Icon } from "@/components/icon"
import { REDIRECT_TYPES, RedirectSelect } from "@/components/redirect-select"
import { GroupsButton } from "@/features/groups/GroupsDialog"
import { FileDrop, fmtSize } from "@/features/catalog/FileDrop"
import { FormSection, LIST_METRICS, LIST_METRICS_EXTRA, UsedIn, sortMetrics } from "@/features/catalog/ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const LANDING_EXTRA = ["lp_clicks", "lp_ctr"]
const METRICS = sortMetrics([...LIST_METRICS, ...LIST_METRICS_EXTRA, ...LANDING_EXTRA])
const TYPES: { value: Landing["landing_type"]; label: string; hint: string }[] = [
  { value: "local", label: "Локальный", hint: "ZIP-архив, хранится на трекере" },
  { value: "external", label: "Внешний (редирект)", hint: "Страница на другом сервере: трекер перенаправляет посетителя на её адрес" },
  { value: "preloaded", label: "Предзагрузка", hint: "Трекер скачивает страницу и подставляет макросы" },
  { value: "action", label: "Действие", hint: "Выполняет действие вместо показа страницы" },
]

export default function LandingsPage() {
  const qc = useQueryClient()
  const { canEdit } = useAccess("landings")
  const hidden = useHiddenMetrics()
  const [range, setRange] = usePeriod()
  const [q, setQ] = useUrlParam("q")
  const [state, setState] = useUrlParam("state")
  const [group, setGroup] = useUrlParam("group")
  const [editId, setEditId] = useUrlParam("edit") // "new" | id: the sheet is deep-linkable
  const [toDelete, setToDelete] = useState<Landing[] | null>(null)

  const list = useQuery({ queryKey: ["landings"], queryFn: api.landings.list })
  const stats = useQuery({ queryKey: ["stats", "landings", range], queryFn: () => api.landings.stats(range) })
  const groups = useQuery({ queryKey: ["groups", "landings"], queryFn: () => api.groups.list("landings") })
  const streams = useQuery({ queryKey: ["streams"], queryFn: api.streams.list })
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  const usedBy = (ids: number[]) => (streams.data ?? []).filter((s) => s.landings.some((l) => ids.includes(l.landing_id)))

  // New array whenever stats or groups arrive: the table re-reads computed cells.
  const rows = useMemo(
    () =>
      (list.data ?? []).filter(
        (l) =>
          (!q || l.name.toLowerCase().includes(q.toLowerCase()) || String(l.id) === q) &&
          (!state || l.state === state) &&
          (!group || String(l.group_id) === group),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.data, q, state, group, stats.data, groups.data],
  )

  const save = useMutation({
    mutationFn: async ({ v, zip }: { v: Partial<Landing> & { id?: number }; zip: File | null }) => {
      const saved = v.id ? await api.landings.update(v.id, v) : await api.landings.create(v as Omit<Landing, "id">)
      if (zip && saved.landing_type === "local") await api.catalog.setLandingZip(saved.id, { name: zip.name, size: zip.size })
      return saved
    },
    onSuccess: (saved, { v }) => {
      qc.invalidateQueries({ queryKey: ["landing-files"] })
      if (v.id) {
        qc.invalidateQueries({ queryKey: ["landings"] })
        toast.success("Лендинг сохранён")
        setEditId("")
      } else {
        // Stay in the sheet: the new landing gets its «Файлы» and «Как подключить оффер» tabs.
        toast.success("Лендинг создан")
        qc.setQueryData<Landing[]>(["landings"], (old) => [...(old ?? []), saved])
        setEditId(String(saved.id))
      }
    },
  })
  const bulk = useMutation({
    mutationFn: async ({ ids, op }: { ids: number[]; op: "enable" | "disable" | "delete" }) => {
      for (const id of ids) {
        if (op === "delete") await api.landings.remove(id)
        else await api.landings.update(id, { state: op === "enable" ? "active" : "disabled" })
      }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["landings"] })
      toast.success(v.op === "enable" ? `Включено: ${v.ids.length}` : v.op === "disable" ? `Выключено: ${v.ids.length}` : `Перемещено в архив: ${v.ids.length}`)
    },
  })

  const columns = useMemo<ColumnDef<Landing, unknown>[]>(
    () => [
      { accessorKey: "id", header: "ID", size: 60, meta: { align: "right" } },
      {
        accessorKey: "name",
        header: "Название",
        enableHiding: false,
        cell: ({ row }) => <EntityName state={row.original.state} name={row.original.name} />,
      },
      {
        id: "group",
        header: "Группа",
        accessorFn: (l) => groups.data?.find((g) => g.id === l.group_id)?.name ?? "—",
      },
      { id: "type", header: "Тип", accessorFn: (l) => TYPES.find((t) => t.value === l.landing_type)?.label },
      ...metricColumns<Landing>(METRICS, (l) => stats.data?.[l.id], hidden),
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
              <DropdownMenuItem onClick={() => window.location.assign(`#/reports?f_landing=${encodeURIComponent(row.original.name)}`)}>Отчёт по лендингу</DropdownMenuItem>
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
    [groups.data, stats.data, hidden, canEdit, setEditId],
  )

  const editing = editId && editId !== "new" ? list.data?.find((l) => String(l.id) === editId) : undefined
  useMissingRecord(editId, list.data, editing, setEditId)

  return (
    <Page>
      <PageHeader title="Лендинги" />
      <Toolbar
        left={
          <>
            {canEdit && (
              <Button onClick={() => setEditId("new")}>
                <Icon icon={PlusIcon} size={14} /> Создать
              </Button>
            )}
            <GroupsButton type="landings" />
            <SearchInput value={q} onChange={setQ} placeholder="Название или ID" />
          </>
        }
        right={
          <>
            <Select value={group || "all"} onValueChange={(v) => setGroup(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
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
        getRowId={(l) => String(l.id)}
        onRowClick={(l) => setEditId(String(l.id))}
        storageKey="landings.v2"
        initialHidden={["group", "type", ...LIST_METRICS_EXTRA, ...LANDING_EXTRA]}
        initialSort={[{ id: "clicks", desc: true }]}
        summary={metricSummary(METRICS, rows.map((l) => stats.data?.[l.id] ?? {}))}
        bulkActions={
          canEdit
            ? (sel, clear) => (
                <>
                  <Button variant="ghost" onClick={() => { bulk.mutate({ ids: sel.map((x) => x.id), op: "enable" }); clear() }}>Включить</Button>
                  <Button variant="ghost" onClick={() => { bulk.mutate({ ids: sel.map((x) => x.id), op: "disable" }); clear() }}>Выключить</Button>
                  <Button variant="destructive" onClick={() => setToDelete(sel)}>В архив</Button>
                </>
              )
            : undefined
        }
        empty={q || state || group ? "Ничего не найдено по фильтрам" : "Лендингов пока нет"}
      />

      <LandingSheet
        open={!!editId}
        landing={editing}
        readOnly={!canEdit}
        groups={groups.data ?? []}
        onClose={() => setEditId("")}
        onSave={(v, zip) => save.mutate({ v, zip })}
        saving={save.isPending}
        streams={editing ? usedBy([editing.id]) : []}
        campaigns={campaigns.data ?? []}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Переместить в архив: ${toDelete?.length ?? 0}`}
        description={archiveText(usedBy((toDelete ?? []).map((l) => l.id)).length)}
        confirmLabel="В архив"
        destructive
        onConfirm={() => {
          bulk.mutate({ ids: toDelete!.map((x) => x.id), op: "delete" })
          setToDelete(null)
          toast.success("Перемещено в архив")
        }}
      />
    </Page>
  )
}

const archiveText = (n: number) =>
  `${n ? `Лендинги пропадут из потоков: ${n}.` : "Ни в одном потоке эти лендинги не используются."} Восстановить можно в разделе «Архив» в течение 60 дней.`

const OFFER_MACRO = "{offer}"
const SNIPPET = `<a href="${OFFER_MACRO}">Получить бонус</a>`

function LandingSheet({
  open, landing, groups, readOnly, streams, campaigns, onClose, onSave, saving,
}: {
  open: boolean; landing?: Landing; groups: { id: number; name: string }[]; readOnly: boolean
  streams: { id: number; name: string; campaign_id: number }[]; campaigns: { id: number; name: string }[]
  onClose: () => void; onSave: (v: Partial<Landing>, zip: File | null) => void; saving: boolean
}) {
  const [form, setForm] = useState<Partial<Landing>>({})
  const [err, setErr] = useState<Record<string, string>>({})
  const [zip, setZip] = useState<File | null>(null)
  const [tab, setTab] = useState("main")
  const [checking, setChecking] = useState(false)
  const key = landing?.id ?? "new"
  const [loadedKey, setLoadedKey] = useState<string | number | null>(null)
  if (open && loadedKey !== key) {
    // «new» → id means the landing was just created: open the tab that explains the next step.
    // (form.name is empty when the sheet was opened by link before the list loaded — that is not a creation.)
    const created = loadedKey === "new" && landing && !!form.name
    setTab(created ? (landing.landing_type === "local" ? "files" : "connect") : "main")
    setLoadedKey(key)
    setErr({})
    setZip(null)
    setForm(landing ?? { name: "", landing_type: "local", state: "active", group_id: null, url: "", notes: "", action_type: "local_file" })
  }
  if (!open && loadedKey !== null) setLoadedKey(null)
  const set = <K extends keyof Landing>(k: K, v: Landing[K]) => setForm((f) => ({ ...f, [k]: v }))

  const isLocal = landing?.landing_type === "local"
  const files = useQuery({
    queryKey: ["landing-files", landing?.id],
    queryFn: () => api.catalog.landingFiles(landing!.id),
    enabled: open && !!landing && isLocal,
  })
  const savedZip = isLocal ? files.data?.zip ?? null : null

  const submit = () => {
    const e: Record<string, string> = {}
    if (!form.name?.trim()) e.name = "Введите название"
    if (form.landing_type === "local" && !zip && !isLocal) e.zip = "Загрузите ZIP-архив с index.html: без него лендинг нечего показывать"
    if (form.landing_type !== "local" && !form.url?.trim()) e.url = "Укажите адрес страницы"
    setErr(e)
    if (Object.keys(e).length) return
    // an external landing always has one of the three redirect types (http by default)
    // external: one of the three redirect types; local and preloaded pages are served by the tracker itself; action keeps its own
    const action_type = form.landing_type === "external" ? (REDIRECT_TYPES.some((a) => a.key === form.action_type) ? form.action_type : "http") : form.landing_type === "action" ? form.action_type : "local_file"
    onSave({ ...form, action_type, id: landing?.id }, zip)
  }

  const checkUrl = async () => {
    setChecking(true)
    try {
      const r = await api.catalog.checkUrl(form.url ?? "")
      if (r.ok) toast.success(r.message)
      else toast.error(r.message)
    } finally {
      setChecking(false)
    }
  }

  const type = form.landing_type
  const settings = (
    <fieldset disabled={readOnly} className="flex min-w-0 flex-col">
      <FormRow label="Название" error={err.name} htmlFor="l-name">
        <Input id="l-name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err.name} />
      </FormRow>
      <FormRow label="Тип" hint={TYPES.find((t) => t.value === type)?.hint}>
        <Select value={type} onValueChange={(v) => set("landing_type", v as Landing["landing_type"])}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
      </FormRow>
      {type === "local" ? (
        <FormRow label="Архив" hint={err.zip ? undefined : "ZIP с index.html в корне. Ссылку оффера вставьте макросом {offer}."} htmlFor="l-zip">
          <FileDrop
            id="l-zip"
            value={zip ?? savedZip}
            removable={!!zip}
            onChange={(f) => { setZip(f); if (f) setErr((x) => ({ ...x, zip: "" })) }}
            error={err.zip}
          />
        </FormRow>
      ) : (
        <FormRow label="URL" error={err.url} hint="Можно использовать макросы: {subid}, {sub_id_6}, {external_id}, {offer}">
          <div className="flex gap-2">
            <Input value={form.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://" aria-invalid={!!err.url} />
            {type === "external" && (
              <Button type="button" variant="outline" disabled={checking || !form.url?.trim()} onClick={checkUrl}>
                <Icon icon={ShieldCheckIcon} size={14} /> {checking ? "Проверяем…" : "Проверить URL"}
              </Button>
            )}
          </div>
        </FormRow>
      )}
      {type === "external" && (
        <FormRow label="Тип редиректа">
          <RedirectSelect value={REDIRECT_TYPES.some((a) => a.key === form.action_type) ? form.action_type! : "http"} onChange={(v) => set("action_type", v)} />
        </FormRow>
      )}
      <FormRow label="Группа">
        <Select value={form.group_id ? String(form.group_id) : "none"} onValueChange={(v) => set("group_id", v === "none" ? null : Number(v))}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Без группы</SelectItem>
            {groups.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormRow>
      <FormRow label="Включён">
        <Switch checked={form.state === "active"} onCheckedChange={(v) => set("state", v ? "active" : "disabled")} />
      </FormRow>
      <FormRow label="Заметки">
        <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </FormRow>
      {landing && <UsedIn streams={streams} campaigns={campaigns} />}
    </fieldset>
  )

  const folders = new Set((files.data?.files ?? []).filter((f) => f.path.includes("/")).map((f) => f.path.split("/")[0]))
  const connect = (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        Макрос <code className="font-mono text-foreground">{OFFER_MACRO}</code> — ссылка на оффер, выбранный в потоке. Трекер подставляет её сам и добавляет ваш subid, поэтому ссылку оффера в код не вписывают.
      </p>
      <div className="flex items-center gap-2">
        <code className="num rounded-md border bg-muted px-2 py-1 font-mono">{OFFER_MACRO}</code>
        <CopyButton value={OFFER_MACRO} label="Скопировать макрос" />
      </div>
      <FormSection title="Пример для кнопки">
        <div className="flex items-center gap-2 py-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted px-2 py-1 font-mono whitespace-nowrap">{SNIPPET}</code>
          <CopyButton value={SNIPPET} />
        </div>
      </FormSection>
      <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
        {type === "local" || type === undefined ? (
          <>
            <li>Откройте index.html из архива и замените адрес в href кнопок и ссылок на {OFFER_MACRO}.</li>
            <li>Упакуйте страницу обратно в ZIP и загрузите во вкладке «Настройки» через «Заменить».</li>
          </>
        ) : type === "preloaded" ? (
          <li>Трекер скачивает страницу и заменяет {OFFER_MACRO} в её коде. Оставьте {OFFER_MACRO} в href на исходной странице.</li>
        ) : (
          <li>Страница на другом сервере не видит макрос в коде. Передайте его в адрес, например https://example.com/?link={OFFER_MACRO}, и поставьте кнопки на значение link.</li>
        )}
        <li>В потоке выберите этот лендинг и оффер: клик пойдёт по цепочке «лендинг → оффер».</li>
      </ol>
    </div>
  )

  return (
    <EntitySheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={landing ? `Лендинг #${landing.id}` : "Новый лендинг"}
      description={
        readOnly ? "Только просмотр: у вашей роли нет прав на изменение"
        : !landing ? "После создания появятся вкладки «Файлы» и «Как подключить оффер»" : undefined
      }
      onSubmit={readOnly ? undefined : submit}
      submitLabel={landing ? "Сохранить" : "Создать"}
      submitting={saving}
    >
      {landing ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="main">Настройки</TabsTrigger>
            {isLocal && <TabsTrigger value="files">Файлы</TabsTrigger>}
            <TabsTrigger value="connect">Как подключить оффер</TabsTrigger>
          </TabsList>
          <TabsContent value="main">{settings}</TabsContent>
          {isLocal && (
            <TabsContent value="files" className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Архив</span>
                <span className="font-medium">{files.data?.zip.name ?? "…"}</span>
                {files.data && <span className="num text-muted-foreground">{fmtSize(files.data.zip.size)}</span>}
              </div>
              <ul className="rounded-md border text-sm">
                {(files.data?.files ?? []).flatMap((f, i, all) => {
                  const dir = f.path.includes("/") ? f.path.split("/")[0] : ""
                  const first = dir && all.findIndex((x) => x.path.startsWith(`${dir}/`)) === i
                  return [
                    first && folders.has(dir) ? (
                      <li key={`d-${dir}`} className="flex items-center gap-2 border-b px-2 py-1.5">
                        <Icon icon={FolderIcon} size={14} className="text-muted-foreground" />
                        <span className="font-mono">{dir}/</span>
                      </li>
                    ) : null,
                    <li key={f.path} className={`flex items-center gap-2 border-b px-2 py-1.5 last:border-b-0 ${dir ? "pl-6" : ""}`}>
                      <Icon icon={FileIcon} size={14} className="text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-mono">{dir ? f.path.slice(dir.length + 1) : f.path}</span>
                      <span className="num shrink-0 text-muted-foreground">{fmtSize(f.size)}</span>
                    </li>,
                  ]
                })}
              </ul>
              <p className="text-xs text-muted-foreground">Файлы в трекере не правятся. Чтобы изменить страницу, загрузите новый ZIP во вкладке «Настройки».</p>
            </TabsContent>
          )}
          <TabsContent value="connect">{connect}</TabsContent>
        </Tabs>
      ) : (
        settings
      )}
    </EntitySheet>
  )
}
