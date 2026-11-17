// Human-readable summaries of streams and filters: «Страна = США», «Бот ≠ да».
import type { Stream, StreamFilter } from "@/api/types"
import { streamFilterDef } from "@/api/meta"

export function filterText(f: StreamFilter): string {
  const def = streamFilterDef(f.name)
  const name = def?.name ?? f.name
  const op = f.mode === "accept" ? "=" : "≠"
  if (def?.input === "boolean") return `${name} ${op} да`
  const labels = f.payload.map((v) => def?.options?.find((o) => o.value === v)?.label ?? v)
  if (def?.input === "limit") return `${name}: ${labels.join(" / ")}`
  if (def?.input === "date_range") return `${name}: ${labels.join(" — ")}`
  const shown = labels.slice(0, 3).join(", ") + (labels.length > 3 ? ` и ещё ${labels.length - 3}` : "")
  return `${name} ${op} ${shown || "—"}`
}

// Problems shown next to a stream before the user saves or launches traffic.
export function streamProblems(s: Stream): string[] {
  const p: string[] = []
  if (s.schema === "landings") {
    if (!s.offers.length) p.push("Не выбран оффер")
    const ls = s.landings.filter((l) => l.state === "active").reduce((a, l) => a + l.share, 0)
    const os = s.offers.filter((o) => o.state === "active").reduce((a, o) => a + o.share, 0)
    if (s.landings.length && ls !== 100) p.push(`Сумма долей лендингов ${ls}%`)
    if (s.offers.length && os !== 100) p.push(`Сумма долей офферов ${os}%`)
  }
  if (s.schema === "redirect" && !s.action_payload) p.push("Не указан URL")
  if (s.schema === "action" && !s.action_type) p.push("Не выбрано действие")
  if (s.schema === "action" && s.action_type === "campaign" && !s.action_payload) p.push("Не выбрана кампания, куда отправлять трафик")
  if ([...s.landings, ...s.offers].some((x) => x.share < 0)) p.push("Доля не может быть отрицательной")
  return p
}
