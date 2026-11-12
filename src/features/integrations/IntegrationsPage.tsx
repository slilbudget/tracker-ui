// «Интеграции»: connected integrations (Facebook conversions, TikTok, Cloudflare) + sheet with fields per type.
// Facebook spend comes from the team's own collector through the cost API (api.campaigns.updateCosts), not from here.
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { ChevronDownIcon, EllipsisIcon, PlusIcon } from "lucide-react"
import type { ConversionStatus, Integration } from "@/api/types"
import { CONVERSION_STATUSES } from "@/api/meta"
import { api } from "@/api/client"
import { EMPTY_EXTRA, type IntegrationFull } from "@/api/client-system"
import { useAccess, useUrlParam } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { ConfirmDialog, EntitySheet, FormRow, StateDot } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { timeAgo } from "@/lib/dates"
import { MultiSelect } from "@/features/users/MultiSelect"

type Kind = Integration["kind"]
const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "facebook_conversions", label: "Конверсии Facebook (CAPI)", hint: "Отправляет Purchase и Lead в пиксель" },
  { value: "tiktok", label: "TikTok", hint: "Расходы и конверсии по ttclid" },
  { value: "cloudflare", label: "Cloudflare", hint: "DNS и прокси доменов" },
]
const kindLabel = (k: Kind) => KINDS.find((x) => x.value === k)?.label ?? k
const STATE_TEXT: Record<Integration["state"], string> = { active: "Работает", paused: "На паузе", error: "Ошибка" }
const EVERY = [15, 30, 60, 120, 360]
const FIXED_PIXEL_HINT = "по sub_id_5"

