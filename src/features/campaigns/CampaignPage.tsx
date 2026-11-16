// Campaign page, Keitaro layout: on wide screens settings tabs on the left and streams on the right;
// on narrower screens streams become the first tab.
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Link, useBlocker, useNavigate, useParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ChevronLeftIcon, EllipsisIcon, PlusIcon, XIcon } from "lucide-react"
import type { Campaign, CampaignParameter, ConversionStatus, S2SPostback, Stream } from "@/api/types"
import { api } from "@/api/client"
import { cn } from "@/lib/utils"
import { CONVERSION_STATUSES } from "@/api/meta"
import { ApproachSelect } from "./ApproachSelect"
import { usePeriod, useUrlParam } from "@/app/state"
import { Page } from "@/components/page"
import { ConfirmDialog, CopyButton, FormRow, StateDot } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CostsSheet } from "./CostsSheet"
import { TemplateSheet } from "./TemplateSheet"
import { DevNote } from "@/features/devnotes/notes"
import { StreamsTab, dropWeightDraft, hasWeightDraft } from "./StreamsTab"

const PARAM_NAMES = ["keyword", "cost", "currency", "external_id", "creative_id", "ad_campaign_id", "source", ...Array.from({ length: 30 }, (_, i) => `sub_id_${i + 1}`)]

// Keyed by id: moving to another campaign starts with fresh stream selection, drafts and sheets.
export default function CampaignRoute() {
  const { id } = useParams()
  return <CampaignPage key={id} id={id} />
}

