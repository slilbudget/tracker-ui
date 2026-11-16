// Column settings of a log, like Keitaro's: every field the log has, by group, with search; the chosen ones in their
// order (drag or arrows). Remembered per user (here: localStorage; the API keeps it in user preferences).
import { useEffect, useState, type DragEvent } from "react"
import { ArrowDownIcon, ArrowUpIcon, Columns3Icon, GripVerticalIcon, XIcon } from "lucide-react"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export interface ColumnChoice { id: string; label: string; group: string }

const read = (k: string): string[] | null => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? "null")
    return Array.isArray(v) ? v : null
  } catch { return null }
}

// visible column ids in their order; unknown ids (a field removed later) are dropped
export function useColumnChoice(storageKey: string, all: ColumnChoice[], defaults: string[]) {
  const key = `trk.logcols.${storageKey}`
  const [ids, setIds] = useState<string[]>(() => read(key) ?? defaults)
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(ids)) } catch { /* private mode */ }
  }, [key, ids])
  const known = new Set(all.map((c) => c.id))
  return { visible: ids.filter((id) => known.has(id)), setVisible: setIds }
}

export function ColumnsButton({ all, value, defaults, onChange, fixed = [] }: {
  all: ColumnChoice[]
  value: string[]
  defaults: string[]
  onChange: (ids: string[]) => void
  fixed?: string[] // always shown (time, subid)
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Icon icon={Columns3Icon} className="text-muted-foreground" /> Колонки ({value.length})
      </Button>
      {open && <ColumnsDialog all={all} value={value} defaults={defaults} fixed={fixed} onClose={() => setOpen(false)} onApply={(v) => { onChange(v); setOpen(false) }} />}
    </>
  )
}

function ColumnsDialog({ all, value, defaults, fixed, onClose, onApply }: {
  all: ColumnChoice[]
  value: string[]
  defaults: string[]
  fixed: string[]
  onClose: () => void
  onApply: (ids: string[]) => void
}) {
  const [draft, setDraft] = useState(value)
  const [q, setQ] = useState("")
  const [drag, setDrag] = useState<number | null>(null)
  const label = (id: string) => all.find((c) => c.id === id)?.label ?? id
  const groups = [...new Set(all.map((c) => c.group))]
  const shown = all.filter((c) => (c.label + " " + c.id).toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (id: string, on: boolean) => setDraft((d) => (on ? [...d, id] : d.filter((x) => x !== id)))
  const move = (from: number, to: number) => setDraft((d) => {
    if (to < 0 || to >= d.length) return d
    const n = [...d]
    const [x] = n.splice(from, 1)
    n.splice(to, 0, x)
    return n
  })
  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault()
    if (drag != null && drag !== to) move(drag, to)
    setDrag(null)
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col sm:max-w-3xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Колонки</DialogTitle>
          <DialogDescription>Отметьте нужные поля слева, порядок задайте справа: перетащите строку или нажмите стрелки.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 sm:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск поля" aria-label="Поиск поля" />
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-1 max-sm:max-h-64">
              {groups.map((g) => {
                const items = shown.filter((c) => c.group === g)
                if (!items.length) return null
                return (
                  <div key={g} className="pb-1">
                    <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">{g}</div>
                    {items.map((c) => (
                      <Label key={c.id} className="h-8 gap-2 rounded-md px-1.5 text-sm font-normal">
                        <Checkbox checked={draft.includes(c.id) || fixed.includes(c.id)} disabled={fixed.includes(c.id)} onCheckedChange={(v) => toggle(c.id, !!v)} />
                        <span className="truncate">{c.label}</span>
                      </Label>
                    ))}
                  </div>
                )
              })}
              {!shown.length && <p className="p-2 text-xs text-muted-foreground">Ничего не найдено</p>}
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex h-9 items-center text-sm text-muted-foreground">
              Показываются: {fixed.length + draft.length}
              {fixed.length > 0 && <span className="ml-1">({fixed.map(label).join(", ")} — всегда)</span>}
            </div>
            <ol className="min-h-0 flex-1 overflow-y-auto rounded-md border p-1 max-sm:max-h-64">
              {draft.map((id, i) => (
                <li
                  key={id}
                  draggable
                  onDragStart={() => setDrag(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, i)}
                  onDragEnd={() => setDrag(null)}
                  className={cn("flex h-8 items-center gap-1 rounded-md pr-0.5 pl-1 text-sm", drag === i && "opacity-50")}
                >
                  <Icon icon={GripVerticalIcon} size={14} className="shrink-0 cursor-grab text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{label(id)}</span>
                  <Button variant="ghost" size="icon-xs" aria-label={`${label(id)} выше`} disabled={i === 0} onClick={() => move(i, i - 1)}><Icon icon={ArrowUpIcon} size={12} /></Button>
                  <Button variant="ghost" size="icon-xs" aria-label={`${label(id)} ниже`} disabled={i === draft.length - 1} onClick={() => move(i, i + 1)}><Icon icon={ArrowDownIcon} size={12} /></Button>
                  <Button variant="ghost" size="icon-xs" aria-label={`Убрать ${label(id)}`} onClick={() => toggle(id, false)}><Icon icon={XIcon} size={12} /></Button>
                </li>
              ))}
              {!draft.length && <li className="p-2 text-xs text-muted-foreground">Отметьте поля слева</li>}
            </ol>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setDraft(defaults)}>По умолчанию</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Отмена</Button>
            <Button onClick={() => onApply(draft)}>Применить</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
