// Click side sheet: all fields (names with links instead of ids), click path (why the click went to this stream), conversions.
import { useState } from "react"
import { Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { CheckIcon, XIcon } from "lucide-react"
import type { Click, Conversion } from "@/api/types"
import { api } from "@/api/client"
import { statsApi, type Names, type PathCheck } from "@/api/client-stats"
import { useApp, useCanSeeMoney, useHiddenMetrics } from "@/app/state"
import { CopyButton, EntitySheet } from "@/components/common"
import { Icon } from "@/components/icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/dates"
import { fmtMoney } from "@/lib/format"
import { ConversionStatusCell, EntityLink, reportLink, useNames, type EntityKind } from "./shared"

export const DEVICE: Record<string, string> = { mobile: "Телефон", desktop: "Компьютер", tablet: "Планшет" }

export const FIELD_LABELS: [keyof Click, string][] = [
  ["datetime", "Время клика"], ["sub_id", "Subid"], ["campaign_id", "Кампания"], ["stream_id", "Поток"], ["landing_id", "Лендинг"],
  ["offer_id", "Оффер"], ["ts_id", "Источник"], ["buyer_id", "Байер"], ["ip", "IP"], ["country", "Страна"], ["region", "Регион"], ["city", "Город"],
  ["os", "ОС"], ["browser", "Браузер"], ["device_type", "Устройство"], ["device_model", "Модель устройства"],
  ["connection_type", "Подключение"], ["is_bot", "Бот"], ["is_unique_campaign", "Уникальный (кампания)"], ["is_unique_stream", "Уникальный (поток)"],
  ["lp_clicked", "Клик по лендингу"], ["cost", "Расход"], ["external_id", "External ID"],
  ["sub_id_1", "sub_id_1 · Кабинет"], ["sub_id_2", "sub_id_2 · Плейсмент"], ["sub_id_3", "sub_id_3 · ID группы"],
  ["sub_id_4", "sub_id_4 · Группа"], ["sub_id_5", "sub_id_5 · Пиксель"], ["sub_id_6", "sub_id_6 · ID объявления"],
]

// Plain text of a click field (sheet and CSV): ids are resolved to names.
export function fieldText(k: keyof Click, c: Click, nm: Names | undefined, tz: string): string {
  const v = c[k]
  if (v == null || v === "") return ""
  switch (k) {
    case "datetime": return formatDateTime(String(v), tz)
    case "campaign_id": return nm?.campaigns[v as number] ?? String(v)
    case "stream_id": return nm?.streams[v as number] ?? String(v)
    case "landing_id": return nm?.landings[v as number] ?? String(v)
    case "offer_id": return nm?.offers[v as number] ?? String(v)
    case "ts_id": return nm?.sources[v as number] ?? String(v)
    case "buyer_id": return nm?.buyers[v as number] ?? String(v)
    case "device_type": return DEVICE[String(v)] ?? String(v)
    case "cost": return fmtMoney(v as number)
    default: return typeof v === "boolean" ? (v ? "Да" : "Нет") : String(v)
  }
}

const LINK_KIND: Partial<Record<keyof Click, EntityKind>> = {
  campaign_id: "campaign", stream_id: "stream", landing_id: "landing", offer_id: "offer", ts_id: "source", buyer_id: "buyer",
}

export function ClickSheet({ subId, onClose }: { subId: string; onClose: () => void }) {
  const { timezone } = useApp()
  const money = useCanSeeMoney()
  const hiddenMetrics = useHiddenMetrics()
  const names = useNames()
  const click = useQuery({ queryKey: ["clicks", "one", subId], queryFn: () => api.clicks.get(subId), enabled: !!subId })
  const convs = useQuery({
    queryKey: ["conversions", "by-click", subId],
    queryFn: () => api.conversions.log({ range: { interval: "all_time", timezone }, search: subId, limit: 50, offset: 0 }),
    enabled: !!subId,
  })
  const c = click.data
  const nm = names.data
  const fields = FIELD_LABELS.filter(([k]) => !(k === "cost" && hiddenMetrics.includes("cost")))
  return (
    <EntitySheet open={!!subId} onOpenChange={(v) => !v && onClose()} title={`Клик ${subId}`} description="Все поля клика, путь и конверсии" wide>
      {click.isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : !c ? (
        <p className="text-sm text-muted-foreground">Клик не найден</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Trace click={c} />
          <ClickPath subId={c.sub_id} />

          <section>
            <h3 className="mb-1 text-sm font-semibold">Данные клика</h3>
            <dl className="grid grid-cols-[minmax(7rem,10rem)_1fr] gap-x-3 gap-y-1 text-sm">
              {fields.map(([k, label]) => {
                const kind = LINK_KIND[k]
                return (
                  <div key={k} className="col-span-2 grid grid-cols-subgrid border-b py-1 last:border-b-0">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 break-words">
                      {kind && c[k] != null ? (
                        <EntityLink kind={kind} id={c[k] as number} parent={c.campaign_id} name={fieldText(k, c, nm, timezone)} />
                      ) : (
                        fieldText(k, c, nm, timezone) || "—"
                      )}
                      {k === "sub_id" && <span className="ml-2 inline-block align-middle"><CopyButton value={c.sub_id} /></span>}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Конверсии ({convs.data?.total ?? 0})</h3>
            {convs.isLoading ? (
              <p className="text-sm text-muted-foreground">Загрузка…</p>
            ) : !convs.data?.rows.length ? (
              <p className="text-sm text-muted-foreground">По этому клику конверсий не было</p>
            ) : (
              <div className="overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="text-[13px] text-muted-foreground">
                    <tr>
                      <th className="h-9 px-2 text-left font-medium">Время постбека</th>
                      <th className="h-9 px-2 text-left font-medium">Статус</th>
                      <th className="h-9 px-2 text-left font-medium">Исходный статус</th>
                      {money && <th className="h-9 px-2 text-right font-medium">Выплата</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {convs.data.rows.map((v: Conversion) => (
                      <tr key={v.conversion_id} className="border-t">
                        <td className="h-9 px-2 whitespace-nowrap">
                          <Link to={`/conversions?conv=${v.conversion_id}&period=all_time`} className="text-link">
                            {formatDateTime(v.postback_datetime, timezone)}
                          </Link>
                        </td>
                        <td className="h-9 px-2"><ConversionStatusCell status={v.status} /></td>
                        <td className="h-9 px-2 text-muted-foreground">{v.original_status}</td>
                        {money && <td className="num h-9 px-2 text-right">{fmtMoney(v.revenue)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <Button variant="outline" asChild className="self-start">
            <Link to={reportLink({ g: ["day"], filters: [{ name: "sub_id_6", operator: "EQUALS", expression: c.sub_id_6 }], range: { interval: "all_time", timezone } })}>
              Отчёт по объявлению {c.sub_id_6}
            </Link>
          </Button>
        </div>
      )}
    </EntitySheet>
  )
}

// ---------- trace: FB ad → click → conversions → outgoing postbacks ----------

// The whole way of one visitor in one place: which ad sent it (from the FB collector, matched by ad id),
// what the partner answered and whether the deposit reached the pixel / SKAK.
function Trace({ click }: { click: Click }) {
  const { timezone } = useApp()
  const fb = useQuery({ queryKey: ["fb", "chain", click.sub_id_6], queryFn: () => api.fb.chain(click.sub_id_6), enabled: !!click.sub_id_6 })
  const pb = useQuery({ queryKey: ["postbacks", "by-click", click.sub_id], queryFn: () => api.postbacks.log({ search: click.sub_id, limit: 20, offset: 0 }) })
  const chain = fb.data
  const named = chain?.campaign ? Number(/^(\d+) \|/.exec(chain.campaign.name)?.[1] ?? NaN) : NaN
  const rows: [string, React.ReactNode][] = !click.sub_id_6
    ? [["Объявление FB", <span key="x" className="text-warning">Клик пришёл без ID объявления: метки FB не дошли, расход к нему не привязать</span>]]
    : !chain
      ? [["Объявление FB", <span key="x" className="text-muted-foreground">{fb.isLoading ? "Загрузка…" : `ID ${click.sub_id_6}: сборщик расходов не знает такого объявления`}</span>]]
      : [
          ["Кабинет", chain.account ? `${chain.account.name} · ${chain.account.id} · ${chain.account.agency}` : click.sub_id_1],
          ["Кампания FB", (
            <span key="c">
              {chain.campaign?.name ?? "—"}
              {Number.isNaN(named)
                ? <span className="block text-xs text-warning">В названии нет ID кампании трекера</span>
                : named !== click.campaign_id && <span className="block text-xs text-destructive">В названии ID {named}, а клик пришёл в кампанию {click.campaign_id}</span>}
            </span>
          )],
          ["Группа объявлений", chain.adset?.name ?? "—"],
          ["Объявление", <span key="a">{chain.ad.name} <span className="font-mono text-muted-foreground">{chain.ad.id}</span></span>],
        ]
  const out = (pb.data?.rows ?? []).filter((p) => p.direction === "out")
  const inc = (pb.data?.rows ?? []).filter((p) => p.direction === "in")
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">Откуда пришёл и куда ушёл</h3>
      <dl className="grid grid-cols-[minmax(7rem,10rem)_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="col-span-2 grid grid-cols-subgrid border-b py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
        <div className="col-span-2 grid grid-cols-subgrid border-b py-1">
          <dt className="text-muted-foreground">Постбеки партнёрки</dt>
          <dd className="min-w-0">{inc.length ? inc.map((p) => <div key={p.id}>{formatDateTime(p.datetime, timezone)} · {p.status} · {p.result === "ok" ? "принят" : <span className="text-destructive">{p.message || p.result}</span>}</div>) : <span className="text-muted-foreground">нет</span>}</dd>
        </div>
        <div className="col-span-2 grid grid-cols-subgrid py-1">
          <dt className="text-muted-foreground">Отправлено дальше</dt>
          <dd className="min-w-0">
            {out.length
              ? out.map((p) => <div key={p.id}>{formatDateTime(p.datetime, timezone)} · {p.status} → пиксель · {p.result === "ok" ? <span className="text-success">доставлен</span> : <span className="text-destructive">{p.message || `HTTP ${p.http_code}`} (попыток: {p.attempts})</span>}</div>)
              : <span className="text-muted-foreground">нет</span>}
            {out.length > 0 && <Link to="/postbacks?tab=out" className="text-link">Лог исходящих</Link>}
          </dd>
        </div>
      </dl>
    </section>
  )
}

// ---------- click path ----------

const STREAM_TYPE: Record<string, string> = { forced: "Перехватывающий", regular: "Обычный", default: "Замыкающий" }

function checkText(c: PathCheck) {
  return `${c.filter} ${c.mode === "accept" ? "=" : "≠"} ${c.payload.join(", ")}`
}

function Mark({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="w-3 shrink-0 text-center text-muted-foreground">·</span>
  return <Icon icon={ok ? CheckIcon : XIcon} size={12} className={ok ? "text-success" : "text-destructive"} />
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <li className="relative border-l pb-3 pl-4 last:border-l-transparent last:pb-0">
      <span className="num absolute -left-2.5 flex size-5 items-center justify-center rounded-md border bg-background text-[11px] text-muted-foreground">{n}</span>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </li>
  )
}

// Mock trace: campaign → streams checked in order with filter results → chosen stream → landing → offer.
function ClickPath({ subId }: { subId: string }) {
  const [all, setAll] = useState(false)
  const path = useQuery({ queryKey: ["clicks", "path", subId], queryFn: () => statsApi.clickPath(subId) })
  const p = path.data
  if (path.isLoading) return <p className="text-sm text-muted-foreground">Путь клика: загрузка…</p>
  if (!p) return null
  const visible = all ? p.steps : p.steps.filter((s) => s.type === "forced" || s.chosen)
  const hidden = p.steps.length - visible.length
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">Путь клика</h3>
      <ol className="ml-2.5 text-sm">
        <Step n={1} label="Кампания">
          <EntityLink kind="campaign" id={p.campaign?.id} name={p.campaign?.name} />
        </Step>
        <Step n={2} label={`Проверка потоков (${p.steps.length}): порядок — перехватывающие, обычные, замыкающий`}>
          <ul className="flex flex-col gap-1">
            {visible.map((s) => (
              <li key={s.stream_id} className={`rounded-md border px-2 py-1 ${s.chosen ? "border-primary/60 bg-accent" : ""}`}>
                <div className="flex items-center gap-1.5">
                  <Mark ok={s.passed} />
                  <span className="min-w-0 flex-1 truncate" title={s.name}>{s.name}</span>
                  <Badge variant="outline">{STREAM_TYPE[s.type]}</Badge>
                </div>
                <div className="mt-0.5 flex flex-col gap-0.5 pl-[1.125rem] text-muted-foreground">
                  {s.checks.length === 0 && <span>без фильтров</span>}
                  {s.checks.map((c, i) => (
                    <span key={i} className="flex items-center gap-1.5"><Mark ok={c.ok} />{checkText(c)}</span>
                  ))}
                  {s.passed && !s.chosen && <span>подходит, выбран другой поток</span>}
                </div>
              </li>
            ))}
          </ul>
          {(hidden > 0 || all) && (
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => setAll(!all)}>
              {all ? "Свернуть" : `Показать остальные потоки (${hidden})`}
            </Button>
          )}
        </Step>
        <Step n={3} label="Выбранный поток">
          <EntityLink kind="stream" id={p.stream?.id} parent={p.stream?.campaign_id} name={p.stream?.name} />
        </Step>
        <Step n={4} label="Лендинг">
          <EntityLink kind="landing" id={p.landing?.id} name={p.landing?.name} />
        </Step>
        <Step n={5} label="Оффер">
          <div className="flex flex-wrap items-center gap-x-2">
            <EntityLink kind="offer" id={p.offer?.id} name={p.offer?.name} />
            {p.offer?.network && <>
              <span className="text-muted-foreground">партнёрка</span>
              <EntityLink kind="network" id={p.offer.network.id} name={p.offer.network.name} />
            </>}
          </div>
        </Step>
      </ol>
    </section>
  )
}
