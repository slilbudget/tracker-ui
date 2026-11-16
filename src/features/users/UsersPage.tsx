// «Пользователи и роли»: users, roles (access matrix), API keys. ApiKeysTable is reused by the profile page.
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { EllipsisIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import type { AccessGrant, AccessLevel, ApiKey, Resource, Role, User } from "@/api/types"
import { ACCESS_LEVELS, METRICS, RESOURCES, TIMEZONES } from "@/api/meta"
import { api } from "@/api/client"

import { useAccess, useUrlParam, useMissingRecord } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { ConfirmDialog, CopyButton, EntitySheet, FormRow, SearchInput, StateDot } from "@/components/common"
import { Icon } from "@/components/icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDate, timeAgo } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { MultiSelect } from "./MultiSelect"

const MONEY_METRICS = ["revenue", "sale_revenue", "profit", "profit_confirmed", "roi", "roi_confirmed", "epc_confirmed", "avg_sale", "cost"]
const LEVEL_SHORT: Record<AccessLevel, string> = { none: "Нет", read: "Просмотр", own: "Свои", groups: "Группы", full: "Полный" }
const NO_TEAM = "__none__"
const NEW_TEAM = "__new__"
const LANGS = [{ value: "ru", label: "Русский" }, { value: "en", label: "English" }]

export default function UsersPage() {
  const { canEdit, isFull } = useAccess("users")
  const [tabParam, setTab] = useUrlParam("tab", "users")
  // everyone's API keys: administrators only (own keys are in the profile)
  const tab = tabParam === "keys" && !isFull ? "users" : tabParam
  return (
    <Page>
      <PageHeader title="Пользователи и роли" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="users">Пользователи</TabsTrigger>
          <TabsTrigger value="roles">Роли</TabsTrigger>
          {isFull && <TabsTrigger value="keys">API-ключи</TabsTrigger>}
        </TabsList>
      </Tabs>
      {tab === "users" && <UsersTab canEdit={canEdit} />}
      {tab === "roles" && <RolesTab canEdit={canEdit} />}
      {tab === "keys" && <ApiKeysTable canManage={canEdit} />}
    </Page>
  )
}

// =====================================================================================
// Users
// =====================================================================================

function UsersTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient()
  const [q, setQ] = useUrlParam("q")
  const [roleF, setRoleF] = useUrlParam("role")
  const [teamF, setTeamF] = useUrlParam("team")
  const [stateF, setStateF] = useUrlParam("state")
  const [editId, setEditId] = useUrlParam("edit")
  const [toDelete, setToDelete] = useState<User | null>(null)

  const users = useQuery({ queryKey: ["users"], queryFn: api.users.list })
  const roles = useQuery({ queryKey: ["roles"], queryFn: api.roles.list })
  const groups = useQuery({ queryKey: ["groups", "campaigns"], queryFn: () => api.groups.list("campaigns") })
  const me = useQuery({ queryKey: ["me"], queryFn: api.me })

  const teams = useMemo(() => Array.from(new Set((users.data ?? []).map((u) => u.team).filter((t) => t && t !== "—"))).sort(), [users.data])
  const roleName = (id: number) => roles.data?.find((r) => r.id === id)?.name ?? "—"

  const rows = useMemo(
    () =>
      (users.data ?? []).filter(
        (u) =>
          (!q || u.login.toLowerCase().includes(q.toLowerCase()) || u.name.toLowerCase().includes(q.toLowerCase())) &&
          (!roleF || String(u.role_id) === roleF) &&
          (!teamF || u.team === teamF) &&
          (!stateF || u.state === stateF),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users.data, roles.data, q, roleF, teamF, stateF],
  )

  const save = useMutation({
    mutationFn: (v: Partial<User> & { id?: number }) =>
      v.id
        ? api.users.update(v.id, v)
        : api.users.create({
            login: v.login!, name: v.name!, role_id: v.role_id!, team: v.team ?? "", state: v.state ?? "active",
            timezone: v.timezone ?? "Europe/London", language: v.language ?? "ru", group_ids: v.group_ids ?? [], grants: v.grants ?? [],
            last_login_at: null, created_at: new Date().toISOString(), two_factor: false, account_transfer: v.account_transfer ?? "none",
          }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success(v.id ? "Пользователь сохранён" : "Пользователь создан")
      setEditId("")
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.users.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success("Пользователь удалён")
    },
  })

  const columns = useMemo<ColumnDef<User, unknown>[]>(
    () => [
      {
        accessorKey: "login",
        header: "Логин",
        enableHiding: false,
        cell: ({ row }) => (
          <span className="flex items-center gap-2" title={row.original.state === "active" ? "Активен" : "Отключён"}>
            <StateDot state={row.original.state} />
            <span className={cn("font-medium", row.original.state !== "active" && "text-muted-foreground")}>{row.original.login}</span>
          </span>
        ),
      },
      { accessorKey: "name", header: "Имя", meta: { grow: true } },
      {
        id: "role", header: "Роль", accessorFn: (u) => roleName(u.role_id),
        cell: ({ row }) => <>{roleName(row.original.role_id)}{row.original.grants.length > 0 && <span className="text-muted-foreground" title="Отдельные доступы к кампаниям и группам"> + доступов: {row.original.grants.length}</span>}</>,
      },
      { id: "team", header: "Команда", accessorFn: (u) => u.team || "—" },
      { id: "state", header: "Состояние", accessorFn: (u) => (u.state === "active" ? "Активен" : "Отключён"), cell: ({ row }) => <span className={cn(row.original.state !== "active" && "text-muted-foreground")}>{row.original.state === "active" ? "Активен" : "Отключён"}</span> },
      { id: "two_factor", header: "2FA", accessorFn: (u) => (u.two_factor ? 1 : 0), cell: ({ row }) => (row.original.two_factor ? "Да" : <span className="text-warning">Нет</span>) },
      { id: "last_login", header: "Последний вход", accessorFn: (u) => u.last_login_at ?? "", cell: ({ row }) => <span className="text-muted-foreground">{timeAgo(row.original.last_login_at)}</span> },
      { id: "created", header: "Создан", accessorFn: (u) => u.created_at, cell: ({ row }) => <span className="num">{formatDate(row.original.created_at)}</span> },
      {
        id: "_menu", enableHiding: false, enableSorting: false, size: 36,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon-sm" aria-label="Действия"><Icon icon={EllipsisIcon} size={14} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => setEditId(String(row.original.id))}>{canEdit ? "Изменить" : "Открыть"}</DropdownMenuItem>
              {canEdit && row.original.id !== me.data?.id && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setToDelete(row.original)}>Удалить</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles.data, canEdit, me.data, setEditId],
  )

  const editing = editId && editId !== "new" ? users.data?.find((u) => String(u.id) === editId) : undefined
  useMissingRecord(editId, users.data, editing, setEditId)
  const filtered = q || roleF || teamF || stateF

  return (
    <>
      <Toolbar
        left={
          <>
            {canEdit && <Button onClick={() => setEditId("new")}><Icon icon={PlusIcon} size={14} /> Создать</Button>}
            <SearchInput value={q} onChange={setQ} placeholder="Логин или имя" />
          </>
        }
        right={
          <>
            <Select value={roleF || "all"} onValueChange={(v) => setRoleF(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все роли</SelectItem>
                {roles.data?.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={teamF || "all"} onValueChange={(v) => setTeamF(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все команды</SelectItem>
                {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stateF || "all"} onValueChange={(v) => setStateF(v === "all" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все состояния</SelectItem>
                <SelectItem value="active">Активные</SelectItem>
                <SelectItem value="disabled">Отключённые</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />
      <DataTable
        data={rows}
        loading={users.isLoading}
        columns={columns}
        getRowId={(u) => String(u.id)}
        onRowClick={(u) => setEditId(String(u.id))}
        storageKey="users"
        initialHidden={["state"]}
        initialSort={[{ id: "login", desc: false }]}
        empty={filtered ? "Ничего не найдено по фильтрам" : "Пользователей пока нет"}
      />
      <UserSheet
        open={!!editId}
        user={editing}
        roles={roles.data ?? []}
        teams={teams}
        groups={groups.data ?? []}
        takenLogins={(users.data ?? []).map((u) => u.login.toLowerCase())}
        readOnly={!canEdit}
        isSelf={!!editing && editing.id === me.data?.id}
        onClose={() => setEditId("")}
        onSave={(v) => save.mutate(v)}
        saving={save.isPending}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Удалить пользователя ${toDelete?.login ?? ""}`}
        description="Он потеряет доступ сразу, его API-ключи перестанут работать. Кампании и статистика останутся. Чтобы сохранить пользователя и закрыть вход, отключите его в карточке."
        confirmLabel="Удалить"
        destructive
        onConfirm={() => { remove.mutate(toDelete!.id); setToDelete(null) }}
      />
    </>
  )
}

function UserSheet({
  open, user, roles, teams, groups, takenLogins, readOnly, isSelf, onClose, onSave, saving,
}: {
  open: boolean; user?: User; roles: Role[]; teams: string[]; groups: { id: number; name: string }[]; takenLogins: string[]; readOnly: boolean; isSelf: boolean
  onClose: () => void; onSave: (v: Partial<User> & { password?: string }) => void; saving: boolean
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Partial<User> & { password?: string }>({})
  const [err, setErr] = useState<Record<string, string>>({})
  const [tempPass, setTempPass] = useState("")
  const [newTeam, setNewTeam] = useState(false)
  const key = user?.id ?? "new"
  const [loadedKey, setLoadedKey] = useState<string | number | null>(null)
  if (open && loadedKey !== key) {
    setLoadedKey(key)
    setErr({})
    setTempPass("")
    setNewTeam(false)
    setForm(user ?? { login: "", name: "", password: "", role_id: (roles.find((r) => r.name === "Байер") ?? roles.filter((r) => !r.system).at(-1) ?? roles[0])?.id, team: "", state: "active", timezone: "Europe/London", language: "ru", group_ids: [], grants: [], account_transfer: "none" })
  }
  if (!open && loadedKey !== null) setLoadedKey(null)
  const set = <K extends keyof User>(k: K, v: User[K]) => setForm((f) => ({ ...f, [k]: v }))

  const teamOptions = form.team && !teams.includes(form.team) && !newTeam ? [...teams, form.team] : teams
  const role = roles.find((r) => r.id === form.role_id)
  const usesGroups = !!role && Object.values(role.access).includes("groups")

  const reset = useMutation({ mutationFn: (id: number) => api.system.users.resetPassword(id), onSuccess: (r) => setTempPass(r.password) })
  const reset2fa = useMutation({
    mutationFn: (id: number) => api.system.users.reset2fa(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setForm((f) => ({ ...f, two_factor: false })); toast.success("2FA сброшена, при входе пользователь настроит её заново") },
  })

  const submit = () => {
    const e: Record<string, string> = {}
    if (!user && !form.login?.trim()) e.login = "Введите логин"
    if (!user && form.login && !/^[a-z0-9_.-]{3,}$/i.test(form.login.trim())) e.login = "Латиница, цифры и символы _ . -, минимум 3 символа"
    if (!user && !e.login && takenLogins.includes((form.login ?? "").trim().toLowerCase())) e.login = "Такой логин уже есть"
    if (!form.name?.trim()) e.name = "Введите имя"
    if (!user && (form.password ?? "").length < 8) e.password = "Минимум 8 символов"
    if (!form.role_id) e.role_id = "Выберите роль"
    setErr(e)
    if (Object.keys(e).length) return
    onSave({ ...form, team: form.team?.trim() ?? "", login: form.login?.trim(), name: form.name?.trim(), group_ids: usesGroups ? form.group_ids ?? [] : [], id: user?.id })
  }

  return (
    <EntitySheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={user ? `Пользователь ${user.login}` : "Новый пользователь"}
      description={readOnly ? "Только просмотр: у вашей роли нет прав на изменение" : undefined}
      onSubmit={readOnly ? undefined : submit}
      submitLabel={user ? "Сохранить" : "Создать"}
      submitting={saving}
    >
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col">
        <FormRow label="Логин" error={err.login} htmlFor="u-login">
          <Input id="u-login" value={form.login ?? ""} disabled={!!user} onChange={(e) => set("login", e.target.value)} aria-invalid={!!err.login} />
        </FormRow>
        <FormRow label="Имя" error={err.name} htmlFor="u-name">
          <Input id="u-name" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} aria-invalid={!!err.name} />
        </FormRow>
        {user ? (
          <FormRow label="Пароль" hint="Временный пароль показывается один раз, пользователь сменит его в профиле.">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => reset.mutate(user.id)} disabled={reset.isPending}>Сбросить пароль</Button>
              {tempPass && (
                <>
                  <code className="rounded-md border bg-muted px-2 py-1 font-mono text-xs">{tempPass}</code>
                  <CopyButton value={tempPass} />
                </>
              )}
            </div>
          </FormRow>
        ) : (
          <FormRow label="Пароль" error={err.password} htmlFor="u-pass">
            <Input id="u-pass" type="password" autoComplete="new-password" value={form.password ?? ""} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} aria-invalid={!!err.password} />
          </FormRow>
        )}
        <FormRow label="Роль" error={err.role_id} hint={isSelf ? "Свою роль меняет другой администратор" : role?.description}>
          <Select value={form.role_id ? String(form.role_id) : ""} disabled={isSelf} onValueChange={(v) => set("role_id", Number(v))}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Выберите роль" /></SelectTrigger>
            <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        </FormRow>
        <FormRow label="Команда" hint="Команда выбирается из существующих, чтобы опечатка не создала новую.">
          <Select
            value={newTeam ? NEW_TEAM : form.team || NO_TEAM}
            onValueChange={(v) => {
              setNewTeam(v === NEW_TEAM)
              set("team", v === NEW_TEAM || v === NO_TEAM ? "" : v)
            }}
          >
            <SelectTrigger className="w-full" aria-label="Команда"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TEAM}>Без команды</SelectItem>
              {teamOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              <SelectItem value={NEW_TEAM}>Новая команда…</SelectItem>
            </SelectContent>
          </Select>
          {newTeam && (
            <Input aria-label="Название новой команды" placeholder="Название новой команды" autoFocus value={form.team ?? ""} onChange={(e) => set("team", e.target.value)} />
          )}
        </FormRow>
        <FormRow label="Часовой пояс">
          <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </FormRow>
        <FormRow label="Язык">
          <Select value={form.language} onValueChange={(v) => set("language", v as User["language"])}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{LANGS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
          </Select>
        </FormRow>
        {usesGroups && (
          <FormRow label="Группы кампаний" hint="Роль даёт доступ к выбранным группам. Без групп пользователь ничего не увидит.">
            <MultiSelect
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
              value={form.group_ids ?? []}
              onChange={(v) => set("group_ids", v)}
              placeholder="Выберите группы"
              disabled={readOnly}
            />
          </FormRow>
        )}
        <FormRow label="Отдельные доступы" hint="Сверх роли: конкретная кампания или группа кампаний. Например, байеру — одна чужая кампания только на просмотр">
          <GrantsEditor value={form.grants ?? []} onChange={(v) => set("grants", v)} groups={groups} disabled={readOnly} />
        </FormRow>
        <FormRow label="Передача кабинетов" hint="Отдельное право, не зависит от роли. Тимлиду обычно — «Внутри своей команды»">
          <Select value={form.account_transfer ?? "none"} onValueChange={(v) => set("account_transfer", v as User["account_transfer"])}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Нет</SelectItem>
              <SelectItem value="team">Внутри своей команды — между её байерами</SelectItem>
              <SelectItem value="all">Все кабинеты — закреплять свободные, передавать, освобождать</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
        {user && (
          <FormRow label="2FA">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {form.two_factor ? "Включена" : <span className="text-warning">Не включена</span>}
              {form.two_factor && !readOnly && (
                <Button type="button" variant="outline" onClick={() => reset2fa.mutate(user.id)}>Сбросить 2FA</Button>
              )}
            </div>
          </FormRow>
        )}
        <FormRow label="Включён" hint={isSelf ? "Себя выключить нельзя" : "Отключённый пользователь не может войти, данные сохраняются."}>
          <Switch checked={form.state === "active"} disabled={isSelf} onCheckedChange={(v) => set("state", v ? "active" : "disabled")} />
        </FormRow>
      </fieldset>
    </EntitySheet>
  )
}

// Single-object access on top of the role: a campaign or a campaign group, read or edit.
function GrantsEditor({ value, onChange, groups, disabled }: {
  value: AccessGrant[]; onChange: (v: AccessGrant[]) => void; groups: { id: number; name: string }[]; disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  const name = (g: AccessGrant) =>
    g.kind === "campaign" ? campaigns.data?.find((c) => c.id === g.id)?.name ?? `Кампания #${g.id}` : groups.find((x) => x.id === g.id)?.name ?? `Группа #${g.id}`
  const has = (kind: AccessGrant["kind"], id: number) => value.some((g) => g.kind === kind && g.id === id)
  const add = (kind: AccessGrant["kind"], id: number) => {
    if (!has(kind, id)) onChange([...value, { kind, id, level: "read" }])
    setOpen(false)
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {value.map((g, i) => (
        <div key={`${g.kind}-${g.id}`} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border py-1 pr-1 pl-2">
          <span className="min-w-0 basis-full text-sm break-words">
            <span className="text-xs text-muted-foreground">{g.kind === "campaign" ? "Кампания" : "Группа кампаний"} · </span>{name(g)}
          </span>
          <Select value={g.level} onValueChange={(v) => onChange(value.map((x, j) => (j === i ? { ...x, level: v as AccessGrant["level"] } : x)))} disabled={disabled}>
            <SelectTrigger className="w-48 shrink-0" aria-label={`Доступ: ${name(g)}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="read">Просмотр и статистика</SelectItem>
              <SelectItem value="edit">Изменение</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label={`Убрать доступ: ${name(g)}`} disabled={disabled} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Icon icon={XIcon} />
          </Button>
        </div>
      ))}
      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="self-start"><Icon icon={PlusIcon} /> Добавить доступ</Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
            <Command>
              <CommandInput placeholder="Кампания или группа" />
              <CommandList>
                <CommandEmpty>Ничего не найдено</CommandEmpty>
                <CommandGroup heading="Группы кампаний">
                  {groups.filter((x) => !has("campaign_group", x.id)).map((x) => (
                    <CommandItem key={`g${x.id}`} value={`группа ${x.name} ${x.id}`} onSelect={() => add("campaign_group", x.id)}>{x.name}</CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Кампании">
                  {(campaigns.data ?? []).filter((c) => !has("campaign", c.id)).map((c) => (
                    <CommandItem key={`c${c.id}`} value={`${c.name} ${c.id}`} onSelect={() => add("campaign", c.id)}>
                      <span className="truncate">{c.name}</span><span className="ml-auto text-xs text-muted-foreground">#{c.id}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

// =====================================================================================
// Roles
// =====================================================================================

function RolesTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient()
  const [editId, setEditId] = useUrlParam("redit")
  const [toDelete, setToDelete] = useState<Role | null>(null)
  const roles = useQuery({ queryKey: ["roles"], queryFn: api.roles.list })
  const users = useQuery({ queryKey: ["users"], queryFn: api.users.list })
  const counts = useMemo(() => {
    const m: Record<number, number> = {}
    for (const u of users.data ?? []) m[u.role_id] = (m[u.role_id] ?? 0) + 1
    return m
  }, [users.data])

  const save = useMutation({
    mutationFn: (v: Partial<Role> & { id?: number }) =>
      v.id ? api.roles.update(v.id, v) : api.roles.create({ name: v.name!, description: v.description ?? "", access: v.access!, hidden_metrics: v.hidden_metrics ?? [], system: false }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["roles"] })
      toast.success(v.id ? "Роль сохранена" : "Роль создана")
      setEditId("")
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.roles.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); toast.success("Роль удалена") },
  })

  const columns = useMemo<ColumnDef<Role, unknown>[]>(
    () => [
      {
        accessorKey: "name", header: "Роль", enableHiding: false,
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.system && <Badge variant="outline">Системная</Badge>}
          </span>
        ),
      },
      { accessorKey: "description", header: "Описание", cell: ({ row }) => <span className="block max-w-96 truncate text-muted-foreground" title={row.original.description}>{row.original.description}</span> },
      { id: "users", header: "Пользователей", meta: { align: "right" }, accessorFn: (r) => counts[r.id] ?? 0 },
      { id: "hidden", header: "Скрытых метрик", meta: { align: "right" }, accessorFn: (r) => r.hidden_metrics.length },
      {
        id: "_menu", enableHiding: false, enableSorting: false, size: 36,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon-sm" aria-label="Действия"><Icon icon={EllipsisIcon} size={14} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => setEditId(String(row.original.id))}>{canEdit && !row.original.system ? "Изменить" : "Открыть"}</DropdownMenuItem>
              {canEdit && !row.original.system && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => (counts[row.original.id] ? toast.error(`К роли привязаны пользователи: ${counts[row.original.id]}. Переведите их на другую роль.`) : setToDelete(row.original))}
                  >
                    Удалить
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [counts, canEdit, setEditId],
  )
  const editing = editId && editId !== "new" ? roles.data?.find((r) => String(r.id) === editId) : undefined
  useMissingRecord(editId, roles.data, editing, setEditId)

  return (
    <>
      <Toolbar left={canEdit ? <Button onClick={() => setEditId("new")}><Icon icon={PlusIcon} size={14} /> Создать</Button> : undefined} />
      <DataTable
        data={roles.data ? [...roles.data] : undefined}
        loading={roles.isLoading}
        columns={columns}
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => setEditId(String(r.id))}
        storageKey="roles"
        empty="Ролей пока нет"
      />
      <RoleSheet
        key={`${editId}-${editing?.id ?? ""}`}
        open={!!editId}
        role={editing}
        readOnly={!canEdit || !!editing?.system}
        onClose={() => setEditId("")}
        onSave={(v) => save.mutate(v)}
        saving={save.isPending}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Удалить роль «${toDelete?.name ?? ""}»`}
        description="Роль без пользователей удаляется сразу, права пересчитывать не нужно."
        confirmLabel="Удалить"
        destructive
        onConfirm={() => { remove.mutate(toDelete!.id); setToDelete(null) }}
      />
    </>
  )
}

const GRID = "grid grid-cols-[minmax(140px,1fr)_repeat(5,76px)] items-center"
// Levels "own" / "groups" only make sense for entities that have an owner or a campaign group.
const FLAT_RESOURCES: Resource[] = ["logs", "settings", "users", "integrations", "archive"]
const levelsFor = (r: Resource) => ACCESS_LEVELS.filter((l) => !FLAT_RESOURCES.includes(r) || ["none", "read", "full"].includes(l.value))

function RoleSheet({
  open, role, readOnly, onClose, onSave, saving,
}: { open: boolean; role?: Role; readOnly: boolean; onClose: () => void; onSave: (v: Partial<Role>) => void; saving: boolean }) {
  const blank = (): Partial<Role> => ({
    name: "", description: "", hidden_metrics: [],
    access: Object.fromEntries(RESOURCES.map((r) => [r.key, "none"])) as Record<Resource, AccessLevel>,
  })
  const [form, setForm] = useState<Partial<Role>>(() => role ?? blank())
  const [err, setErr] = useState("")
  const access = form.access as Record<Resource, AccessLevel>
  const sections = useMemo(() => Array.from(new Set(RESOURCES.map((r) => r.section))), [])
  const setLevel = (k: Resource, v: AccessLevel) => setForm((f) => ({ ...f, access: { ...(f.access as Record<Resource, AccessLevel>), [k]: v } }))
  // a level that makes no sense for a resource leaves that resource unchanged
  const setAll = (v: AccessLevel) =>
    setForm((f) => ({
      ...f,
      access: Object.fromEntries(
        RESOURCES.map((r) => [r.key, levelsFor(r.key).some((l) => l.value === v) ? v : (f.access as Record<Resource, AccessLevel>)[r.key]]),
      ) as Record<Resource, AccessLevel>,
    }))
  const toggleMetric = (k: string, on: boolean) =>
    setForm((f) => ({ ...f, hidden_metrics: on ? [...(f.hidden_metrics ?? []), k] : (f.hidden_metrics ?? []).filter((x) => x !== k) }))

  const submit = () => {
    if (!form.name?.trim()) return setErr("Введите название роли")
    setErr("")
    onSave({ ...form, name: form.name.trim(), id: role?.id })
  }

  return (
    <EntitySheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={role ? `Роль «${role.name}»` : "Новая роль"}
      description={role?.system ? "Системная роль: права менять нельзя" : readOnly ? "Только просмотр: у вашей роли нет прав на изменение" : undefined}
      onSubmit={readOnly ? undefined : submit}
      submitLabel={role ? "Сохранить" : "Создать"}
      submitting={saving}
      wide
    >
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-3">
        <FormRow label="Название" error={err} htmlFor="r-name">
          <Input id="r-name" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-invalid={!!err} />
        </FormRow>
        <FormRow label="Описание" htmlFor="r-desc">
          <Textarea id="r-desc" rows={2} value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </FormRow>

        <div>
          <div className="mb-1 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">Доступ к разделам</h3>
            {!readOnly && <span className="hidden text-xs text-muted-foreground sm:inline">Клик по названию уровня выставляет его всем разделам</span>}
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            Что значит уровень — в подсказке к названию колонки. Группы кампаний задаются в карточке пользователя.
          </p>
          {/* phone: one select per section */}
          <div className="rounded-md border sm:hidden">
            {!readOnly && (
              <div className="flex items-center gap-2 border-b bg-muted px-2 py-1.5">
                <span className="text-xs text-muted-foreground">Всем разделам</span>
                <Select value="" onValueChange={(v) => setAll(v as AccessLevel)}>
                  <SelectTrigger className="ml-auto w-36" aria-label="Выставить уровень всем разделам"><SelectValue placeholder="Выбрать уровень" /></SelectTrigger>
                  <SelectContent position="popper">{ACCESS_LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {sections.map((sec) => (
              <div key={sec}>
                <div className="border-b bg-muted px-2 py-1 text-sm font-medium">{sec}</div>
                {RESOURCES.filter((r) => r.section === sec).map((r) => {
                  const cur = access[r.key] ?? "none"
                  return (
                    <div key={r.key} className="flex min-w-0 items-center gap-2 border-b px-2 py-1 last:border-b-0">
                      <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                      <Select value={cur} onValueChange={(v) => setLevel(r.key, v as AccessLevel)} disabled={readOnly}>
                        <SelectTrigger className="w-36" aria-label={r.name}><SelectValue /></SelectTrigger>
                        <SelectContent position="popper">
                          {ACCESS_LEVELS.filter((l) => levelsFor(r.key).some((x) => x.value === l.value) || cur === l.value).map((l) => (
                            <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-md border sm:block">
            <div className="min-w-[540px]">
              <div className={cn(GRID, "sticky top-0 border-b bg-muted text-[13px] text-muted-foreground")}>
                <div className="h-9 px-2 leading-9">Раздел</div>
                {ACCESS_LEVELS.map((l) => (
                  <Tooltip key={l.value}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-disabled={readOnly}
                        onClick={() => !readOnly && setAll(l.value)}
                        className="h-9 px-1 text-center font-medium whitespace-nowrap"
                      >
                        {LEVEL_SHORT[l.value]}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{l.label}: {l.hint}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
              {sections.map((sec) => (
                <div key={sec}>
                  <div className="border-b bg-muted px-2 py-1 text-sm font-medium">{sec}</div>
                  {RESOURCES.filter((r) => r.section === sec).map((r) => (
                    <RadioGroup
                      key={r.key}
                      value={access[r.key] ?? "none"}
                      onValueChange={(v) => setLevel(r.key, v as AccessLevel)}
                      disabled={readOnly}
                      aria-label={r.name}
                      className={cn(GRID, "h-9 gap-0 border-b last:border-b-0")}
                    >
                      <div className="truncate px-2 text-sm">{r.name}</div>
                      {ACCESS_LEVELS.map((l) => {
                        // a level hidden for this resource stays visible only when the role already holds it
                        const shown = levelsFor(r.key).some((x) => x.value === l.value) || (access[r.key] ?? "none") === l.value
                        return (
                          <div key={l.value} className="flex justify-center">
                            {shown && <RadioGroupItem value={l.value} aria-label={`${r.name}: ${l.label}`} />}
                          </div>
                        )
                      })}
                    </RadioGroup>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Скрытые метрики</h3>
          <p className="mb-2 text-xs text-muted-foreground">Пользователи с этой ролью не увидят эти колонки нигде: ни в отчётах, ни в таблицах, ни на дашборде.</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {MONEY_METRICS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={(form.hidden_metrics ?? []).includes(k)} onCheckedChange={(v) => toggleMetric(k, !!v)} />
                {METRICS.find((m) => m.key === k)?.name ?? k}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
    </EntitySheet>
  )
}

// =====================================================================================
// API keys (also used on the profile page)
// =====================================================================================

export function ApiKeysTable({ userId, canManage }: { userId?: number; canManage: boolean }) {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [toDelete, setToDelete] = useState<ApiKey | null>(null)
  const keys = useQuery({ queryKey: ["api-keys", userId ?? "all"], queryFn: () => api.apiKeys.list(userId) })
  const users = useQuery({ queryKey: ["users"], queryFn: api.users.list, enabled: !userId })

  const remove = useMutation({
    mutationFn: (id: number) => api.apiKeys.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast.success("Ключ удалён") },
  })

  const columns = useMemo<ColumnDef<ApiKey, unknown>[]>(
    () => [
      { accessorKey: "name", header: "Название", enableHiding: false, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      ...(userId ? [] : [{ id: "user", header: "Пользователь", accessorFn: (k: ApiKey) => users.data?.find((u) => u.id === k.user_id)?.login ?? `#${k.user_id}` } as ColumnDef<ApiKey, unknown>]),
      { accessorKey: "prefix", header: "Префикс", cell: ({ row }) => <span className="font-mono">{row.original.prefix}…</span> },
      { id: "created", header: "Создан", accessorFn: (k) => k.created_at, cell: ({ row }) => <span className="num">{formatDate(row.original.created_at)}</span> },
      { id: "last_used", header: "Использован", accessorFn: (k) => k.last_used_at ?? "", cell: ({ row }) => <span className="text-muted-foreground">{timeAgo(row.original.last_used_at)}</span> },
      ...(canManage
        ? [{
            id: "_del", enableHiding: false, enableSorting: false, size: 36,
            cell: ({ row }) => (
              <Button variant="ghost" size="icon-sm" aria-label="Удалить ключ" onClick={() => setToDelete(row.original)}>
                <Icon icon={Trash2Icon} size={14} />
              </Button>
            ),
          } as ColumnDef<ApiKey, unknown>]
        : []),
    ],
    [userId, users.data, canManage],
  )

  return (
    <>
      <Toolbar
        left={canManage ? <Button onClick={() => setCreateOpen(true)}><Icon icon={PlusIcon} size={14} /> Создать ключ</Button> : undefined}
        right={<span className="text-xs text-muted-foreground">Ключ передаётся в заголовке <code className="font-mono">Api-Key</code> и действует с правами владельца</span>}
      />
      <DataTable data={keys.data ? [...keys.data] : undefined} loading={keys.isLoading} columns={columns} getRowId={(k) => String(k.id)} storageKey={`api-keys-${userId ? "own" : "all"}`} empty="API-ключей пока нет" />
      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} userId={userId} users={users.data ?? []} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Удалить ключ «${toDelete?.name ?? ""}»`}
        description="Скрипты и сервисы с этим ключом сразу потеряют доступ. Отменить нельзя, создайте новый ключ."
        confirmLabel="Удалить"
        destructive
        onConfirm={() => { remove.mutate(toDelete!.id); setToDelete(null) }}
      />
    </>
  )
}

function CreateKeyDialog({ open, onOpenChange, userId, users }: { open: boolean; onOpenChange: (v: boolean) => void; userId?: number; users: User[] }) {
  const qc = useQueryClient()
  const me = useQuery({ queryKey: ["me"], queryFn: api.me })
  const [name, setName] = useState("")
  const [owner, setOwner] = useState("")
  const [err, setErr] = useState("")
  const [secret, setSecret] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => api.apiKeys.create(userId ?? Number(owner || me.data?.id), name.trim()),
    onSuccess: (k) => { setSecret(k.secret); qc.invalidateQueries({ queryKey: ["api-keys"] }) },
  })
  const close = (v: boolean) => {
    onOpenChange(v)
    if (!v) { setName(""); setOwner(""); setErr(""); setSecret(null) }
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{secret ? "Ключ создан" : "Новый API-ключ"}</DialogTitle>
          <DialogDescription>{secret ? "Скопируйте ключ сейчас." : "Ключ получит права выбранного пользователя."}</DialogDescription>
        </DialogHeader>
        {secret ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 rounded-md border bg-muted p-2 font-mono text-xs break-all">{secret}</code>
              <CopyButton value={secret} />
            </div>
            <p className="rounded-md border border-warning/40 p-2 text-xs text-warning">
              Больше этот ключ не покажут. Если потеряете, удалите его и создайте новый.
            </p>
            <DialogFooter><Button onClick={() => close(false)}>Готово</Button></DialogFooter>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return setErr("Введите название, например «Загрузка расходов»")
              create.mutate()
            }}
          >
            <FormRow label="Название" error={err} htmlFor="k-name">
              <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!err} />
            </FormRow>
            {!userId && (
              <FormRow label="Пользователь">
                <Select value={owner || String(me.data?.id ?? "")} onValueChange={setOwner}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.login}</SelectItem>)}</SelectContent>
                </Select>
              </FormRow>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>Отмена</Button>
              <Button type="submit" disabled={create.isPending}>Создать ключ</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
