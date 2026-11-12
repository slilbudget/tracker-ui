// Domains: list with DNS / SSL status, bulk check, add-domain sheet with the A-record instruction.
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { EllipsisIcon, PlusIcon, RefreshCwIcon } from "lucide-react"
import type { Domain, DomainStatus } from "@/api/types"
import { api } from "@/api/client"

import { useAccess, useUrlParam, useMissingRecord } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { CopyButton, EntitySheet, FormRow, SearchInput, StateDot } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { GroupsButton } from "@/features/groups/GroupsDialog"
import { FilterSelect, FormSection, RefSelect } from "@/features/catalog/ui"

// Mock: address of the tracker server the A record must point to.
const SERVER_IP = "185.22.40.17"

const STATUS: Record<DomainStatus, { label: string }> = {
  ok: { label: "Работает" },
  awaiting_dns: { label: "Ждёт DNS" },
  requesting_cert: { label: "Выпуск SSL" },
  error: { label: "Ошибка" },
}

// «через 12 мин» / «через 2 ч» / «сейчас»
function nextCheck(iso: string | null | undefined) {
  if (!iso) return "—"
  const m = Math.round((Date.parse(iso) - Date.now()) / 60000)
  if (m <= 0) return "сейчас"
  if (m < 60) return `через ${m} мин`
  if (m < 1440) return `через ${Math.floor(m / 60)} ч`
  return `через ${Math.floor(m / 1440)} дн`
}

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

