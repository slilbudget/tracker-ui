// Redirect type picker with a plain explanation: the same three types in streams, landings and offers.
import { useState } from "react"
import { STREAM_ACTIONS } from "@/api/meta"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export const REDIRECT_TYPES = STREAM_ACTIONS.filter((a) => a.kind === "redirect")

// Short summary for each type, for the comparison under the picker
const COMPARE: Record<string, [speed: string, bots: string, referrer: string]> = {
  http: ["самый быстрый", "пропускает", "видит домен трекера"],
  js: ["+0,2–0,5 с", "без JS не проходят", "видит домен трекера"],
  blank_referrer: ["+0,2–0,5 с", "без JS не проходят", "не видит ничего"],
}

export function RedirectSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  // an old record may hold a type that is no longer offered (meta, curl …): it shows as is until changed
  const known = REDIRECT_TYPES.some((a) => a.key === value)
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Выберите тип" /></SelectTrigger>
        <SelectContent>
          {!known && value && <SelectItem value={value} disabled>{value} — больше не используется</SelectItem>}
          {REDIRECT_TYPES.map((a) => <SelectItem key={a.key} value={a.key}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {REDIRECT_TYPES.find((a) => a.key === value)?.description ?? "Этот тип больше не поддерживается: выберите один из трёх."}{" "}
        <button type="button" className="text-link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Скрыть сравнение" : "Чем отличаются типы"}</button>
      </p>
      {open && (
        <ul className="flex flex-col gap-1 rounded-md border px-2.5 py-2 text-xs">
          {REDIRECT_TYPES.map((a) => (
            <li key={a.key}>
              <span className="font-medium text-foreground">{a.name}</span>
              <span className="text-muted-foreground"> — скорость: {COMPARE[a.key][0]}; боты: {COMPARE[a.key][1]}; партнёрка {COMPARE[a.key][2]}</span>
            </li>
          ))}
          <li className="pt-1 text-muted-foreground">Не уверены — берите HTTP. «Партнёрка видит» — что приходит ей в поле Referer: откуда пришёл посетитель.</li>
        </ul>
      )}
    </div>
  )
}
