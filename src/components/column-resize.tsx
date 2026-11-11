// Column widths set by dragging the divider between header cells (mouse / pen; not on touch screens).
// The first drag fixes the current width of every column (table-layout: fixed), so only the dragged column changes
// and it follows the pointer exactly; an empty last column takes the free space. Narrowest = the header label fits,
// widest = 640px. Double click on a divider = fit to the content. Widths are remembered per table.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { cn } from "@/lib/utils"

const MAX_W = 640
const key = (k: string) => `trk.colw2.${k}`
const load = (k?: string): Record<string, number> => {
  if (!k) return {}
  try { return JSON.parse(localStorage.getItem(key(k)) ?? "{}") } catch { return {} }
}

// header label (text + sort arrow) + the cell's side paddings
function minWidth(th: HTMLTableCellElement) {
  const label = th.querySelector<HTMLElement>("[data-col-label]")
  const cs = getComputedStyle(th)
  return Math.ceil((label?.scrollWidth ?? 24) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 4)
}
// width of the widest body / totals value of the header cell's column, measured on the text itself
// (not on the cell, which is never narrower than its fixed width) + the cell's side paddings
function contentWidth(th: HTMLTableCellElement) {
  const table = th.closest("table")
  if (!table) return 0
  const idx = th.cellIndex
  const range = document.createRange()
  let w = 0
  for (const r of Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr, tfoot tr"))) {
    const cell = r.cells[idx]
    if (!cell || cell.colSpan > 1 || r.cells.length < idx + 1) continue
    range.selectNodeContents(cell)
    const cs = getComputedStyle(cell)
    w = Math.max(w, range.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight))
  }
  return Math.ceil(w) + 2
}

// widths of all header cells of the row, as they are on screen now
function snapshot(row: HTMLTableRowElement) {
  const out: Record<string, number> = {}
  for (const th of Array.from(row.cells)) {
    const id = th.dataset.colId
    if (id) out[id] = Math.ceil(th.getBoundingClientRect().width)
  }
  return out
}

export function useColumnWidths(storageKey?: string) {
  const [widths, setWidths] = useState<Record<string, number>>(() => load(storageKey))
  // another table under the same component (report grouping changed): take its own saved widths
  const [loadedKey, setLoadedKey] = useState(storageKey)
  if (loadedKey !== storageKey) {
    setLoadedKey(storageKey)
    setWidths(load(storageKey))
  }
  const [active, setActive] = useState<string | null>(null)
  const cleanup = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(key(storageKey), JSON.stringify(widths)) } catch { /* private mode */ }
  }, [widths, storageKey])
  useEffect(() => () => cleanup.current?.(), [])
  const fixed = Object.keys(widths).length > 0

  const start = (id: string, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const th = e.currentTarget.closest("th")
    const row = th?.parentElement as HTMLTableRowElement | null
    if (!th || !row) return
    // numbers are never cut: a right-aligned (numeric) column is at least as wide as its widest value
    const min = Math.max(minWidth(th), getComputedStyle(th).textAlign === "right" ? contentWidth(th) : 0)
    const base = { ...snapshot(row), ...widths }
    const startX = e.clientX
    const startW = Math.round(th.getBoundingClientRect().width)
    setWidths(base)
    const move = (ev: PointerEvent) => {
      const w = Math.round(Math.min(MAX_W, Math.max(min, startW + ev.clientX - startX)))
      setWidths((p) => (p[id] === w ? p : { ...p, [id]: w }))
    }
    const stop = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
      document.documentElement.style.removeProperty("cursor")
      document.body.style.removeProperty("user-select")
      cleanup.current = null
      setActive(null)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    // keep the resize cursor and stop text selection while the pointer is over other cells
    document.documentElement.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    cleanup.current = stop
    setActive(id)
  }

  // double click: as wide as the widest value in the column (like Excel)
  const fit = (id: string, el: HTMLElement) => {
    const th = el.closest("th")
    const row = th?.parentElement as HTMLTableRowElement | null
    if (!th || !row) return
    const w = Math.max(minWidth(th), contentWidth(th))
    setWidths((p) => ({ ...(Object.keys(p).length ? p : snapshot(row)), [id]: Math.min(MAX_W, w) }))
  }

  const reset = () => setWidths({})

  // header cell style; `fallback` = width of a column shown later (not in the saved set) while widths are fixed
  const styleOf = (id: string, fallback = 120): CSSProperties | undefined =>
    fixed ? { width: widths[id] ?? fallback } : undefined

  return { widths, fixed, active, start, fit, reset, styleOf }
}

// Divider on the right edge of a header cell: a short thin line (the place to grab) and an 8px wide grab zone.
// While dragging the line is full height and blue. Hidden on touch screens.
export function ResizeHandle({ active, onPointerDown, onFit }: { active: boolean; onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void; onFit: (el: HTMLElement) => void }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина колонки"
      title="Потяните, чтобы изменить ширину. Двойной щелчок — по содержимому"
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => { e.stopPropagation(); onFit(e.currentTarget) }}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 right-0 z-[1] flex h-full w-2 cursor-col-resize touch-none justify-end select-none pointer-coarse:hidden"
    >
      <span className={cn("w-px self-center", active ? "h-full bg-ring" : "h-4 bg-muted-foreground/30")} />
    </span>
  )
}
