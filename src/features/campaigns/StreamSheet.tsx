// Stream editor in a side panel: Основное · Схема · Фильтры · Заметки.
import { useState } from "react"
import { PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import type { Campaign, Landing, Offer, Stream, StreamSchema, StreamType } from "@/api/types"
import { geoText, isRestricted } from "@/features/offers/caps"
import { STREAM_ACTIONS, STREAM_SCHEMAS, STREAM_TYPES } from "@/api/meta"
import { EntitySheet, FormRow } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { FilterEditor } from "./FilterEditor"
import { streamProblems } from "./stream-text"

export function newStream(campaignId: number, position: number): Stream {
  return {
    id: 0, campaign_id: campaignId, type: "regular", name: "", position, weight: 100, state: "active", collect_clicks: true,
    schema: "landings", action_type: "http", action_payload: "", filter_or: false, filters: [], landings: [], offers: [],
    offer_selection: "before_click", comments: "", updated_at: new Date().toISOString(),
  }
}

export function StreamSheet({
  open, stream, landings, offers, campaigns, readOnly, onClose, onSave, saving,
}: {
  open: boolean; stream: Stream | null; landings: Landing[]; offers: Offer[]; campaigns: Campaign[]; readOnly: boolean
  onClose: () => void; onSave: (s: Stream) => void; saving: boolean
}) {
  const [form, setForm] = useState<Stream | null>(null)
  const [tab, setTab] = useState("main")
  const [err, setErr] = useState<string | null>(null)
  const key = stream ? `${stream.id}-${stream.position}` : null
  const [loaded, setLoaded] = useState<string | null>(null)
  if (open && stream && loaded !== key) {
    setLoaded(key)
    setForm(structuredClone(stream))
    setTab("main")
    setErr(null)
  }
  if (!open && loaded) setLoaded(null)
  if (!form) return null
  const set = <K extends keyof Stream>(k: K, v: Stream[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const problems = [
    ...streamProblems(form),
    ...(form.type === "regular" && form.weight === 0 ? ["Вес 0 — поток не получит трафик"] : []),
  ]

  const submit = () => {
    if (!form.name.trim()) { setErr("Введите название потока"); setTab("main"); return }
    onSave(form)
  }

  return (
    <EntitySheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      wide
      title={form.id ? `Поток #${form.id}` : "Новый поток"}
      description={readOnly ? "Только просмотр: у вашей роли нет прав на изменение" : form.name || undefined}
      onSubmit={readOnly ? undefined : submit}
      submitLabel={form.id ? "Сохранить поток" : "Создать поток"}
      submitting={saving}
      footerExtra={problems.length > 0 && (
        <span className="flex items-center gap-1 text-xs text-warning max-sm:basis-full"><Icon icon={TriangleAlertIcon} size={14} />{problems[0]}</span>
      )}
    >
      <Tabs value={tab} onValueChange={setTab} className="min-w-0">
        <TabsList variant="line" className="mb-3 max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="main">Основное</TabsTrigger>
          <TabsTrigger value="schema">
            Схема
            {form.schema === "landings" && <span className="text-muted-foreground" title="Лендингов → офферов">{form.landings.length}→{form.offers.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="filters">Фильтры{form.filters.length > 0 && <span className="text-muted-foreground">{form.filters.length}</span>}</TabsTrigger>
          <TabsTrigger value="notes">Заметки</TabsTrigger>
        </TabsList>

        <fieldset disabled={readOnly} className="min-w-0">
          <TabsContent value="main">
            <FormRow label="Название" error={err ?? undefined} htmlFor="s-name">
              <Input id="s-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="US | Партнёрка | Оффер" aria-invalid={!!err} />
            </FormRow>
            <FormRow label="Тип потока">
              <RadioGroup value={form.type} onValueChange={(v) => set("type", v as StreamType)} className="gap-2">
                {STREAM_TYPES.map((t) => (
                  <Label key={t.value} className="flex items-start gap-2 font-normal">
                    <RadioGroupItem value={t.value} className="mt-0.5" />
                    <span className="flex flex-col">
                      <span className="text-sm">{t.label}</span>
                      <span className="text-xs text-muted-foreground">{t.hint}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </FormRow>
            {form.type === "regular" && (
              <FormRow label="Вес" hint="Доля потока = вес / сумма весов всех обычных потоков. Вес 0 — новые клики не идут, привязанные посетители продолжают.">
                <Input type="number" min={0} className="w-28" value={form.weight} onChange={(e) => set("weight", Math.max(0, Number(e.target.value)))} />
              </FormRow>
            )}
            <FormRow label="Считать клики" hint="Выключите для служебных потоков, чтобы клики не попадали в статистику">
              <Switch checked={form.collect_clicks} onCheckedChange={(v) => set("collect_clicks", v)} />
            </FormRow>
            <FormRow label="Включён">
              <Switch checked={form.state === "active"} onCheckedChange={(v) => set("state", v ? "active" : "disabled")} />
            </FormRow>
          </TabsContent>

          <TabsContent value="schema" className="flex min-w-0 flex-col gap-4">
            <ToggleGroup type="single" variant="outline" value={form.schema} onValueChange={(v) => v && set("schema", v as StreamSchema)} className="flex-wrap justify-start">
              {STREAM_SCHEMAS.map((s) => <ToggleGroupItem key={s.value} value={s.value}>{s.label}</ToggleGroupItem>)}
            </ToggleGroup>

            {form.schema === "landings" && (
              <>
                <ShareList
                  title="Лендинги"
                  empty="Без лендинга: посетитель сразу уходит на оффер"
                  items={form.landings.map((l) => ({ id: l.landing_id, share: l.share, on: l.state === "active" }))}
                  options={landings.filter((l) => l.state !== "deleted").map((l) => ({ id: l.id, name: l.name }))}
                  onChange={(xs) => set("landings", xs.map((x) => ({ landing_id: x.id, share: x.share, state: x.on ? "active" : "disabled" })))}
                  addLabel="Добавить лендинг"
                />
                <ShareList
                  title="Офферы"
                  empty="Добавьте хотя бы один оффер"
                  items={form.offers.map((o) => ({ id: o.offer_id, share: o.share, on: o.state === "active" }))}
                  options={offers.filter((o) => o.state !== "deleted").map((o) => ({ id: o.id, name: o.name }))}
                  onChange={(xs) => set("offers", xs.map((x) => ({ offer_id: x.id, share: x.share, state: x.on ? "active" : "disabled" })))}
                  addLabel="Добавить оффер"
                  note={(id) => { const o = offers.find((x) => x.id === id); return o && isRestricted(o) ? geoText(o) : "" }}
                  footer={form.offers.some((x) => isRestricted(offers.find((o) => o.id === x.offer_id))) ? (
                    "Оффер с ограничением получает только клики из своих штатов, остальные клики делят другие офферы потока. Подходящего оффера нет — клик идёт в следующий поток."
                  ) : undefined}
                />
                <FormRow label="Выбор оффера" hint="«До клика»: оффер известен уже на лендинге, можно подставлять его данные в текст. «После клика»: выбирается при переходе.">
                  <RadioGroup value={form.offer_selection} onValueChange={(v) => set("offer_selection", v as Stream["offer_selection"])} className="flex gap-4">
                    <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="before_click" />До клика</Label>
                    <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="after_click" />После клика</Label>
                  </RadioGroup>
                </FormRow>
              </>
            )}

            {form.schema === "redirect" && (
              <>
                <FormRow label="Тип редиректа" hint={STREAM_ACTIONS.find((a) => a.key === form.action_type)?.description}>
                  <Select value={form.action_type} onValueChange={(v) => set("action_type", v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{STREAM_ACTIONS.filter((a) => a.kind === "redirect").map((a) => <SelectItem key={a.key} value={a.key}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </FormRow>
                <FormRow label="URL" hint="Макросы: {subid}, {external_id}, {sub_id_1}…{sub_id_30}, {country}">
                  <Input value={form.action_payload} onChange={(e) => set("action_payload", e.target.value)} placeholder="https://" />
                </FormRow>
              </>
            )}

            {form.schema === "action" && (
              <>
                <FormRow label="Действие" hint={STREAM_ACTIONS.find((a) => a.key === form.action_type)?.description}>
                  <Select value={form.action_type} onValueChange={(v) => set("action_type", v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Выберите действие" /></SelectTrigger>
                    <SelectContent>{STREAM_ACTIONS.filter((a) => a.kind === "action").map((a) => <SelectItem key={a.key} value={a.key}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </FormRow>
                {STREAM_ACTIONS.find((a) => a.key === form.action_type)?.field === "campaign" && (
                  <FormRow label="Кампания">
                    <Select value={form.action_payload} onValueChange={(v) => set("action_payload", v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Выберите кампанию" /></SelectTrigger>
                      <SelectContent>{campaigns.filter((c) => c.id !== form.campaign_id).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormRow>
                )}
                {STREAM_ACTIONS.find((a) => a.key === form.action_type)?.field === "text" && (
                  <FormRow label="Текст или HTML">
                    <Textarea rows={6} className="font-mono text-xs" value={form.action_payload} onChange={(e) => set("action_payload", e.target.value)} />
                  </FormRow>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="filters">
            <FilterEditor
              filters={form.filters}
              onChange={(f) => set("filters", f)}
              filterOr={form.filter_or}
              onFilterOrChange={(v) => set("filter_or", v)}
              readOnly={readOnly}
            />
          </TabsContent>

          <TabsContent value="notes">
            <Textarea rows={8} value={form.comments} onChange={(e) => set("comments", e.target.value)} placeholder="Например: ставка 170$, капа 30 депов в день, менять вес только по согласованию" />
          </TabsContent>
        </fieldset>
      </Tabs>
    </EntitySheet>
  )
}

interface ShareItem { id: number; share: number; on: boolean }

// List of entities with percentage shares: add, toggle, remove, equalize; shows the sum.
function ShareList({ title, items, options, onChange, addLabel, empty, note, footer }: {
  title: string; items: ShareItem[]; options: { id: number; name: string }[]; onChange: (xs: ShareItem[]) => void; addLabel: string; empty: string
  note?: (id: number) => string; footer?: string
}) {
  const sum = items.filter((x) => x.on).reduce((a, x) => a + x.share, 0)
  const name = (id: number) => options.find((o) => o.id === id)?.name ?? `#${id}`
  const equalize = () => {
    const on = items.filter((x) => x.on).length
    if (!on) return
    const base = Math.floor(100 / on)
    let rest = 100 - base * on
    onChange(items.map((x) => (x.on ? { ...x, share: base + (rest-- > 0 ? 1 : 0) } : x)))
  }
  return (
    <div className="min-w-0 rounded-md border">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-2">
        <span className="text-sm font-medium">{title}</span>
        {items.length > 0 && (
          <span className={sum === 100 ? "text-xs text-muted-foreground" : "text-xs text-warning"}>
            сумма {sum}%{sum !== 100 && " — должно быть 100%"}
          </span>
        )}
        {items.length > 1 && <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={equalize}>Поровну</Button>}
      </div>
      {items.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">{empty}</p>}
      {items.map((x, i) => (
        <div key={i} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 border-b px-3 py-1.5 last:border-b-0">
          <Switch size="sm" checked={x.on} onCheckedChange={(v) => onChange(items.map((y, j) => (j === i ? { ...y, on: v } : y)))} aria-label="Включить" />
          <Select value={String(x.id)} onValueChange={(v) => onChange(items.map((y, j) => (j === i ? { ...y, id: Number(v) } : y)))}>
            <SelectTrigger className="w-0 min-w-0 flex-1"><SelectValue>{name(x.id)}</SelectValue></SelectTrigger>
            <SelectContent>{options.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex shrink-0 items-center gap-1">
            <Input type="number" min={0} max={100} className="num w-14 text-right sm:w-16" value={x.share} onChange={(e) => onChange(items.map((y, j) => (j === i ? { ...y, share: Number(e.target.value) } : y)))} aria-label="Доля, %" />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label="Убрать" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Icon icon={XIcon} size={14} />
          </Button>
          {note?.(x.id) && <span className="basis-full pl-10 text-xs text-muted-foreground">{note(x.id)}</span>}
        </div>
      ))}
      {footer && <p className="border-t px-3 py-2 text-xs text-muted-foreground">{footer}</p>}
      <div className="border-t px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!options.length}
          onClick={() => {
            const free = options.find((o) => !items.some((x) => x.id === o.id)) ?? options[0]
            onChange([...items, { id: free.id, share: items.length ? 0 : 100, on: true }])
          }}
        >
          <Icon icon={PlusIcon} size={14} /> {addLabel}
        </Button>
      </div>
    </div>
  )
}
