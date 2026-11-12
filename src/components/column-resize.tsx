// Column widths set by dragging the divider at the right edge of a header cell (mouse / pen; not on touch screens).
//
// How it behaves (owner 12/11: "no jumps, last column has no divider"):
// - Untouched table: automatic layout; the main text column (`flexId`) takes the free width.
// - A plain click on a divider changes nothing. The first real move (≥ 3px) freezes every column at the width it has
//   on screen right now, so nothing jumps, and from then on only the dragged column follows the pointer.
//   The main column stays flexible and gives / takes the space; when it is at its minimum the table grows and scrolls.
// - If the main column itself is dragged, an empty last column takes the free space instead.
// - Narrowest = the header label fits (numeric columns: also their widest value), widest = 640px.
// - Double click on a divider = as wide as the content. «Сбросить ширину колонок» = back to automatic.
// - Widths are remembered per table (localStorage `trk.colw3.<key>`).
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import { cn } from "@/lib/utils"

const MAX_W = 640
const FLEX_MIN = 160 // the main column never gets narrower than this while other columns grow
const DRAG_START = 3 // px of movement before a press becomes a drag
const key = (k: string) => `trk.colw3.${k}`
const load = (k?: string): Record<string, number> => {
  if (!k) return {}
  try { return JSON.parse(localStorage.getItem(key(k)) ?? "{}") } catch { return {} }
}

// header label (text + sort arrow) + the cell's side paddings
function minWidth(th: HTMLTableCellElement) {
  const label = th.querySelector<HTMLElement>("[data-col-label]")
  const cs = getComputedStyle(th)
  return Math.ceil((label?.getBoundingClientRect().width ?? 24) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 4)
}
// width of the widest body / totals value of the column, measured on its text + the cell's side paddings
function contentWidth(th: HTMLTableCellElement) {
  const table = th.closest("table")
  if (!table) return 0
  const idx = th.cellIndex
  const range = document.createRange()
  let w = 0
  for (const r of Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr, tfoot tr"))) {
    const cell = r.cells[idx]
    if (!cell || cell.colSpan > 1 || r.cells.length < idx + 1) continue
    // span of the text nodes only: block or full-width wrappers inside the cell would report the cell's own width
    let left = Infinity, right = -Infinity
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue
      range.selectNodeContents(n)
      const b = range.getBoundingClientRect()
      left = Math.min(left, b.left)
      right = Math.max(right, b.right)
    }
    if (right < left) continue
    const cs = getComputedStyle(cell)
    w = Math.max(w, right - left + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight))
  }
  return Math.ceil(w) + 2
}

// widths of the header cells as they are on screen now (the flexible column is left out unless asked)
function snapshot(row: HTMLTableRowElement, flexId: string | undefined, keepFlex: boolean) {
  const out: Record<string, number> = {}
  for (const th of Array.from(row.cells)) {
    const id = th.dataset.colId
    if (id && (keepFlex || id !== flexId)) out[id] = Math.round(th.getBoundingClientRect().width)
  }
  return out
}

export function useColumnWidths(storageKey?: string, flexId?: string) {
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
    try {
      if (Object.keys(widths).length) localStorage.setItem(key(storageKey), JSON.stringify(widths))
      else localStorage.removeItem(key(storageKey))
    } catch { /* private mode */ }
  }, [widths, storageKey])
  useEffect(() => () => cleanup.current?.(), [])

  const fixed = Object.keys(widths).length > 0
  // the main column was sized by hand: an empty last column takes the free space
  const filler = fixed && (!flexId || widths[flexId] != null)
  const flexible = (id: string) => id === flexId && widths[id] == null

  const start = (id: string, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const th = e.currentTarget.closest("th")
    const row = th?.parentElement as HTMLTableRowElement | null
    if (!th || !row) return
    // numbers are never cut: a right-aligned (numeric) column is at least as wide as its widest value
    const min = Math.max(minWidth(th), ["right", "end"].includes(getComputedStyle(th).textAlign) ? contentWidth(th) : 0)
    // the divider must stay under the pointer: a flexible column to the LEFT would absorb the change and the divider
    // would stand still, so it is frozen for this drag too (an empty last column then takes the slack).
    // A flexible column to the right may keep absorbing: the divider still follows the pointer.
    const flexTh = flexId ? Array.from(row.cells).find((c) => c.dataset.colId === flexId) : undefined
    const keepFlex = id === flexId || (!!flexTh && flexTh.cellIndex < th.cellIndex)
    const startX = e.clientX
    const startW = Math.round(th.getBoundingClientRect().width)
    let dragging = false
    const move = (ev: PointerEvent) => {
      if (ev.buttons === 0) return stop() // the release was swallowed (context menu, ctrl+click on macOS)
      const dx = ev.clientX - startX
      if (!dragging) {
        if (Math.abs(dx) < DRAG_START) return
        dragging = true
        setActive(id)
        // freeze what is on screen, so the first frame of the drag looks exactly like the last frame before it
        const base = snapshot(row, flexId, keepFlex)
        setWidths((p) => ({ ...base, ...p }))
      }
      // a column already wider than the cap (the flexible one on a wide screen) may not jump down to it
      const w = Math.round(Math.min(Math.max(MAX_W, startW), Math.max(min, startW + dx)))
      setWidths((p) => (p[id] === w ? p : { ...p, [id]: w }))
    }
    const stop = () => {
      // the click that follows a real drag must not reach the header (it would sort)
      if (dragging) {
        const block = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault() }
        window.addEventListener("click", block, { capture: true, once: true })
        setTimeout(() => window.removeEventListener("click", block, { capture: true }), 100)
      }
      window.removeEventListener("blur", stop)
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
    window.addEventListener("blur", stop) // alt-tab mid-drag must not leave a stuck drag
    // keep the resize cursor and stop text selection while the pointer is over other cells
    document.documentElement.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    cleanup.current = stop
  }

  // double click: as wide as the widest value in the column (like Excel)
  const fit = (id: string, el: HTMLElement) => {
    const th = el.closest("th")
    const row = th?.parentElement as HTMLTableRowElement | null
    if (!th || !row) return
    const w = Math.min(MAX_W, Math.max(minWidth(th), contentWidth(th)))
    const base = snapshot(row, flexId, id === flexId)
    setWidths((p) => ({ ...base, ...p, [id]: w }))
  }

  const reset = () => setWidths({})

  // header cell style. `fallback` = width of a column shown later (not in the saved set) while widths are fixed.
  const styleOf = (id: string, fallback = 120): CSSProperties | undefined =>
    !fixed || flexible(id) ? undefined : { width: widths[id] ?? fallback }

  // with fixed widths the table is never narrower than its columns (+ room for the flexible one): it scrolls instead
  const tableStyle = (ids: string[], fallback: (id: string) => number = () => 120): CSSProperties | undefined => {
    if (!fixed) return undefined
    const sum = ids.reduce((s, id) => s + (flexible(id) ? FLEX_MIN : widths[id] ?? fallback(id)), 0)
    return { minWidth: sum }
  }

  return { widths, fixed, filler, active, start, fit, reset, styleOf, tableStyle }
}

// Divider on the right edge of a header cell: a short thin line (the place to grab) and an 8px wide grab zone.
// While dragging the line is full height. Not rendered for the last column. Hidden on touch screens.
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
