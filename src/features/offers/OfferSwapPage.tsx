// Mass offer replacement: pick the offer to replace and the new one, see every stream that changes, apply, undo.
// Scope = campaigns the user may change (offer_swap: full = all, groups = the team's campaigns).
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowRightIcon } from "lucide-react"
import type { Offer, OfferSwapRow, StreamOffer } from "@/api/types"
import { api } from "@/api/client"
import { useAccess, useCanSeeMoney, useUrlParam } from "@/app/state"
import { Page, PageHeader, Section } from "@/components/page"
import { FormRow } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { capClass, capText, geoText, isRestricted } from "./caps"
import type { OfferGroupCap } from "@/api/types"

// «капа 120 / 300 FTD · 40%» next to each offer in the pickers: the current cap of its group
function capShort(cap?: OfferGroupCap) {
  if (!cap) return "нет группы"
  if (cap.status === "no_term") return "нет условий"
  if (cap.status === "none") return "без капы"
  const top = [...cap.caps].sort((a, b) => b.done / b.value - a.done / a.value)[0]
  return cap.status === "full" ? `отлита · ${capText(top)}` : `${capText(top)} · ${Math.floor(cap.pct)}%`
}

const REMOVE = "remove"

export default function OfferSwapPage() {
  const qc = useQueryClient()
  const { canEdit, level } = useAccess("offer_swap")
  const money = useCanSeeMoney()
  const [from, setFrom] = useUrlParam("from")
  const [to, setTo] = useUrlParam("to")
  const [dropFilters, setDropFilters] = useState(true)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())

  const offers = useQuery({ queryKey: ["offers"], queryFn: api.offers.list })
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })
  const groups = useQuery({ queryKey: ["offerGroups", "caps"], queryFn: api.offerGroups.caps })
  const history = useQuery({ queryKey: ["offerSwap", "history"], queryFn: api.offerSwap.history })
  const users = useQuery({ queryKey: ["users"], queryFn: api.users.list })

  const fromOffer = offers.data?.find((o) => String(o.id) === from)
  const toOffer = offers.data?.find((o) => String(o.id) === to)
  const req = useMemo(
    () => (fromOffer && to && to !== from ? { from_offer_id: fromOffer.id, to_offer_id: to === REMOVE ? null : Number(to), drop_geo_filters: dropFilters } : null),
    [fromOffer, from, to, dropFilters],
  )
  // where the offer stands, shown as soon as it is picked (before the new offer is chosen)
  const usage = useQuery({
    queryKey: ["offerSwap", "usage", fromOffer?.id],
    queryFn: () => api.offerSwap.usage(fromOffer!.id),
    enabled: !!fromOffer,
  })
  const preview = useQuery({ queryKey: ["offerSwap", "preview", req], queryFn: () => api.offerSwap.preview(req!), enabled: !!req })
  const rows = preview.data ?? []
  const chosen = rows.filter((r) => !excluded.has(r.stream_id))
  const chosenCampaigns = new Set(chosen.map((r) => r.campaign_id)).size

  const offerName = (id: number | null) => (id == null ? "—" : offers.data?.find((o) => o.id === id)?.name ?? `#${id}`)
  const campaignName = (id: number) => campaigns.data?.find((c) => c.id === id)?.name ?? `#${id}`

  const undo = useMutation({
    mutationFn: (id: number) => api.offerSwap.undo(id),
    onSuccess: () => { qc.invalidateQueries(); toast.success("Замена отменена: потоки вернулись как были") },
    onError: (e: Error) => toast.error(e.message),
  })
  const apply = useMutation({
    mutationFn: () => api.offerSwap.apply({ ...req!, stream_ids: chosen.map((r) => r.stream_id) }),
    onSuccess: (res) => {
      qc.invalidateQueries()
      setExcluded(new Set())
      toast.success(`Готово: потоков ${res.streams}, кампаний ${res.campaigns}`, {
        action: { label: "Отменить", onClick: () => undo.mutate(res.id) },
        duration: 10000,
      })
    },
  })

  const capOfOffer = (o: Offer) => (o.group_id ? groups.data?.[o.group_id] : undefined)
  const picker = (value: string, onChange: (v: string) => void, opts: Offer[], placeholder: string, withRemove = false) => (
    <Select value={value} onValueChange={(v) => { onChange(v); setExcluded(new Set()) }}>
      <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {withRemove && <SelectItem value={REMOVE}>Убрать из потоков (доля уйдёт остальным офферам)</SelectItem>}
        {[...opts].sort((a, b) => Number(capOfOffer(a)?.status === "full") - Number(capOfOffer(b)?.status === "full")).map((o) => {
          const cap = capOfOffer(o)
          return (
            <SelectItem key={o.id} value={String(o.id)}>
              <span className="truncate">{o.name}</span>
              <span className={cn("ml-2 shrink-0 text-xs", cap ? capClass(cap.status) || "text-muted-foreground" : "text-muted-foreground")}>{capShort(cap)}</span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
  const live = (offers.data ?? []).filter((o) => o.state !== "deleted")
  const rate = (o?: Offer) => {
    if (!o || !money) return ""
    const r = groups.data?.[o.group_id ?? 0]?.term?.payouts[String(o.id)] ?? o.payout_value
    return ` · ${r} $`
  }
  const capNote = (o?: Offer) => {
    const c = groups.data?.[o?.group_id ?? 0]
    return c?.status === "full" ? " · капа отлита" : c?.status === "warn" ? " · капа почти заполнена" : ""
  }
  const usedStreams = usage.data?.streams ?? 0
  const usedCampaigns = usage.data?.campaigns ?? 0
  const geoFilterRows = rows.filter((r) => r.filters_before.length !== r.filters_after.length).length

  return (
    <Page>
      <PageHeader title="Замена оффера" />
      <Section>
        <div className="grid gap-x-8 px-3 py-2 lg:grid-cols-2">
          <div>
            <FormRow label="Что заменить" hint={fromOffer ? `${geoText(fromOffer)}${rate(fromOffer)}${capNote(fromOffer)}` : "Например, оффер, у которого отлилась капа"}>
              {picker(from, setFrom, live, "Выберите оффер")}
            </FormRow>
            <FormRow label="На что" hint={toOffer ? `${geoText(toOffer)}${rate(toOffer)}${capNote(toOffer)}` : to === REMOVE ? "Оффер уберётся, его доля разделится между остальными офферами потока" : undefined}>
              {picker(to, setTo, live.filter((o) => String(o.id) !== from), "Выберите новый оффер", true)}
            </FormRow>
          </div>
          <div>
            <FormRow label="Где">
              <span className="text-sm">
                {level === "groups" ? "В кампаниях вашей команды" : "Во всех кампаниях"}
                {fromOffer && <span className="text-muted-foreground"> · оффер стоит в <span className="num text-foreground">{usedStreams}</span> потоках, <span className="num text-foreground">{usedCampaigns}</span> кампаниях</span>}
              </span>
            </FormRow>
            {isRestricted(fromOffer) && (
              <FormRow label="Фильтр по штатам" hint="Если в потоке стоит фильтр только ради старого оффера (те же штаты), он больше не нужен">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={dropFilters} onCheckedChange={(v) => setDropFilters(!!v)} />
                  Убрать фильтр, который был нужен только старому офферу
                </label>
              </FormRow>
            )}
            {!canEdit && <p className="py-2 text-sm text-muted-foreground">Только просмотр: у вашей роли нет права менять офферы в кампаниях</p>}
          </div>
        </div>
      </Section>

      {req && (
        <Section
          title={<>Что изменится <span className="text-sm font-normal text-muted-foreground">· потоков {chosen.length} из {rows.length}, кампаний {chosenCampaigns}{geoFilterRows > 0 && `, фильтр по штатам уберётся в ${geoFilterRows}`}</span></>}
          actions={canEdit && rows.length > 0 && <Button disabled={!chosen.length || apply.isPending} onClick={() => apply.mutate()}>Заменить в {chosen.length} {plural(chosen.length)}</Button>}
        >
          {rows.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-muted-foreground">{preview.isLoading ? "Считаю…" : "Оффер не стоит ни в одном потоке ваших кампаний"}</p>
          ) : (
            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead className="text-left text-[13px] text-muted-foreground">
                  <tr className="border-b">
                    <th className="w-10 px-3 py-2">
                      <Checkbox
                        aria-label="Все потоки"
                        checked={excluded.size === 0 ? true : excluded.size === rows.length ? false : "indeterminate"}
                        onCheckedChange={(v) => setExcluded(v ? new Set() : new Set(rows.map((r) => r.stream_id)))}
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">Кампания</th>
                    <th className="px-3 py-2 font-medium">Поток</th>
                    <th className="px-3 py-2 font-medium">Было</th>
                    <th className="px-3 py-2 font-medium">Станет</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.stream_id} className={cn("border-b align-top", excluded.has(r.stream_id) && "text-muted-foreground")}>
                      <td className="px-3 py-2">
                        <Checkbox
                          aria-label={`Поток ${r.stream_name}`}
                          checked={!excluded.has(r.stream_id)}
                          onCheckedChange={(v) => setExcluded((s) => { const n = new Set(s); if (v) n.delete(r.stream_id); else n.add(r.stream_id); return n })}
                        />
                      </td>
                      <td className="px-3 py-2"><a href={`#/campaigns/${r.campaign_id}`} className="text-link">{campaignName(r.campaign_id)}</a></td>
                      <td className="px-3 py-2">{r.stream_name}</td>
                      <td className="px-3 py-2"><OfferList items={r.before} name={offerName} mark={fromOffer?.id} filters={regionFilter(r, "before")} /></td>
                      <td className="px-3 py-2"><OfferList items={r.after} name={offerName} mark={toOffer?.id} filters={regionFilter(r, "after")} empty="Офферов не останется: поток перестанет отправлять на оффер" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <Section title="Последние замены">
        {(history.data ?? []).length === 0 ? (
          <p className="px-3 pb-3 text-sm text-muted-foreground">Замен ещё не было</p>
        ) : (
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm">
              <thead className="text-left text-[13px] text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Когда</th>
                  <th className="px-3 py-2 font-medium">Кто</th>
                  <th className="px-3 py-2 font-medium">Замена</th>
                  <th className="px-3 py-2 text-right font-medium">Потоков</th>
                  <th className="px-3 py-2 text-right font-medium">Кампаний</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {history.data!.map((h) => (
                  <tr key={h.id} className="border-b">
                    <td className="num px-3 py-2 whitespace-nowrap">{new Date(h.datetime).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-3 py-2">{users.data?.find((u) => u.id === h.user_id)?.login ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {offerName(h.from_offer_id)} <Icon icon={ArrowRightIcon} size={12} className="text-muted-foreground" /> {h.to_offer_id ? offerName(h.to_offer_id) : <span className="text-muted-foreground">убран</span>}
                      </span>
                    </td>
                    <td className="num px-3 py-2 text-right">{h.streams}</td>
                    <td className="num px-3 py-2 text-right">{h.campaigns}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {h.undone ? <span className="text-muted-foreground">отменена</span> : h.can_undo && canEdit && (
                        <Button variant="outline" size="sm" disabled={undo.isPending} onClick={() => undo.mutate(h.id)}>Отменить</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </Page>
  )
}

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "потоке" : "потоках")

function regionFilter(r: OfferSwapRow, side: "before" | "after") {
  const f = (side === "before" ? r.filters_before : r.filters_after).find((x) => x.name === "region")
  return f ? `Фильтр: ${f.mode === "accept" ? "" : "кроме "}${f.payload.join(", ")}` : side === "after" && r.filters_before.some((x) => x.name === "region") ? "Фильтр по штатам убран" : ""
}

function OfferList({ items, name, mark, filters, empty }: { items: StreamOffer[]; name: (id: number) => string; mark?: number; filters: string; empty?: string }) {
  if (!items.length) return <span className="text-warning">{empty}</span>
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((x) => (
        <span key={x.offer_id} className={cn("flex gap-2", x.offer_id === mark && "font-medium text-foreground", x.state !== "active" && "text-muted-foreground")}>
          <span className="num w-10 shrink-0 text-right text-muted-foreground">{x.share}%</span>
          <span className="min-w-0">{name(x.offer_id)}</span>
        </span>
      ))}
      {filters && <span className="pl-12 text-xs text-muted-foreground">{filters}</span>}
    </div>
  )
}