export default function DomainsPage() {
  const qc = useQueryClient()
  const { canEdit } = useAccess("domains")
  const [q, setQ] = useUrlParam("q")
  const [group, setGroup] = useUrlParam("group")
  const [status, setStatus] = useUrlParam("status")
  const [editId, setEditId] = useUrlParam("edit")
  const [toDelete, setToDelete] = useState<Domain[] | null>(null)

  const list = useQuery({ queryKey: ["domains"], queryFn: api.domains.list })
  const groups = useQuery({ queryKey: ["groups", "domains"], queryFn: () => api.groups.list("domains") })
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })

  const rows = useMemo(
    () =>
      (list.data ?? []).filter(
        (d) =>
          (!q || d.name.toLowerCase().includes(q.toLowerCase()) || String(d.id) === q) &&
          (!group || String(d.group_id) === group) &&
          (!status || d.status === status),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.data, q, group, status, groups.data],
  )

  const save = useMutation({
    mutationFn: async (v: { id?: number; names?: string[]; patch: Partial<Domain> }) => {
      if (v.id) return api.domains.update(v.id, v.patch)
      const t = Date.now()
      for (const name of v.names ?? []) {
        await api.domains.create({
          name, group_id: null, status: "awaiting_dns", is_ssl: false, ssl_redirect: true, allow_indexing: false, catch_not_found: false,
          default_campaign_id: null, campaigns_count: 0, dns_provider: "—", error_description: "", notes: "",
          next_check_at: new Date(t + 5 * 60000).toISOString(), created_at: new Date(t).toISOString(),
          ...v.patch,
        })
      }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["domains"] })
      toast.success(v.id ? "Домен сохранён" : `Добавлено доменов: ${v.names?.length ?? 0}`)
      setEditId("")
    },
  })
  const check = useMutation({
    mutationFn: async (items: Domain[]) => {
      for (const d of items) await api.domains.check(d.id)
      return items.length
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["domains"] })
      toast.success(n === 1 ? "Проверка запущена" : `Проверка запущена: ${n}`)
    },
  })
  const remove = useMutation({
    mutationFn: async (items: Domain[]) => {
      for (const d of items) await api.catalog.removeDomain(d.id)
      return items.length
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["domains"] })
      toast.success(`Удалено доменов: ${n}`)
    },
    onError: (e: Error) => {
      qc.invalidateQueries({ queryKey: ["domains"] })
      toast.error(e.message)
    },
  })

  const columns = useMemo<ColumnDef<Domain, unknown>[]>(
    () => [
      { accessorKey: "id", header: "ID", size: 60, meta: { align: "right" } },
      { accessorKey: "name", header: "Домен", enableHiding: false, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { id: "group", header: "Группа", accessorFn: (d) => groups.data?.find((g) => g.id === d.group_id)?.name ?? "—" },
      {
        id: "status",
        header: "Статус",
        accessorFn: (d) => STATUS[d.status].label,
        cell: ({ row }) => {
          const d = row.original
          return (
            <span className="flex items-center gap-2" title={d.status === "error" ? d.error_description || undefined : undefined}>
              <StateDot state={d.status} />
              <span>{STATUS[d.status].label}</span>
              {canEdit && (d.status === "error" || d.status === "awaiting_dns") && (
                <Button
                  type="button" variant="outline" size="sm" disabled={check.isPending}
                  onClick={(e) => { e.stopPropagation(); check.mutate([d]) }}
                >
                  <Icon icon={RefreshCwIcon} size={12} /> Проверить
                </Button>
              )}
            </span>
          )
        },
      },
      {
        id: "https",
        header: "HTTPS",
        accessorFn: (d) => (d.is_ssl ? (d.ssl_redirect ? 2 : 1) : 0),
        cell: ({ row }) => (row.original.is_ssl ? "Да" : <span className="text-muted-foreground">—</span>),
      },
      { id: "campaigns", header: "Кампаний", meta: { align: "right" }, accessorFn: (d) => d.campaigns_count },
      { id: "dns", header: "DNS-провайдер", accessorFn: (d) => d.dns_provider || "—" },
      { id: "next", header: "Проверка", accessorFn: (d) => Date.parse(d.next_check_at), cell: ({ row }) => <span className="text-muted-foreground">{nextCheck(row.original.next_check_at)}</span> },
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
              {canEdit && <DropdownMenuItem onClick={() => check.mutate([row.original])}>Проверить сейчас</DropdownMenuItem>}
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setToDelete([row.original])}>Удалить домен</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups.data, canEdit, check.isPending, check.mutate, setEditId],
  )

  const editing = editId && editId !== "new" ? list.data?.find((d) => String(d.id) === editId) : undefined
  useMissingRecord(editId, list.data, editing, setEditId)
  const filtered = !!(q || group || status)

  return (
    <Page>
      <PageHeader title="Домены" />
      <Toolbar
        left={
          <>
            {canEdit && (
              <Button onClick={() => setEditId("new")}>
                <Icon icon={PlusIcon} size={14} /> Добавить
              </Button>
            )}
            <GroupsButton type="domains" />
            <SearchInput value={q} onChange={setQ} placeholder="Домен или ID" />
          </>
        }
        right={
          <>
            <FilterSelect value={group} onChange={setGroup} allLabel="Все группы" options={(groups.data ?? []).map((g) => ({ value: String(g.id), label: g.name }))} />
            <FilterSelect
              value={status} onChange={setStatus} allLabel="Все статусы" className="w-40"
              options={(Object.keys(STATUS) as DomainStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))}
            />
          </>
        }
      />
      <DataTable
        data={rows}
        loading={list.isLoading}
        columns={columns}
        getRowId={(d) => String(d.id)}
        onRowClick={(d) => setEditId(String(d.id))}
        storageKey="domains"
        initialSort={[{ id: "id", desc: false }]}
        bulkActions={
          canEdit
            ? (sel, clear) => (
                <>
                  <Button variant="ghost" onClick={() => { check.mutate(sel); clear() }}>
                    <Icon icon={RefreshCwIcon} size={14} /> Проверить сейчас
                  </Button>
                  <Button variant="destructive" onClick={() => setToDelete(sel)}>Удалить домен</Button>
                </>
              )
            : undefined
        }
        empty={filtered ? "Ничего не найдено по фильтрам" : "Доменов пока нет"}
      />

      <DomainSheet
        open={!!editId}
        domain={editing}
        readOnly={!canEdit}
        groups={groups.data ?? []}
        campaigns={campaigns.data ?? []}
        existing={(list.data ?? []).map((d) => d.name)}
        onClose={() => setEditId("")}
        onSave={(v) => save.mutate(v)}
        onCheck={(d) => check.mutate([d])}
        saving={save.isPending}
      />
      <DeleteDomainsDialog
        items={toDelete}
        campaigns={campaigns.data ?? []}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          remove.mutate(toDelete!)
          setToDelete(null)
        }}
      />
    </Page>
  )
}