export default function IntegrationsPage() {
  const qc = useQueryClient()
  const { canEdit } = useAccess("integrations")
  const [editId, setEditId] = useUrlParam("edit")
  const [kindParam, setKindParam] = useUrlParam("kind")
  const [toDelete, setToDelete] = useState<Integration | null>(null)

  const list = useQuery({ queryKey: ["integrations"], queryFn: api.integrations.list })
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  const full = useQuery({
    queryKey: ["integrations", Number(editId)],
    queryFn: () => api.integrations.get(Number(editId)),
    enabled: !!editId && editId !== "new",
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["integrations"] })
  const save = useMutation({
    mutationFn: (v: Parameters<typeof api.integrations.save>[0]) => api.integrations.save(v),
    onSuccess: (_, v) => { invalidate(); toast.success(v.id ? "Интеграция сохранена" : "Интеграция добавлена"); setEditId(""); setKindParam("") },
  })
  const setState = useMutation({
    mutationFn: ({ id, state }: { id: number; state: "active" | "paused" }) => api.integrations.setState(id, state),
    onSuccess: (_, v) => { invalidate(); toast.success(v.state === "paused" ? "Интеграция на паузе" : "Интеграция возобновлена") },
  })
  const sync = useMutation({
    mutationFn: (id: number) => api.integrations.sync(id),
    onSuccess: () => { invalidate(); toast.success("Синхронизация выполнена") },
    onError: (e: Error) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.integrations.remove(id),
    onSuccess: () => { invalidate(); toast.success("Интеграция удалена") },
  })

  const columns = useMemo<ColumnDef<Integration, unknown>[]>(
    () => [
      { accessorKey: "id", header: "ID", size: 60, meta: { align: "right" } },
      {
        accessorKey: "name", header: "Название", enableHiding: false,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { id: "kind", header: "Тип", accessorFn: (i) => kindLabel(i.kind) },
      {
        id: "state", header: "Статус", accessorFn: (i) => STATE_TEXT[i.state],
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <StateDot state={row.original.state} />
            {STATE_TEXT[row.original.state]}
          </span>
        ),
      },
      {
        id: "scope", header: "Охват",
        accessorFn: (i) => (i.kind === "cloudflare" ? "—" : `кампаний: ${i.campaign_ids.length}`),
      },
      { id: "last_sync", header: "Синхронизация", accessorFn: (i) => i.last_sync_at ?? "", cell: ({ row }) => <span className="text-muted-foreground">{timeAgo(row.original.last_sync_at)}</span> },
      {
        id: "error", header: "Ошибка", accessorFn: (i) => i.last_error,
        cell: ({ row }) =>
          row.original.last_error
            ? <span className="block max-w-96 truncate text-destructive" title={row.original.last_error}>{row.original.last_error}</span>
            : <span className="text-muted-foreground">—</span>,
      },
      {
        id: "_menu", enableHiding: false, enableSorting: false, size: 36,
        cell: ({ row }) => {
          const i = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon-sm" aria-label="Действия"><Icon icon={EllipsisIcon} size={14} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => setEditId(String(i.id))}>{canEdit ? "Изменить" : "Открыть"}</DropdownMenuItem>
                {canEdit && (
                  <>
                    <DropdownMenuItem onClick={() => sync.mutate(i.id)}>Синхронизировать сейчас</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setState.mutate({ id: i.id, state: i.state === "paused" ? "active" : "paused" })}>
                      {i.state === "paused" ? "Возобновить" : "Поставить на паузу"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setToDelete(i)}>Удалить</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, setEditId],
  )

  const sheetKind: Kind | undefined = editId === "new" ? (KINDS.find((k) => k.value === kindParam)?.value) : full.data?.kind
  const showSheet = !!editId && (editId === "new" ? !!sheetKind : !!full.data)

  return (
    <Page>
      <PageHeader title="Интеграции" />
      <Toolbar
        left={
          canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button><Icon icon={PlusIcon} size={14} /> Создать <Icon icon={ChevronDownIcon} size={12} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                {KINDS.map((k) => (
                  <DropdownMenuItem key={k.value} className="flex-col items-start gap-0" onClick={() => { setKindParam(k.value); setEditId("new") }}>
                    <span>{k.label}</span>
                    <span className="text-xs text-muted-foreground">{k.hint}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />
      <DataTable
        data={list.data ? [...list.data] : undefined}
        loading={list.isLoading}
        columns={columns}
        getRowId={(i) => String(i.id)}
        onRowClick={(i) => setEditId(String(i.id))}
        storageKey="integrations"
        empty="Интеграций пока нет"
      />
      {showSheet && (
        <IntegrationSheet
          key={`${editId}-${sheetKind}`}
          kind={sheetKind!}
          value={editId === "new" ? undefined : full.data}
          campaigns={(campaigns.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          readOnly={!canEdit}
          saving={save.isPending}
          onClose={() => { setEditId(""); setKindParam("") }}
          onSave={(v) => save.mutate(v)}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Удалить интеграцию «${toDelete?.name ?? ""}»`}
        description="Расходы и конверсии перестанут обновляться, уже загруженные данные останутся. Токен будет удалён."
        confirmLabel="Удалить"
        destructive
        onConfirm={() => { remove.mutate(toDelete!.id); setToDelete(null) }}
      />
    </Page>
  )
}

// ---------- sheet ----------

function IntegrationSheet({
  kind, value, campaigns, readOnly, saving, onClose, onSave,
}: {
  kind: Kind; value?: IntegrationFull; campaigns: { value: number; label: string }[]; readOnly: boolean; saving: boolean
  onClose: () => void; onSave: (v: IntegrationFull) => void
}) {
  const [form, setForm] = useState<IntegrationFull>(
    () => value ?? ({
      id: 0, kind, name: "", state: "active", campaign_ids: [], ad_account_id: "", pixel_id: "", update_every_min: kind === "facebook_conversions" ? 0 : 30,
      last_sync_at: null, last_error: "", ...EMPTY_EXTRA,
    } as IntegrationFull),
  )
  const [pixelSource, setPixelSource] = useState<"fixed" | "sub_id_5">(value?.pixel_id === FIXED_PIXEL_HINT ? "sub_id_5" : value && value.pixel_id ? "fixed" : "sub_id_5")
  const [err, setErr] = useState<Record<string, string>>({})
  const set = <K extends keyof IntegrationFull>(k: K, v: IntegrationFull[K]) => setForm((f) => ({ ...f, [k]: v }))
  const label = kindLabel(kind)
  const usesCampaigns = kind === "facebook_conversions" || kind === "tiktok"
  const hasProxy = kind === "facebook_conversions"

  const submit = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = "Введите название"
    if (!form.token.trim()) e.token = kind === "cloudflare" ? "Вставьте API-токен Cloudflare" : "Вставьте токен доступа"
    if (kind === "tiktok" && !form.ad_account_id.trim()) e.ad_account_id = "Укажите Advertiser ID"
    if (kind === "facebook_conversions" && pixelSource === "fixed" && !form.pixel_id.trim()) e.pixel_id = "Укажите ID пикселя"
    if (kind === "facebook_conversions" && form.send_statuses.length === 0) e.statuses = "Выберите хотя бы один статус"
    if (kind === "cloudflare" && !form.account.trim()) e.account = "Укажите аккаунт Cloudflare"
    if (form.proxy_enabled && hasProxy && (!form.proxy_address.trim() || !form.proxy_port.trim())) e.proxy = "Укажите адрес и порт прокси"
    setErr(e)
    if (Object.keys(e).length) return
    const { id, ...rest } = form
    onSave({
      ...rest, id: id || undefined, name: form.name.trim(),
      pixel_id: kind === "facebook_conversions" ? (pixelSource === "sub_id_5" ? FIXED_PIXEL_HINT : form.pixel_id.trim()) : "",
      campaign_ids: usesCampaigns ? form.campaign_ids : [],
    } as IntegrationFull)
  }

  const toggleStatus = (s: ConversionStatus, on: boolean) =>
    set("send_statuses", on ? [...form.send_statuses, s] : form.send_statuses.filter((x) => x !== s))

  return (
    <EntitySheet
      open
      onOpenChange={(v) => !v && onClose()}
      title={value ? `${label}: ${value.name}` : `Новая интеграция: ${label}`}
      description={readOnly ? "Только просмотр: у вашей роли нет прав на изменение" : value?.last_error ? `Ошибка: ${value.last_error}` : undefined}
      onSubmit={readOnly ? undefined : submit}
      submitLabel={value ? "Сохранить" : "Создать"}
      submitting={saving}
    >
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col">
        <FormRow label="Название" error={err.name} htmlFor="i-name">
          <Input id="i-name" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err.name} />
        </FormRow>
        {usesCampaigns && (
          <FormRow label="Кампании" hint={kind === "facebook_conversions" ? "Конверсии этих кампаний уйдут в пиксель" : "Расход попадёт в клики этих кампаний"}>
            <MultiSelect options={campaigns} value={form.campaign_ids} onChange={(v) => set("campaign_ids", v)} placeholder="Выберите кампании" disabled={readOnly} />
          </FormRow>
        )}

        {kind === "tiktok" && (
          <FormRow label="Advertiser ID" error={err.ad_account_id} htmlFor="i-adv">
            <Input id="i-adv" className="font-mono" value={form.ad_account_id} onChange={(e) => set("ad_account_id", e.target.value)} aria-invalid={!!err.ad_account_id} />
          </FormRow>
        )}

        {kind === "facebook_conversions" && (
          <>
            <FormRow label="Откуда брать пиксель">
              <Select value={pixelSource} onValueChange={(v) => setPixelSource(v as "fixed" | "sub_id_5")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sub_id_5">Из клика (sub_id_5)</SelectItem>
                  <SelectItem value="fixed">Фиксированный ID</SelectItem>
                </SelectContent>
              </Select>
            </FormRow>
            {pixelSource === "fixed" && (
              <FormRow label="ID пикселя" error={err.pixel_id} htmlFor="i-pixel">
                <Input id="i-pixel" className="font-mono" value={form.pixel_id === FIXED_PIXEL_HINT ? "" : form.pixel_id} onChange={(e) => set("pixel_id", e.target.value)} aria-invalid={!!err.pixel_id} />
              </FormRow>
            )}
          </>
        )}

        <FormRow
          label={kind === "cloudflare" ? "API-токен" : kind === "facebook_conversions" ? "Токен конверсий" : "Токен доступа"}
          error={err.token}
          htmlFor="i-token"
        >
          <Input id="i-token" type="password" autoComplete="off" value={form.token} onChange={(e) => set("token", e.target.value)} aria-invalid={!!err.token} />
        </FormRow>

        {kind === "cloudflare" && (
          <FormRow label="Аккаунт" error={err.account} htmlFor="i-acc" hint="Email или ID аккаунта Cloudflare">
            <Input id="i-acc" value={form.account} onChange={(e) => set("account", e.target.value)} aria-invalid={!!err.account} />
          </FormRow>
        )}

        {kind === "facebook_conversions" && (
          <FormRow label="Какие статусы отправлять" error={err.statuses}>
            <div className="flex flex-col gap-1.5">
              {CONVERSION_STATUSES.map((s) => (
                <label key={s.value} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.send_statuses.includes(s.value)} onCheckedChange={(v) => toggleStatus(s.value, !!v)} />
                  {s.label}
                </label>
              ))}
            </div>
          </FormRow>
        )}

        {kind !== "facebook_conversions" && (
          <FormRow label="Обновлять каждые">
            <Select value={String(form.update_every_min || 30)} onValueChange={(v) => set("update_every_min", Number(v))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVERY.map((n) => <SelectItem key={n} value={String(n)}>{n < 60 ? `${n} минут` : `${n / 60} ч`}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormRow>
        )}

        {hasProxy && (
          <>
            <FormRow label="Использовать прокси" error={err.proxy}>
              <Switch checked={form.proxy_enabled} onCheckedChange={(v) => set("proxy_enabled", v)} />
            </FormRow>
            {form.proxy_enabled && (
              <>
                <FormRow label="Протокол">
                  <Select value={form.proxy_protocol} onValueChange={(v) => set("proxy_protocol", v as IntegrationFull["proxy_protocol"])}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["http", "https", "socks5"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormRow>
                <FormRow label="Адрес и порт">
                  <div className="flex gap-2">
                    <Input className="min-w-0 flex-1" placeholder="proxy.example.com" value={form.proxy_address} onChange={(e) => set("proxy_address", e.target.value)} />
                    <Input className="w-24" inputMode="numeric" placeholder="8080" value={form.proxy_port} onChange={(e) => set("proxy_port", e.target.value.replace(/\D/g, ""))} />
                  </div>
                </FormRow>
                <FormRow label="Логин и пароль">
                  <div className="flex gap-2">
                    <Input className="min-w-0 flex-1" autoComplete="off" value={form.proxy_login} onChange={(e) => set("proxy_login", e.target.value)} />
                    <Input className="min-w-0 flex-1" type="password" autoComplete="off" value={form.proxy_password} onChange={(e) => set("proxy_password", e.target.value)} />
                  </div>
                </FormRow>
              </>
            )}
          </>
        )}
      </fieldset>
    </EntitySheet>
  )
}

