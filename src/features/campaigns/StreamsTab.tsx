// The split: streams of a campaign grouped by type, inline weights with live share %, stats in the same row.
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ChevronDownIcon, EllipsisIcon, PlusIcon, TriangleAlertIcon } from "lucide-react"
import type { Campaign, DateRange, Stream, StreamType } from "@/api/types"
import { api } from "@/api/client"
import { useHiddenMetrics, useUrlParam } from "@/app/state"
import { metricDef } from "@/api/meta"
import { fmtMetric, fmtPercent, signClass } from "@/lib/format"
import { cn } from "@/lib/utils"
import { RefreshButton } from "@/components/page"
import { Icon } from "@/components/icon"
import { ConfirmDialog, SearchInput, StateDot } from "@/components/common"
import { PeriodSelect } from "@/components/period-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StreamSheet, newStream } from "./StreamSheet"
import { CheckClickDialog } from "./CheckClickDialog"
import { streamProblems } from "./stream-text"

// Same short set as Keitaro's stream list; full numbers are one click away in «Отчёт по потоку».
const METRICS = ["clicks", "leads", "sales", "cost", "roi_confirmed"]
// Unsaved weights survive tab switches inside the campaign page (kept per campaign until saved or reset).
const weightDrafts = new Map<number, Record<number, number>>()
// Used by the campaign page's single «leave without saving?» guard (react-router allows one blocker).
export const hasWeightDraft = (campaignId: number) => weightDrafts.has(campaignId)
export const dropWeightDraft = (campaignId: number) => { weightDrafts.delete(campaignId) }

const GROUPS: { type: StreamType; title: string; hint: string }[] = [
  { type: "forced", title: "Перехватывающие", hint: "Проверяются первыми, вне весов" },
  { type: "regular", title: "Обычные", hint: "Делят трафик по весу" },
  { type: "default", title: "Замыкающий", hint: "Если ни один поток не подошёл" },
]