function CampaignPage({ id }: { id: string | undefined }) {
  const cid = Number(id)
  const qc = useQueryClient()
  const nav = useNavigate()
  // the server decides per campaign: the role, or a single-object grant (read / edit) on it or its group;
  // while it loads, the page is read-only
  const myAccess = useQuery({ queryKey: ["campaigns", cid, "access"], queryFn: () => api.campaigns.access(cid) })
  const canEdit = myAccess.data?.level === "edit"
  const streamsAccess = { canEdit: myAccess.data?.streams === "edit" }
  const [range, setRange] = usePeriod()
  const [tab, setTab] = useUrlParam("tab", "streams")
  const wide = useWide()
  const leftTab = wide && tab === "streams" ? "settings" : tab
  const [form, setForm] = useState<Campaign | null>(null)
  const [costs, setCosts] = useState(false)
  const [applyTpl, setApplyTpl] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  // Streams export / import as JSON: same format the backend will accept (Stream[] without ids).
  const exportStreams = async () => {
    const ss = await api.streams.byCampaign(cid)
    const data = ss.map(({ id: _id, campaign_id: _c, updated_at: _u, ...rest }) => rest)
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    a.download = `streams-${cid}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success(`Выгружено потоков: ${data.length}`)
  }
  const importStreams = async (file: File) => {
    try {
      const rows = JSON.parse(await file.text()) as Partial<Stream>[]
      const ok = (r: Partial<Stream>) => typeof r.name === "string" && ["regular", "forced", "default"].includes(r.type ?? "") &&
        Array.isArray(r.filters) && Array.isArray(r.landings) && Array.isArray(r.offers)
      if (!Array.isArray(rows) || !rows.length || !rows.every(ok)) throw new Error()
      const have = (await api.streams.byCampaign(cid)).length
      for (const [i, r] of rows.entries()) {
        await api.streams.create({ ...r, campaign_id: cid, weight: 0, position: have + i, updated_at: new Date().toISOString() } as Omit<Stream, "id">)
      }
      qc.invalidateQueries({ queryKey: ["streams"] })
      toast.success(`Импортировано потоков: ${rows.length}. Веса выставлены в 0, проверьте и включите нужные`)
    } catch {
      toast.error("Файл не похож на выгрузку потоков: нужен JSON-массив потоков из «Экспорт потоков»")
    }
  }

  const campaign = useQuery({ queryKey: ["campaigns", cid], queryFn: () => api.campaigns.get(cid) })
  const domains = useQuery({ queryKey: ["domains"], queryFn: api.domains.list })
  const groups = useQuery({ queryKey: ["groups", "campaigns"], queryFn: () => api.groups.list("campaigns") })
  const sources = useQuery({ queryKey: ["trafficSources"], queryFn: api.trafficSources.list })
  const allCampaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })

  if (campaign.data && (!form || form.id !== campaign.data.id)) setForm(structuredClone(campaign.data))
  const dirty = !!form && !!campaign.data && JSON.stringify(form) !== JSON.stringify(campaign.data)
  // One guard for the whole page: unsaved settings or unsaved stream weights.
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    currentLocation.pathname !== nextLocation.pathname && (dirty || hasWeightDraft(cid)))
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", h)
    return () => window.removeEventListener("beforeunload", h)
  }, [dirty])

  // what makes the link or the routing broken; the API checks the same
  const invalid = (c: Campaign) =>
    !c.name.trim() ? "Введите название кампании"
    : !c.alias.trim() ? "Введите идентификатор: без него у кампании нет ссылки"
    : allCampaigns.data?.some((x) => x.id !== c.id && x.alias === c.alias) ? `Идентификатор «${c.alias}» уже занят другой кампанией`
    : !(c.cookies_ttl >= 1 && c.cookies_ttl <= 8760) ? "Срок уникальности — от 1 до 8760 часов"
    : ""
  const save = useMutation({
    mutationFn: (c: Campaign) => {
      const err = invalid(c)
      return err ? Promise.reject(new Error(err)) : api.campaigns.update(c.id, c)
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: (c) => {
      qc.setQueryData(["campaigns", cid], c)
      qc.invalidateQueries({ queryKey: ["campaigns"] })
      setForm(structuredClone(c))
      toast.success("Кампания сохранена")
    },
  })
  const clone = useMutation({
    mutationFn: () => api.campaigns.clone(cid),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["campaigns"] }); toast.success("Кампания клонирована вместе с потоками"); nav(`/campaigns/${c.id}?tab=settings`) },
  })
  const archive = useMutation({
    mutationFn: () => api.campaigns.remove(cid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["campaigns"] }); toast.success("Кампания в архиве"); nav("/campaigns") },
  })

  if (campaign.isError || campaign.data?.state === "deleted") {
    return (
      <Page className="items-center py-24 text-center">
        <p className="text-sm">Кампания #{id} не найдена или в архиве</p>
        <Button asChild variant="outline"><Link to="/campaigns">К списку кампаний</Link></Button>
      </Page>
    )
  }
  if (!form) return <Page><Skeleton className="h-8 w-80" /><Skeleton className="h-96 w-full" /></Page>

  const set = <K extends keyof Campaign>(k: K, v: Campaign[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const domain = domains.data?.find((d) => d.id === form.domain_id)
  // the tracking link goes into the ad as is: domain / alias + the campaign parameters with the source macros
  const query = form.parameters.filter((p) => p.name && p.placeholder).map((p) => `${p.name}=${p.placeholder}`).join("&")
  const url = `https://${domain?.name ?? "домен-не-выбран"}/${form.alias}${query ? `?${query}` : ""}`

  return (
    <Page>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="К списку кампаний" className="-ml-2">
          <Link to="/campaigns"><Icon icon={ChevronLeftIcon} /></Link>
        </Button>
        <StateDot state={form.state} />
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          disabled={!canEdit}
          aria-label="Название кампании"
          className="-mx-1 h-9 w-auto min-w-24 flex-1 border-transparent bg-transparent px-1 text-xl font-semibold tracking-tight shadow-none [field-sizing:content] focus-visible:border-ring sm:max-w-xl sm:flex-none md:text-xl dark:bg-transparent"
        />
        <span className="text-xs text-muted-foreground">#{form.id}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirty && <span className="hidden text-xs text-warning sm:inline">Не сохранено</span>}
          {canEdit && (
            <>
              {dirty ? (
                <>
                  <Button variant="outline" onClick={() => setForm(structuredClone(campaign.data!))}>Отменить</Button>
                  <Button disabled={save.isPending} onClick={() => save.mutate(form)}>Сохранить</Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground max-sm:hidden">Сохранено</span>
              )}
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Действия с кампанией"><Icon icon={EllipsisIcon} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem onClick={() => nav(`/reports?f_campaign=${encodeURIComponent(form.name)}&g=stream`)}>Отчёт по кампании</DropdownMenuItem>
              <DropdownMenuItem onClick={() => nav(`/clicks?c=${form.id}`)}>Лог кликов</DropdownMenuItem>
              <DropdownMenuItem onClick={() => nav(`/conversions?c=${form.id}`)}>Лог конверсий</DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuItem onClick={() => setCosts(true)}>Обновить расходы</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => clone.mutate()}>Клонировать с потоками</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportStreams()}>Экспорт потоков (JSON)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => importRef.current?.click()}>Импорт потоков из JSON</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>В архив</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="text-muted-foreground">Трекинг-ссылка</span>
        <code className="min-w-0 flex-1 truncate font-mono" title={url}>{url}</code>
        <CopyButton value={url} label="Копировать" />
        <span className="ml-auto text-muted-foreground">
          {form.stats_excluded && <span className="text-warning">не в статистике · </span>}уникальность {form.cookies_ttl} ч
        </span>
      </div>

      {form.is_template && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <span className="font-medium">Эталон</span>
          <span className="text-muted-foreground">
            для кампаний: <span className="num text-foreground">{allCampaigns.data?.filter((c) => c.template_id === form.id).length ?? 0}</span>.
            Меняйте потоки здесь, потом примените к кампаниям
          </span>
          {streamsAccess.canEdit && <Button variant="outline" className="ml-auto" onClick={() => setApplyTpl(true)}>Применить к кампаниям</Button>}
        </div>
      )}
      {form.template_id && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <span className="text-muted-foreground">Потоки берутся из эталона</span>
          <Link to={`/campaigns/${form.template_id}`} className="text-link">{allCampaigns.data?.find((c) => c.id === form.template_id)?.name ?? `#${form.template_id}`}</Link>
          <span className="text-muted-foreground max-sm:hidden">· изменения эталона приходят сюда, когда его применяют</span>
        </div>
      )}

      <div className={cn(wide && "grid grid-cols-[minmax(0,30rem)_minmax(0,1fr)] items-start gap-6")}>
      <Tabs value={leftTab} onValueChange={setTab} className="min-w-0">
        <TabsList variant="line" className="max-w-full justify-start overflow-x-auto max-sm:gap-0">
          {!wide && <TabsTrigger className="max-sm:px-1" value="streams">Потоки</TabsTrigger>}
          <TabsTrigger className="max-sm:px-1" value="settings">Общие</TabsTrigger>
          <TabsTrigger className="max-sm:px-1" value="params">Параметры</TabsTrigger>
          <TabsTrigger className="max-sm:px-1" value="postbacks"><span className="sm:hidden">Постбеки</span><span className="hidden sm:inline">S2S постбеки</span>{form.postbacks.length > 0 && <span className="text-muted-foreground">{form.postbacks.length}</span>}</TabsTrigger>
          <TabsTrigger className="max-sm:px-1" value="notes">Заметки</TabsTrigger>
        </TabsList>

        {!wide && (
          <TabsContent value="streams" className="pt-2">
            <StreamsTab campaign={form} range={range} setRange={setRange} canEdit={streamsAccess.canEdit} />
          </TabsContent>
        )}

        <TabsContent value="settings" className="pt-2">
          <fieldset disabled={!canEdit} className={cn("grid gap-x-10", !wide && "lg:grid-cols-2")}>
            <div>
              <h3 className="py-2 text-base font-medium">Основное</h3>
              <FormRow label="Домен" hint="Домен со статусом «Работает». Ссылка: https://домен/идентификатор">
                <Select value={form.domain_id ? String(form.domain_id) : ""} onValueChange={(v) => set("domain_id", Number(v))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Выберите домен" /></SelectTrigger>
                  <SelectContent>
                    {domains.data?.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)} disabled={d.status !== "ok"}>
                        {d.name}{d.status !== "ok" && " — не готов"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Идентификатор" hint="Часть ссылки после домена">
                <Input value={form.alias} onChange={(e) => set("alias", e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))} className="font-mono" />
              </FormRow>
              <FormRow label="Подход" hint="Кампания = подход + гео + байер. В отчётах есть группировка «Подход»">
                <ApproachSelect value={form.approach} onChange={(v) => set("approach", v)} disabled={!canEdit} allowEmpty />
              </FormRow>
              <FormRow label="Группа">
                <Select value={form.group_id ? String(form.group_id) : "none"} onValueChange={(v) => set("group_id", v === "none" ? null : Number(v))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без группы</SelectItem>
                    {groups.data?.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Источник" hint="Параметры и постбек источника подставятся в кампанию">
                <Select value={form.traffic_source_id ? String(form.traffic_source_id) : "none"} onValueChange={(v) => set("traffic_source_id", v === "none" ? null : Number(v))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не задан</SelectItem>
                    {sources.data?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Эталон" hint={form.is_template ? "Потоки этой кампании копируются в привязанные кампании" : "Кампания получает потоки из эталона, когда его применяют"}>
                <Select
                  value={form.is_template ? "self" : form.template_id ? String(form.template_id) : "none"}
                  onValueChange={(v) => setForm((f) => (f ? { ...f, is_template: v === "self", template_id: v === "self" || v === "none" ? null : Number(v) } : f))}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без эталона</SelectItem>
                    <SelectItem value="self">Эта кампания — эталон</SelectItem>
                    {allCampaigns.data?.filter((c) => c.is_template && c.id !== form.id).map((c) => <SelectItem key={c.id} value={String(c.id)}>Следует эталону: {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow label="Статистика" hint="Кампания работает как обычно, но отчёты, дашборд и тренды её не считают, пока в них не включить «Исключённые кампании». Для тестов и служебных кампаний">
                <Label className="flex items-center gap-2 text-sm font-normal">
                  <Checkbox checked={form.stats_excluded} onCheckedChange={(v) => set("stats_excluded", !!v)} /> Не учитывать в статистике
                </Label>
              </FormRow>
              <FormRow label="Состояние">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.state === "active"} onCheckedChange={(v) => set("state", v ? "active" : "disabled")} />
                  {form.state === "active" ? "Включена: принимает трафик" : "Выключена: ссылка отдаёт 404"}
                </label>
              </FormRow>
            </div>

            <div>
              <h3 className="py-2 text-base font-medium">Уникальность</h3>
              <FormRow label="Уникальность">
                <div className="flex flex-col gap-2">
                  <RadioGroup value={form.uniqueness_method} onValueChange={(v) => set("uniqueness_method", v as Campaign["uniqueness_method"])} className="flex flex-wrap gap-4">
                    <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="ip_ua" />IP + User-Agent</Label>
                    <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="ip" />Только IP</Label>
                    <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="parameter" />По параметру</Label>
                  </RadioGroup>
                  <Label className="flex items-center gap-2 text-sm font-normal">
                    <Checkbox checked={form.uniqueness_use_cookies} onCheckedChange={(v) => set("uniqueness_use_cookies", !!v)} /> Учитывать cookies
                  </Label>
                </div>
              </FormRow>
              <FormRow label="Срок уникальности" hint="От 1 до 8760 часов">
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={8760} className="w-24" value={form.cookies_ttl} onChange={(e) => set("cookies_ttl", Number(e.target.value))} />
                  <span className="text-sm text-muted-foreground">часов</span>
                </div>
              </FormRow>

            </div>
          </fieldset>
        </TabsContent>

        <TabsContent value="params" className="pt-2">
          <ParamsEditor
            value={form.parameters}
            onChange={(v) => set("parameters", v)}
            readOnly={!canEdit}
            onPull={() => {
              const src = sources.data?.find((s) => s.id === form.traffic_source_id)
              if (!src) return toast.error("У кампании не выбран источник")
              set("parameters", structuredClone(src.parameters))
              toast.success(`Параметры взяты из источника «${src.name}». Не забудьте сохранить`)
            }}
          />
          <div className="mt-3 rounded-md border bg-muted p-3 text-sm">
            <div className="mb-1 text-muted-foreground">Ссылка для источника с параметрами</div>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 font-mono break-all">{url}</code>
              <CopyButton value={url} />
            </div>
          </div>
          <DevNote id="tracking_link" className="mt-3" />
        </TabsContent>

        <TabsContent value="postbacks" className="pt-2">
          <SourcePostback sourceId={form.traffic_source_id} />
          <PostbacksEditor value={form.postbacks} onChange={(v) => set("postbacks", v)} readOnly={!canEdit} />
          <DevNote id="s2s_default" className="mt-3" />
        </TabsContent>

        <TabsContent value="notes" className="pt-2">
          <Textarea rows={10} disabled={!canEdit} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Договорённости, ставки, кто отвечает за кампанию" className="max-w-3xl" />
        </TabsContent>
      </Tabs>
      {wide && (
        <div className="min-w-0">
          <StreamsTab campaign={form} range={range} setRange={setRange} canEdit={streamsAccess.canEdit} />
        </div>
      )}
      </div>

      <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importStreams(f); e.target.value = "" }} />
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(v) => !v && blocker.reset?.()}
        title="Изменения не сохранены"
        description="Изменены настройки кампании или веса потоков. Если уйти, изменения пропадут."
        confirmLabel="Уйти без сохранения"
        destructive
        onConfirm={() => { dropWeightDraft(cid); blocker.proceed?.() }}
      />
      <CostsSheet campaign={costs ? form : null} onClose={() => setCosts(false)} />
      {campaign.data?.is_template && <TemplateSheet template={campaign.data} open={applyTpl} onClose={() => setApplyTpl(false)} />}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Переместить кампанию в архив?"
        description="Ссылка кампании перестанет работать сразу. Статистика сохранится, кампанию можно восстановить в «Архиве»."
        confirmLabel="В архив"
        destructive
        onConfirm={() => archive.mutate()}
      />
    </Page>
  )
}

function ParamsEditor({ value, onChange, readOnly, onPull }: { value: CampaignParameter[]; onChange: (v: CampaignParameter[]) => void; readOnly: boolean; onPull: () => void }) {
  const upd = (i: number, p: Partial<CampaignParameter>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Какие данные источник передаёт в ссылке и как они называются в отчётах. Например, ID объявления Facebook приходит в sub_id_6 и в отчётах называется «ID объявления».
      </p>
      <div className="overflow-hidden rounded-md border">
        {/* <sm: every parameter is a small block, fields one under another */}
        <table className="block w-full text-sm sm:table">
          <thead className="hidden text-[13px] text-muted-foreground sm:table-header-group">
            <tr className="border-b">
              <th className="h-9 px-2 text-left font-medium">Параметр трекера</th>
              <th className="px-2 text-left font-medium">Название в отчётах</th>
              <th className="px-2 text-left font-medium">Значение из источника</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {value.map((p, i) => (
              <tr key={i} className="relative block border-b last:border-b-0 sm:table-row">
                <td className="block px-2 pt-2 pb-1 sm:table-cell sm:py-1.5">
                  <span className="mb-1 block text-muted-foreground sm:hidden">Параметр трекера</span>
                  <Select value={p.name} onValueChange={(v) => upd(i, { name: v })} disabled={readOnly}>
                    <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{PARAM_NAMES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="block px-2 py-1 sm:table-cell sm:py-1.5">
                  <span className="mb-1 block text-muted-foreground sm:hidden">Название в отчётах</span>
                  <Input value={p.alias} disabled={readOnly} onChange={(e) => upd(i, { alias: e.target.value })} />
                </td>
                <td className="block px-2 pt-1 pb-2 sm:table-cell sm:py-1.5">
                  <span className="mb-1 block text-muted-foreground sm:hidden">Значение из источника</span>
                  <Input value={p.placeholder} disabled={readOnly} onChange={(e) => upd(i, { placeholder: e.target.value })} className="font-mono" placeholder="{{ad.id}}" />
                </td>
                {!readOnly && (
                  <td className="absolute top-1 right-1 sm:static sm:table-cell sm:px-1">
                    <Button variant="ghost" size="icon-sm" aria-label="Удалить параметр" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                      <Icon icon={XIcon} size={14} />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const used = new Set(value.map((p) => p.name))
              const next = PARAM_NAMES.find((n) => n.startsWith("sub_id") && !used.has(n)) ?? "sub_id_30"
              onChange([...value, { name: next, alias: "", placeholder: "" }])
            }}
          >
            <Icon icon={PlusIcon} size={14} /> Добавить параметр
          </Button>
          <Button variant="ghost" onClick={onPull}>Взять из источника</Button>
        </div>
      )}
    </div>
  )
}

const MACROS = ["{subid}", "{status}", "{revenue}", "{payout}", "{tid}", "{external_id}", "{campaign_id}", "{offer_id}", "{sub_id_1}…{sub_id_30}", "{country}", "{ip}", "{user_agent}", "{date:Y-m-d}"]

// The traffic source's postback is sent for every campaign with that source; shown here read-only.
function SourcePostback({ sourceId }: { sourceId: number | null }) {
  const sources = useQuery({ queryKey: ["trafficSources"], queryFn: api.trafficSources.list })
  const src = sources.data?.find((s) => s.id === sourceId)
  const statuses = (src?.postback_statuses ?? []).map((st) => CONVERSION_STATUSES.find((x) => x.value === st)?.label ?? st)
  return (
    <div className="mb-3 flex flex-col gap-1 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="font-medium">Постбек источника</span>
        {src && <Link to={`/traffic-sources?edit=${src.id}`} className="text-link">{src.name}</Link>}
        <span className="text-xs text-muted-foreground">· уходит по умолчанию для всех кампаний источника, меняется в источнике</span>
      </div>
      {!src ? (
        <span className="text-muted-foreground">У кампании не выбран источник: постбека по умолчанию нет</span>
      ) : !src.postback_url ? (
        <span className="text-warning">В источнике «{src.name}» постбек не задан</span>
      ) : (
        <>
          <code className="truncate font-mono text-muted-foreground" title={src.postback_url}>{src.postback_url}</code>
          <span className="text-xs text-muted-foreground">Отправлять при: {statuses.length ? statuses.join(", ") : "ни при каком статусе (выключен)"}</span>
        </>
      )}
    </div>
  )
}

function PostbacksEditor({ value, onChange, readOnly }: { value: S2SPostback[]; onChange: (v: S2SPostback[]) => void; readOnly: boolean }) {
  const upd = (i: number, p: Partial<S2SPostback>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Дополнительные постбеки этой кампании (вебхук команды, Telegram, второй пиксель) — сверх постбека источника. Неудачные отправки видны в разделе «Постбеки».
      </p>
      {value.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Дополнительных постбеков нет</p>}
      {value.map((p, i) => (
        <div key={p.id} className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={p.method} onValueChange={(v) => upd(i, { method: v as S2SPostback["method"] })} disabled={readOnly}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="GET">GET</SelectItem><SelectItem value="POST">POST</SelectItem></SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">Отправлять при:</span>
            {CONVERSION_STATUSES.slice(0, 4).map((s) => (
              <Label key={s.value} className="flex items-center gap-1.5 text-sm font-normal">
                <Checkbox
                  disabled={readOnly}
                  checked={p.statuses.includes(s.value)}
                  onCheckedChange={(v) => upd(i, { statuses: v ? [...p.statuses, s.value] : p.statuses.filter((x) => x !== s.value) as ConversionStatus[] })}
                />
                {s.label}
              </Label>
            ))}
            {!readOnly && (
              <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Удалить постбек" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <Icon icon={XIcon} size={14} />
              </Button>
            )}
          </div>
          <Input value={p.url} disabled={readOnly} onChange={(e) => upd(i, { url: e.target.value })} className="font-mono" placeholder="https://…?subid={subid}&status={status}" />
        </div>
      ))}
      {!readOnly && (
        <Button variant="outline" className="self-start" onClick={() => onChange([...value, { id: Date.now(), method: "GET", statuses: ["sale"], url: "" }])}>
          <Icon icon={PlusIcon} size={14} /> Добавить постбек
        </Button>
      )}
      <div className="text-xs text-muted-foreground">
        Макросы: {MACROS.map((m) => <code key={m} className="mr-1.5 rounded-sm bg-muted px-1 font-mono">{m}</code>)}
      </div>
    </div>
  )
}

// ≥1440px: two panes like Keitaro (settings | streams); narrower screens get tabs, so stream names stay readable.
const WIDE = "(min-width: 1440px)"
function useWide() {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(WIDE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb) },
    () => matchMedia(WIDE).matches,
  )
}