// Domains have no archive state, so deletion is final. It is blocked while campaigns use the domain.
function DeleteDomainsDialog({
  items, campaigns, onCancel, onConfirm,
}: { items: Domain[] | null; campaigns: { id: number; name: string; domain_id: number | null }[]; onCancel: () => void; onConfirm: () => void }) {
  const list = items ?? []
  const used = list
    .map((d) => ({ d, camps: campaigns.filter((c) => c.domain_id === d.id) }))
    .filter((x) => x.camps.length > 0 || x.d.campaigns_count > 0)
  const blocked = used.length > 0
  return (
    <AlertDialog open={!!items} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{list.length === 1 ? `Удалить домен ${list[0].name}` : `Удалить домены: ${list.length}`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              {blocked ? (
                <>
                  <p>Удалить нельзя: {used.length === 1 ? "домен используется" : "домены используются"} в кампаниях. Смените домен в этих кампаниях и повторите.</p>
                  <ul className="max-h-48 overflow-auto rounded-md border">
                    {used.map(({ d, camps }) => (
                      <li key={d.id} className="border-b px-2 py-1.5 last:border-b-0">
                        <span className="font-mono text-foreground">{d.name}</span>
                        {camps.length === 0 && <span> · кампаний: {d.campaigns_count}</span>}
                        {camps.map((c) => (
                          <a key={c.id} href={`#/campaigns/${c.id}`} className="block truncate pl-3">{c.name}</a>
                        ))}
                      </li>
                    ))}
                  </ul>
                  {list.length > used.length && <p>Чтобы удалить остальные, снимите занятые домены с выбора.</p>}
                </>
              ) : (
                <p>
                  Домен удаляется без восстановления: в архив он не попадает. Если он ещё указан в ссылках, трекер перестанет отвечать на них.
                  Чтобы вернуть домен, добавьте его заново и настройте DNS.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{blocked ? "Закрыть" : "Отмена"}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={blocked} onClick={onConfirm}>Удалить домен</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const DEFAULTS = { group_id: null as number | null, ssl_redirect: true, allow_indexing: false, catch_not_found: false, default_campaign_id: null as number | null, notes: "" }

function DomainSheet({
  open, domain, groups, campaigns, existing, readOnly, onClose, onSave, onCheck, saving,
}: {
  open: boolean; domain?: Domain; groups: { id: number; name: string }[]; campaigns: { id: number; name: string }[]; existing: string[]
  readOnly: boolean; onClose: () => void
  onSave: (v: { id?: number; names?: string[]; patch: Partial<Domain> }) => void; onCheck: (d: Domain) => void; saving: boolean
}) {
  const [names, setNames] = useState("")
  const [form, setForm] = useState(DEFAULTS)
  const [err, setErr] = useState<Record<string, string>>({})
  const key = domain?.id ?? "new"
  const [loadedKey, setLoadedKey] = useState<string | number | null>(null)
  if (open && loadedKey !== key) {
    setLoadedKey(key)
    setErr({})
    setNames("")
    setForm(
      domain
        ? { group_id: domain.group_id, ssl_redirect: domain.ssl_redirect, allow_indexing: domain.allow_indexing, catch_not_found: domain.catch_not_found, default_campaign_id: domain.default_campaign_id, notes: domain.notes }
        : DEFAULTS,
    )
  }
  if (!open && loadedKey !== null) setLoadedKey(null)
  const set = <K extends keyof typeof DEFAULTS>(k: K, v: (typeof DEFAULTS)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (domain) return onSave({ id: domain.id, patch: form })
    const list = [...new Set(names.toLowerCase().split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))]
    const e: Record<string, string> = {}
    const bad = list.filter((n) => !DOMAIN_RE.test(n))
    const dup = list.filter((n) => existing.includes(n))
    if (!list.length) e.names = "Введите хотя бы один домен"
    else if (bad.length) e.names = `Неверный формат: ${bad.slice(0, 3).join(", ")}. Пример: go.example.com`
    else if (dup.length) e.names = `Уже добавлено: ${dup.slice(0, 3).join(", ")}`
    setErr(e)
    if (Object.keys(e).length) return
    onSave({ names: list, patch: form })
  }

  return (
    <EntitySheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={domain ? domain.name : "Добавить домены"}
      description={readOnly ? "Только просмотр: у вашей роли нет прав на изменение" : undefined}
      onSubmit={readOnly ? undefined : submit}
      submitLabel={domain ? "Сохранить" : "Добавить"}
      submitting={saving}
    >
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col">
        {domain && (
          <FormSection title="Статус">
            <div className="flex flex-col gap-2 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 font-medium"><StateDot state={domain.status} />{STATUS[domain.status].label}</span>
                <span className="text-muted-foreground">· HTTPS: {domain.is_ssl ? "да" : "—"} · DNS: {domain.dns_provider || "—"} · следующая проверка: {nextCheck(domain.next_check_at)}</span>
                {!readOnly && (
                  <Button type="button" variant="outline" className="ml-auto" onClick={() => onCheck(domain)}>
                    <Icon icon={RefreshCwIcon} size={14} /> Проверить сейчас
                  </Button>
                )}
              </div>
              {domain.status === "error" && domain.error_description && (
                <p className="text-destructive">{domain.error_description}. Проверьте, что A-запись указывает на {SERVER_IP}, и запустите проверку.</p>
              )}
              <p className="text-muted-foreground">Кампаний на домене: <span className="num text-foreground">{domain.campaigns_count}</span></p>
            </div>
          </FormSection>
        )}

        <FormSection title="Основное">
          {domain ? (
            <FormRow label="Домен">
              <Input readOnly value={domain.name} className="font-mono" />
            </FormRow>
          ) : (
            <FormRow label="Домены" error={err.names} hint="По одному в строке или через запятую, без https://" htmlFor="d-names">
              <Textarea id="d-names" rows={4} className="font-mono" value={names} onChange={(e) => setNames(e.target.value)} placeholder={"go.example.com\nb.example.net"} aria-invalid={!!err.names} />
            </FormRow>
          )}
          <FormRow label="Группа">
            <RefSelect value={form.group_id} onChange={(v) => set("group_id", v)} noneLabel="Без группы" options={groups} />
          </FormRow>
          <FormRow label="Кампания по умолчанию" hint="Открывается на главной странице домена (без пути кампании)">
            <RefSelect
              value={form.default_campaign_id}
              onChange={(v) => setForm((f) => ({ ...f, default_campaign_id: v, catch_not_found: v ? f.catch_not_found : false }))}
              noneLabel="Не выбрана"
              options={campaigns}
            />
          </FormRow>
        </FormSection>

        <FormSection title="Настройки">
          <FormRow label="Только HTTPS" hint="Запросы по http перенаправляются на https">
            <Switch checked={form.ssl_redirect} onCheckedChange={(v) => set("ssl_redirect", v)} />
          </FormRow>
          <FormRow label="Разрешить индексацию" hint="Выключено: в robots.txt запрещён обход поисковиками">
            <Switch checked={form.allow_indexing} onCheckedChange={(v) => set("allow_indexing", v)} />
          </FormRow>
          <FormRow label="Перехватывать 404" hint={form.default_campaign_id ? "Неизвестные адреса открывают кампанию по умолчанию" : "Доступно после выбора кампании по умолчанию"}>
            <Switch checked={form.catch_not_found} disabled={!form.default_campaign_id} onCheckedChange={(v) => set("catch_not_found", v)} />
          </FormRow>
          <FormRow label="Заметки">
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </FormRow>
        </FormSection>

        <FormSection title="Как подключить домен">
          <div className="flex flex-col gap-2 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">IP сервера для A-записи</span>
              <code className="num rounded-md border bg-muted px-2 py-1 font-mono text-foreground">{SERVER_IP}</code>
              <CopyButton value={SERVER_IP} />
            </div>
            <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>В DNS домена создайте A-запись на этот IP (имя «@» или поддомен). Если домен на Cloudflare, выключите проксирование.</li>
              <li>Подождите, пока обновится DNS: обычно 5–30 минут. Трекер проверяет сам, ускорить можно кнопкой «Проверить сейчас».</li>
              <li>Трекер выпустит SSL-сертификат, и статус сменится на «Работает».</li>
            </ol>
          </div>
        </FormSection>
      </fieldset>
    </EntitySheet>
  )
}
