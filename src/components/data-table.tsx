// Generic data table for every list page: sorting, row selection + bulk bar, column visibility,
// summary footer, client pagination, sticky header, horizontal scroll on narrow screens.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, Columns3Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Icon } from "@/components/icon"
import { ResizeHandle, useColumnWidths } from "@/components/column-resize"
import { METRIC_GROUPS, METRIC_PRESETS, metricDef } from "@/api/meta"

type Align = "left" | "right" | "center"
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: Align
    // label in the columns menu when the header is not a plain string
    label?: string
    // value for the summary footer row
    footer?: ReactNode
    className?: string
    // this column takes the free width (default: the «name» column, else the first text column)
    grow?: boolean
    // a statistics column (id = metric key): grouped in the columns menu, switched by column sets
    metric?: boolean
  }
}

const storeGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const storeSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

// Server-side paging (logs): `data` is the current page, `total` the real number of rows.
interface ServerPaging {
  total: number
  pageIndex: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}
const PAGE_SIZES = [25, 50, 100, 250]

interface DataTableProps<T> {
  data: T[] | undefined
  columns: ColumnDef<T, unknown>[]
  loading?: boolean
  getRowId?: (row: T) => string
  onRowClick?: (row: T) => void
  // selection: renders a checkbox column and a bulk bar with these actions
  bulkActions?: (selected: T[], clear: () => void) => ReactNode
  // summary footer: column id → value
  summary?: Record<string, ReactNode>
  // key to remember visible columns per page
  storageKey?: string
  initialHidden?: string[]
  initialSort?: SortingState
  pageSize?: number
  empty?: ReactNode
  rowClassName?: (row: T) => string | undefined
  toolbarRight?: ReactNode
  serverPaging?: ServerPaging
  // the page has active filters: empty state says «Ничего не найдено» with a «Сбросить фильтры» button
  onResetFilters?: () => void
  // muted second line under «Ничего не найдено»
  emptyHint?: ReactNode
}