export function StreamsTab({
  campaign, range, setRange, canEdit,
}: { campaign: Campaign; range: DateRange; setRange: (r: Pick<DateRange, "interval" | "from" | "to">) => void; canEdit: boolean }) {
  const qc = useQueryClient()
  const nav = useNavigate()
  const hidden = useHiddenMetrics()
  const metrics = METRICS.filter((m) => !hidden.includes(m))
  const [openId, setOpenId] = useUrlParam("stream") // id | "new"
  const [q, setQ] = useUrlParam("sq")
  const [onlyLive, setOnlyLive] = useUrlParam("live")
  const [draft, setDraftState] = useState<Record<number, number>>(() => weightDrafts.get(campaign.id) ?? {}) // unsaved weights
  const setDraft = (fn: Record<number, number> | ((d: Record<number, number>) => Record<number, number>)) =>
    setDraftState((d) => {
      const next = typeof fn === "function" ? fn(d) : fn
      if (Object.keys(next).length) weightDrafts.set(campaign.id, next)
      else weightDrafts.delete(campaign.id)
      return next
    })
  const [zeroConfirm, setZeroConfirm] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [toArchive, setToArchive] = useState<Stream[] | null>(null)
  const [newDraft, setNewDraft] = useState<Stream | null>(null)
  const [checkOpen, setCheckOpen] = useState(false)

  const streams = useQuery({ queryKey: ["streams", campaign.id], queryFn: () => api.streams.byCampaign(campaign.id) })
  const stats = useQuery({ queryKey: ["stats", "streams", range], queryFn: () => api.streams.stats(range) })
  const landings = useQuery({ queryKey: ["landings"], queryFn: api.landings.list })
  const offers = useQuery({ queryKey: ["offers"], queryFn: api.offers.list })
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  const oMap = useMemo(() => new Map((offers.data ?? []).map((o) => [o.id, o])), [offers.data])

  const all = streams.data ?? []
  const weightOf = (s: Stream) => draft[s.id] ?? s.weight
  const live = all.filter((s) => s.type === "regular" && s.state === "active")
  const weightSum = live.reduce((a, s) => a + weightOf(s), 0)
  const dirty = Object.entries(draft).filter(([id, w]) => all.find((s) => s.id === Number(id))?.weight !== w)
  // Leaving the campaign with unsaved weights asks first: the guard lives in CampaignPage (tab switches keep the draft).
  useEffect(() => {
    if (!dirty.length) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", h)
    return () => window.removeEventListener("beforeunload", h)
  }, [dirty.length])
  // Share of traffic per affiliate network = sum of stream shares by the network of their offer.
  const split = useMemo(() => {
    if (!weightSum) return []
    const m = new Map<string, number>()
    for (const s of live) {
      const o = oMap.get(s.offers[0]?.offer_id ?? 0)
      const net = o?.name.split(" | ")[2] ?? "без оффера"
      m.set(net, (m.get(net) ?? 0) + weightOf(s))
    }
    return [...m].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).map(([n, w]) => [n, (w / weightSum) * 100] as const)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, oMap, weightSum, draft])
  const visible = all.filter(
    (s) =>
      (!q || s.name.toLowerCase().includes(q.toLowerCase()) || String(s.id) === q) &&
      (!onlyLive || (s.state === "active" && (s.type !== "regular" || weightOf(s) > 0))),
  )

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["streams"] }); qc.invalidateQueries({ queryKey: ["archive"] }) }
  const saveWeights = useMutation({
    mutationFn: () => api.streams.setWeights(dirty.map(([id, w]) => ({ id: Number(id), weight: w }))),
    onSuccess: () => { invalidate(); setDraft({}); toast.success("Веса сохранены") },
  })
  const saveStream = useMutation({
    mutationFn: (s: Stream) => (s.id ? api.streams.update(s.id, s) : api.streams.create({ ...s, id: undefined } as unknown as Omit<Stream, "id">)),
    onSuccess: (_, s) => { invalidate(); setOpenId(""); setNewDraft(null); toast.success(s.id ? "Поток сохранён" : "Поток создан") },
  })
  const patch = useMutation({
    mutationFn: async ({ ids, p }: { ids: number[]; p: Partial<Stream> }) => { for (const id of ids) await api.streams.update(id, p) },
    onSuccess: invalidate,
  })
  const archive = useMutation({
    mutationFn: async (ids: number[]) => { for (const id of ids) await api.streams.remove(id) },
    onSuccess: () => { invalidate(); setSelected(new Set()); toast.success("Перемещено в архив") },
  })
  const move = useMutation({
    mutationFn: (ids: number[]) => api.streams.reorder(campaign.id, ids),
    onSuccess: invalidate,
  })

  // Equal weights that sum to exactly 100: the remainder goes to the first streams.
  const equalize = (ids: number[]) => {
    let target = ids.length ? live.filter((s) => ids.includes(s.id)) : live.filter((s) => weightOf(s) > 0)
    if (!target.length) target = live
    if (!target.length) return
    const base = Math.floor(100 / target.length)
    let rest = 100 - base * target.length
    setDraft((d) => ({ ...d, ...Object.fromEntries(target.map((s) => [s.id, base + (rest-- > 0 ? 1 : 0)])) }))
    toast(`Веса уравнены: ${target.length} потоков, сумма 100. Нажмите «Сохранить веса»`)
  }
  const moveBy = (s: Stream, delta: number) => {
    const same = all.filter((x) => x.type === s.type)
    const i = same.findIndex((x) => x.id === s.id)
    const j = i + delta
    if (j < 0 || j >= same.length) return
    const ids = same.map((x) => x.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    const others = all.filter((x) => x.type !== s.type).map((x) => x.id)
    move.mutate([...others, ...ids])
  }
  const toggleSel = (id: number) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const opened: Stream | null =
    openId === "new" ? newDraft ?? newStream(campaign.id, all.length + 1) : all.find((s) => String(s.id) === openId) ?? null
  const sel = [...selected]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button><Icon icon={PlusIcon} size={14} /> Создать поток <Icon icon={ChevronDownIcon} size={12} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              <DropdownMenuItem onClick={() => { setNewDraft(null); setOpenId("new") }}>Обычный поток</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setNewDraft({ ...newStream(campaign.id, all.length + 1), type: "forced", schema: "action", action_type: "status404", name: "Боты → 404", filters: [{ name: "bot", mode: "accept", payload: ["1"] }] }); setOpenId("new") }}>
                Перехват ботов (404)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setNewDraft({ ...newStream(campaign.id, all.length + 1), type: "default", schema: "redirect", name: "Остальной трафик" }); setOpenId("new") }}>
                Замыкающий поток
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {canEdit && <Button variant="outline" onClick={() => equalize(sel)} disabled={!live.length}>Уравнять{sel.length ? ` (${sel.length})` : ""}</Button>}
        <Button variant="outline" onClick={() => setCheckOpen(true)} disabled={!all.length}>Проверить клик</Button>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && sel.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Выбрано: {sel.length} <Icon icon={ChevronDownIcon} size={12} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem onClick={() => patch.mutate({ ids: sel, p: { state: "active" } })}>Включить</DropdownMenuItem>
                <DropdownMenuItem onClick={() => patch.mutate({ ids: sel, p: { state: "disabled" } })}>Выключить</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDraft((d) => ({ ...d, ...Object.fromEntries(sel.map((id) => [id, 0])) }))}>Вес 0</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelected(new Set())}>Снять выбор</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setToArchive(all.filter((s) => selected.has(s.id)))}>В архив</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <PeriodSelect value={range} onChange={setRange} />
          <RefreshButton />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SearchInput value={q} onChange={setQ} placeholder="Поток или ID" className="sm:w-48" />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch size="sm" checked={!!onlyLive} onCheckedChange={(v) => setOnlyLive(v ? "1" : "")} /> Только с трафиком
        </label>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && dirty.length > 0 && (
            // Same toolbar row, so typing a weight never moves the table. On phones the pair sticks to the bottom edge instead.
            <div className="flex items-center gap-2 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-20 max-sm:border-t max-sm:bg-background max-sm:px-4 max-sm:py-2">
              <span className="text-xs text-muted-foreground max-sm:mr-auto">изменено: {dirty.length}</span>
              <Button variant="outline" onClick={() => setDraft({})}>Отменить</Button>
              <Button onClick={() => (weightSum === 0 && live.length ? setZeroConfirm(true) : saveWeights.mutate())} disabled={saveWeights.isPending}>Сохранить веса</Button>
            </div>
          )}
        </div>
      </div>

      {split.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-muted-foreground">Сплит по партнёркам:</span>
            {split.map(([n, p]) => (
              <span key={n} className="num"><span className="text-foreground">{n}</span> <span className="text-muted-foreground">{fmtPercent(p)}</span></span>
            ))}
        </div>
      )}

      <CheckClickDialog open={checkOpen} onOpenChange={setCheckOpen} streams={all} weightOf={weightOf} />

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-separate border-spacing-0 text-sm [&_td]:border-b [&_th]:border-b">
          <thead className="text-[13px] text-muted-foreground">
            <tr>
              {canEdit && <th className="hidden w-8 px-2 sm:table-cell" />}
              <th className="h-9 px-2.5 text-left font-medium">Поток</th>
              <th className="px-2 text-right font-medium">Вес</th>
              <th className="px-2 text-right font-medium whitespace-nowrap">
                <Tooltip>
                  <TooltipTrigger asChild><span>Доля</span></TooltipTrigger>
                  <TooltipContent>Доля трафика по весам. Сколько пришло на деле — в колонке «Клики».</TooltipContent>
                </Tooltip>
              </th>
              {metrics.map((m) => (
                <th key={m} className="px-2 text-right font-medium whitespace-nowrap">{metricDef(m)?.short ?? metricDef(m)?.name}</th>
              ))}
              <th className="w-9" />
            </tr>
          </thead>
          {GROUPS.map((g) => {
            const rows = visible.filter((s) => s.type === g.type)
            if (!rows.length) return null
            return (
              <tbody key={g.type}>
                <tr>
                  <td colSpan={metrics.length + (canEdit ? 5 : 4)} className="h-8 bg-muted px-2.5 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{g.title}</span> · {g.hint}
                  </td>
                </tr>
                {rows.map((s) => {
                  const st = stats.data?.[s.id]
                  const w = weightOf(s)
                  const share = s.type === "regular" && s.state === "active" && weightSum ? (w / weightSum) * 100 : null
                  const problems = streamProblems(s)
                  const changed = draft[s.id] !== undefined && draft[s.id] !== s.weight
                  return (
                    <tr key={s.id} className={cn("h-9 bg-background align-middle", s.state !== "active" && "text-muted-foreground")}>
                      {canEdit && (
                        <td className="hidden px-2 sm:table-cell">
                          <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSel(s.id)} aria-label="Выбрать поток" />
                        </td>
                      )}
                      <td className="w-full max-w-0 min-w-[180px] px-2.5">
                        <button type="button" className="flex w-full min-w-0 items-center gap-2 text-left" onClick={() => setOpenId(String(s.id))} title={`${s.name} · #${s.id}`}>
                          <StateDot state={s.state} />
                          <span className="truncate text-foreground">{s.name}</span>
                          {problems.length > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild><span className="text-warning"><Icon icon={TriangleAlertIcon} size={14} /></span></TooltipTrigger>
                              <TooltipContent>{problems.join(" · ")}</TooltipContent>
                            </Tooltip>
                          )}
                        </button>
                      </td>
                      <td className="px-2 text-right">
                        {s.type === "regular" ? (
                          <Input
                            type="number"
                            min={0}
                            disabled={!canEdit}
                            aria-label="Вес"
                            className={cn("num ml-auto h-7 w-16 text-right", changed && "border-primary")}
                            value={w}
                            onChange={(e) => setDraft((d) => ({ ...d, [s.id]: Math.min(10000, Math.max(0, Math.round(Number(e.target.value) || 0))) }))}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="num px-2 text-right whitespace-nowrap">
                        <span className={cn(share == null && "text-muted-foreground")}>{share == null ? "—" : fmtPercent(share)}</span>
                      </td>
                      {metrics.map((m) => {
                        const v = st?.[m] ?? 0
                        return <td key={m} className={cn("num px-2 text-right whitespace-nowrap", signClass(m, v))}>{fmtMetric(m, v)}</td>
                      })}
                      <td className="px-1">
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="Действия"><Icon icon={EllipsisIcon} size={14} /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-44">
                              <DropdownMenuItem onClick={() => setOpenId(String(s.id))}>{canEdit ? "Изменить" : "Открыть"}</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => nav(`/reports?f_stream=${encodeURIComponent(s.name)}&g=landing,offer`)}>Отчёт по потоку</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => nav(`/clicks?c=${s.campaign_id}&f=${encodeURIComponent(JSON.stringify([{ name: "stream_id", operator: "EQUALS", expression: String(s.id) }]))}`)}>Лог кликов</DropdownMenuItem>
                              {canEdit && (
                                <>
                                  <DropdownMenuItem onClick={() => patch.mutate({ ids: [s.id], p: { state: s.state === "active" ? "disabled" : "active" } })}>
                                    {s.state === "active" ? "Выключить" : "Включить"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => moveBy(s, -1)}>Поднять выше</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => moveBy(s, 1)}>Опустить ниже</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setNewDraft({ ...structuredClone(s), id: 0, name: `${s.name} (копия)`, weight: 0 }); setOpenId("new") }}>
                                    Клонировать
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onClick={() => setToArchive([s])}>В архив</DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            )
          })}
          {!streams.isLoading && visible.length === 0 && (
            <tbody>
              <tr><td colSpan={metrics.length + 5} className="h-24 text-center text-muted-foreground">{all.length ? "Нет потоков по фильтру" : "В кампании пока нет потоков"}</td></tr>
            </tbody>
          )}
        </table>
      </div>

      <StreamSheet
        open={!!openId && !!opened}
        stream={opened}
        landings={landings.data ?? []}
        offers={offers.data ?? []}
        campaigns={campaigns.data ?? []}
        readOnly={!canEdit}
        onClose={() => { setOpenId(""); setNewDraft(null) }}
        onSave={(s) => saveStream.mutate(s)}
        saving={saveStream.isPending}
      />
      <ConfirmDialog
        open={zeroConfirm}
        onOpenChange={setZeroConfirm}
        title="У всех обычных потоков вес 0"
        description="Новый трафик не пойдёт ни в один обычный поток: он уйдёт в замыкающий поток, а если его нет — получит 404. Сохранить так?"
        confirmLabel="Сохранить с нулевыми весами"
        destructive
        onConfirm={() => { setZeroConfirm(false); saveWeights.mutate() }}
      />
      <ConfirmDialog
        open={!!toArchive}
        onOpenChange={(v) => !v && setToArchive(null)}
        title={`Переместить потоки в архив: ${toArchive?.length ?? 0}`}
        description="Трафик перестанет идти в эти потоки сразу. Восстановить можно в разделе «Архив»."
        confirmLabel="В архив"
        destructive
        onConfirm={() => { archive.mutate(toArchive!.map((s) => s.id)); setToArchive(null) }}
      />
    </div>
  )
}