export function DataTable<T>({
  data, columns, loading, getRowId, onRowClick, bulkActions, summary, storageKey, initialHidden = [], initialSort = [],
  pageSize = 100, empty, rowClassName, serverPaging, onResetFilters, emptyHint,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort)
  // visible width of the scroll area, for the empty-state message
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState<number>()
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // column widths measured while there were rows: the empty state keeps them, so the columns do not jump
  const thRefs = useRef(new Map<string, HTMLTableCellElement>())
  const [frozen, setFrozen] = useState<Record<string, number>>({})
  const [selection, setSelection] = useState<RowSelectionState>({})
  const [visibility, setVisibility] = useState<VisibilityState>(() => {
    const saved = storageKey && storeGet(`trk.cols2.${storageKey}`)
    // columns added after the choice was saved keep their default (hidden ones stay hidden)
    return { ...Object.fromEntries(initialHidden.map((id) => [id, false])), ...(saved ? JSON.parse(saved) : {}) }
  })
  useEffect(() => {
    if (storageKey) storeSet(`trk.cols2.${storageKey}`, JSON.stringify(visibility))
  }, [visibility, storageKey])

  const cols = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!bulkActions) return columns
    const select: ColumnDef<T, unknown> = {
      id: "_select",
      enableSorting: false,
      enableHiding: false,
      size: 32,
      header: ({ table }) => (
        <Checkbox
          aria-label="Выбрать все"
          checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Выбрать строку"
          checked={row.getIsSelected()}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
        />
      ),
    }
    return [select, ...columns]
  }, [columns, bulkActions])

  const table = useReactTable({
    data: data ?? [],
    columns: cols,
    state: { sorting, rowSelection: selection, columnVisibility: visibility },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    onColumnVisibilityChange: setVisibility,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    manualPagination: !!serverPaging,
    enableRowSelection: !!bulkActions,
  })

  const selected = table.getSelectedRowModel().rows.map((r) => r.original)
  const rowCount = data?.length ?? 0
  const total = serverPaging ? serverPaging.total : rowCount
  const clientPg = table.getState().pagination
  const pageIndex = serverPaging ? serverPaging.pageIndex : clientPg.pageIndex
  const ps = serverPaging ? serverPaging.pageSize : clientPg.pageSize
  const canPrev = serverPaging ? pageIndex > 0 : table.getCanPreviousPage()
  const canNext = serverPaging ? (pageIndex + 1) * ps < total : table.getCanNextPage()
  const goPage = (p: number) => (serverPaging ? serverPaging.onPageChange(p) : table.setPageIndex(p))
  const setSize = (n: number) => (serverPaging ? serverPaging.onPageSizeChange(n) : table.setPageSize(n))
  const showPager = serverPaging ? total > 0 : total > ps
  const empty0 = !loading && rowCount === 0
  useEffect(() => {
    if (rowCount === 0) return
    const next: Record<string, number> = {}
    thRefs.current.forEach((el, id) => { next[id] = Math.round(el.getBoundingClientRect().width) })
    setFrozen((prev) => {
      const keys = Object.keys(next)
      return keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k]) ? prev : next
    })
  })
  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide())

  // The main text column (usually «Название») takes the free width, so numbers stay compact on the
  // right instead of spreading across a wide screen; on phones its width is capped.
  const visibleCols = table.getVisibleLeafColumns()
  const textCols = visibleCols.filter((c) => c.id !== "_select" && c.id !== "id" && (c.columnDef.meta?.align ?? "left") === "left")
  const growId = (textCols.find((c) => c.columnDef.meta?.grow) ?? textCols.find((c) => /name|login|message/i.test(c.id)) ?? textCols[0])?.id
  const pinCls = (id: string, part: "head" | "body" | "foot") =>
    id === "_select"
      ? cn("sticky left-0 z-[2] max-sm:static", part === "head" ? "bg-background" : part === "foot" ? "bg-muted" : "bg-inherit")
      : id === growId ? "max-sm:max-w-[55vw]" : undefined
  // widths the user dragged win over everything else
  const cw = useColumnWidths(storageKey)
  // widths fixed by the user: an empty last column takes the free space, so the numbers stay compact
  const filler = cw.fixed
  const fillerCell = (cls: string) => filler && <td aria-hidden className={cls} />
  const widthOf = (id: string, size: number | undefined, align: Align) => {
    if (cw.fixed) return id === "_select" ? { width: 40 } : cw.styleOf(id, size && size !== 150 ? size : align === "right" ? 110 : 160)
    if (empty0 && frozen[id]) return id === growId ? { width: "100%", minWidth: frozen[id] } : { width: frozen[id], minWidth: frozen[id] }
    return id === growId ? { width: "100%" } : size && size !== 150 ? { width: size } : align === "right" ? { minWidth: "5.5rem" } : undefined
  }
  const colLabel = (c: (typeof hideable)[number]) => c.columnDef.meta?.label ?? (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id)
  // columns with a visible header can be resized (not the checkbox / row-menu columns)
  const canResize = (c: (typeof hideable)[number]) =>
    c.id !== "_select" && !!(c.columnDef.meta?.label || (typeof c.columnDef.header === "string" && c.columnDef.header))
  const colItem = (c: (typeof hideable)[number]) => (
    <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => c.toggleVisibility(!!v)}>
      {colLabel(c)}
    </DropdownMenuCheckboxItem>
  )
  const plainCols = hideable.filter((c) => !c.columnDef.meta?.metric)
  const metricCols = hideable.filter((c) => c.columnDef.meta?.metric)
  // a set shows exactly its metrics (those this role may see); other columns stay as they are
  const applyPreset = (keys: string[]) =>
    setVisibility((v) => ({ ...v, ...Object.fromEntries(metricCols.map((c) => [c.id, keys.includes(c.id)])) }))
  const presetOn = (keys: string[]) => metricCols.every((c) => c.getIsVisible() === keys.includes(c.id))
  const colsMenu = hideable.length > 4 && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="text-muted-foreground">
          <Icon icon={Columns3Icon} /> Колонки
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8} className="max-h-[min(32rem,var(--radix-dropdown-menu-content-available-height))] w-64 overflow-auto">
        {metricCols.length > 0 && (
          <>
            <DropdownMenuLabel>Наборы</DropdownMenuLabel>
            {METRIC_PRESETS.map((p) => (
              <DropdownMenuItem key={p.name} onSelect={(e) => { e.preventDefault(); applyPreset(p.keys) }} className="items-start">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.hint}</span>
                </span>
                {presetOn(p.keys) && <Icon icon={CheckIcon} className="mt-0.5 text-muted-foreground" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        {plainCols.length > 0 && (
          <>
            <DropdownMenuLabel>{metricCols.length > 0 ? "Данные" : "Показывать колонки"}</DropdownMenuLabel>
            {plainCols.map(colItem)}
          </>
        )}
        {METRIC_GROUPS.map((g) => {
          const items = metricCols.filter((c) => (metricDef(c.id)?.group ?? "rates") === g.key)
          return items.length > 0 && (
            <div key={g.key}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{g.name}</DropdownMenuLabel>
              {items.map(colItem)}
            </div>
          )
        })}
        {cw.fixed && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => cw.reset()}>Сбросить ширину колонок</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Desktop: the table is its own scroll area (header and totals stay visible). Phones: only sideways, the page scrolls. */}
      <div ref={scrollRef} className="overflow-auto rounded-md border md:max-h-[calc(100svh-14rem)]">
        <table className={cn("w-full caption-bottom border-separate border-spacing-0 text-sm", cw.fixed && "table-fixed [&_[data-cap]]:max-w-none")}>
          <thead className="sticky top-0 z-[3]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const align = h.column.columnDef.meta?.align ?? "left"
                  const sorted = h.column.getIsSorted()
                  return (
                    <th
                      key={h.id}
                      data-col-id={h.column.id}
                      ref={(el) => { if (el) thRefs.current.set(h.column.id, el); else thRefs.current.delete(h.column.id) }}
                      style={widthOf(h.column.id, h.column.columnDef.size, align)}
                      className={cn(
                        "relative h-9 border-b bg-background px-2.5 text-left text-[13px] font-medium whitespace-nowrap text-muted-foreground",
                        align === "right" && "text-right",
                        align === "center" && "text-center",
                        pinCls(h.column.id, "head"),
                        h.column.columnDef.meta?.className,
                      )}
                    >
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          data-col-label
                          className={cn("inline-flex items-center gap-1 align-middle", align === "right" && "flex-row-reverse")}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <Icon icon={sorted === "asc" ? ChevronUpIcon : ChevronDownIcon} size={12} className={sorted ? "" : "invisible"} />
                        </button>
                      ) : canResize(h.column) ? (
                        <span data-col-label className="inline-block">{flexRender(h.column.columnDef.header, h.getContext())}</span>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                      {!h.isPlaceholder && canResize(h.column) && (
                        <ResizeHandle active={cw.active === h.column.id} onPointerDown={(e) => cw.start(h.column.id, e)} onFit={(el) => cw.fit(h.column.id, el)} />
                      )}
                    </th>
                  )
                })}
                {filler && <th aria-hidden className="h-9 border-b bg-background" />}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && !data
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    {table.getVisibleLeafColumns().map((c) => (
                      <td key={c.id} className="h-9 border-b px-2.5"><Skeleton className="h-3.5 w-full" /></td>
                    ))}
                    {fillerCell("h-9 border-b")}
                  </tr>
                ))
              : table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(row.original) } : undefined}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className={cn(
                      "bg-background outline-none focus-visible:bg-muted data-[state=selected]:bg-accent",
                      onRowClick && "cursor-pointer",
                      rowClassName?.(row.original),
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const align = cell.column.columnDef.meta?.align ?? "left"
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "h-9 border-b px-2.5 whitespace-nowrap",
                            cw.fixed && "overflow-hidden text-ellipsis",
                            align === "right" && "num text-right",
                            align === "center" && "text-center",
                            pinCls(cell.column.id, "body"),
                            cell.column.columnDef.meta?.className,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      )
                    })}
                    {fillerCell("h-9 border-b")}
                  </tr>
                ))}
            {empty0 && (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length + (filler ? 1 : 0)} className="h-24 p-0 text-muted-foreground">
                  {/* sticky: stays inside the visible part when the table is wider than the screen */}
                  <div className="sticky left-0 box-border flex flex-col items-center gap-1 px-3 text-center" style={{ width: viewW }}>
                    {onResetFilters ? (
                      <>
                        <span>Ничего не найдено</span>
                        {emptyHint && <span className="text-xs">{emptyHint}</span>}
                        <Button variant="ghost" onClick={onResetFilters}>Сбросить фильтры</Button>
                      </>
                    ) : (
                      empty ?? "Нет данных за выбранный период"
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          {summary && rowCount > 0 && (
            <tfoot className="sticky bottom-0 z-[3] font-medium">
              <tr>
                {visibleCols.map((c) => {
                  const align = c.columnDef.meta?.align ?? "left"
                  // «Итого» sits in the main text column, so it stays next to the row names.
                  const label = c.id === (growId && summary[growId] === undefined ? growId : visibleCols.find((x) => x.id !== "_select")?.id)
                  return (
                    <td key={c.id} className={cn("h-9 border-t bg-muted px-2.5 whitespace-nowrap", cw.fixed && "overflow-hidden text-ellipsis", align === "right" && "num text-right", pinCls(c.id, "foot"))}>
                      {summary[c.id] ?? (label ? "Итого" : "")}
                    </td>
                  )
                })}
                {fillerCell("h-9 border-t bg-muted")}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* One footer row: rows total (or the bulk bar in its place, so the table never shifts), pager, columns. */}
      <div className={cn("flex min-h-8 flex-wrap items-center gap-2 text-sm text-muted-foreground", selected.length > 0 && "max-md:sticky max-md:bottom-0 max-md:z-[4] max-md:bg-background")}>
        {bulkActions && selected.length > 0 ? (
          <div className="flex min-h-9 flex-wrap items-center gap-2 rounded-md border bg-muted px-2 text-foreground max-sm:grid max-sm:w-full max-sm:grid-cols-2 max-sm:gap-1 max-sm:p-1.5 max-sm:[&>span:first-child]:col-span-2 max-sm:[&>span:first-child]:px-1">
            <span>Выбрано: {selected.length}</span>
            {bulkActions(selected, () => setSelection({}))}
            <Button variant="ghost" onClick={() => setSelection({})}>Снять выбор</Button>
          </div>
        ) : (
          <span>{loading ? "Загрузка…" : `Строк: ${total}`}</span>
        )}
        {showPager && (
          <>
            <Button variant="ghost" size="icon" disabled={!canPrev} onClick={() => goPage(pageIndex - 1)} aria-label="Назад">
              <Icon icon={ChevronLeftIcon} />
            </Button>
            <span className="num">
              {pageIndex * ps + 1}–{Math.min(total, (pageIndex + 1) * ps)} из {total}
            </span>
            <Button variant="ghost" size="icon" disabled={!canNext} onClick={() => goPage(pageIndex + 1)} aria-label="Вперёд">
              <Icon icon={ChevronRightIcon} />
            </Button>
            <Select value={String(ps)} onValueChange={(v) => setSize(Number(v))}>
              <SelectTrigger className="w-20" aria-label="Строк на странице"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(PAGE_SIZES.includes(ps) ? PAGE_SIZES : [...PAGE_SIZES, ps].sort((a, b) => a - b)).map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
        <div className="ml-auto">{colsMenu}</div>
      </div>
    </div>
  )
}
