// «Архив»: deleted items per entity. Restore one / selected, delete forever, empty the tab.
import { useMemo, useState } from "react"
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { ArchiveRestoreIcon } from "lucide-react"
import { api } from "@/api/client"
import { type ArchiveEntity } from "@/api/client-system"
import { useAccess, useUrlParam } from "@/app/state"
import { Page, PageHeader, Toolbar } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { ConfirmDialog, SearchInput } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate } from "@/lib/dates"

interface Row { id: number; name: string; updated_at?: string; created_at?: string; campaign_id?: number }

const EMPTY: Record<string, string> = {
  campaigns: "кампаний", streams: "потоков", landings: "лендингов", offers: "офферов", affiliateNetworks: "партнёрских сетей", trafficSources: "источников", domains: "доменов",
}
const ENTITIES: { key: ArchiveEntity; label: string; list: () => Promise<Row[]>; restore: (id: number) => Promise<unknown> }[] = [
  { key: "campaigns", label: "Кампании", list: () => api.campaigns.archived(), restore: (id) => api.campaigns.restore(id) },
  { key: "streams", label: "Потоки", list: () => api.streams.archived(), restore: (id) => api.streams.restore(id) },
  { key: "landings", label: "Лендинги", list: () => api.landings.archived(), restore: (id) => api.landings.restore(id) },
  { key: "offers", label: "Офферы", list: () => api.offers.archived(), restore: (id) => api.offers.restore(id) },
  { key: "affiliateNetworks", label: "Партнёрские сети", list: () => api.affiliateNetworks.archived(), restore: (id) => api.affiliateNetworks.restore(id) },
  { key: "trafficSources", label: "Источники", list: () => api.trafficSources.archived(), restore: (id) => api.trafficSources.restore(id) },
  { key: "domains", label: "Домены", list: () => api.domains.archived(), restore: (id) => api.domains.restore(id) },
]

export default function ArchivePage() {
  const qc = useQueryClient()
  const { canEdit } = useAccess("archive")
  const [tab, setTab] = useUrlParam("tab", "campaigns")
  const [q, setQ] = useUrlParam("q")
  const [confirm, setConfirm] = useState<{ kind: "clear" } | { kind: "purge"; ids: number[] } | null>(null)

  const entity = ENTITIES.find((e) => e.key === tab) ?? ENTITIES[0]
  const lists = useQueries({ queries: ENTITIES.map((e) => ({ queryKey: ["archive", e.key], queryFn: e.list })) })
  const current = lists[ENTITIES.indexOf(entity)]
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns.list })

  const rows = useMemo(
    () => (current.data ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || String(r.id) === q),
    [current.data, q],
  )
  const refresh = () => qc.invalidateQueries() // restored / purged items change several lists at once

  const restore = useMutation({
    mutationFn: async (ids: number[]) => { for (const id of ids) await entity.restore(id) },
    onSuccess: (_, ids) => { refresh(); toast.success(ids.length === 1 ? "Восстановлено" : `Восстановлено: ${ids.length}`) },
  })
  const purge = useMutation({
    mutationFn: (ids?: number[]) => api.system.archive.purge(entity.key, ids),
    onSuccess: () => { refresh(); toast.success("Удалено навсегда") },
  })

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { accessorKey: "id", header: "ID", size: 60, meta: { align: "right" } },
      { accessorKey: "name", header: "Название", enableHiding: false, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      ...(entity.key === "streams"
        ? [{ id: "campaign", header: "Кампания", accessorFn: (r: Row) => campaigns.data?.find((c) => c.id === r.campaign_id)?.name ?? (r.campaign_id ? `#${r.campaign_id}` : "—") } as ColumnDef<Row, unknown>]
        : []),
      { id: "changed", header: "Изменён", accessorFn: (r) => r.updated_at ?? r.created_at ?? "", cell: ({ row }) => <span className="num">{formatDate(row.original.updated_at ?? row.original.created_at)}</span> },
      ...(canEdit
        ? [{
            id: "_restore", enableHiding: false, enableSorting: false, size: 110,
            cell: ({ row }) => (
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); restore.mutate([row.original.id]) }}>
                <Icon icon={ArchiveRestoreIcon} size={14} /> Восстановить
              </Button>
            ),
          } as ColumnDef<Row, unknown>]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity.key, campaigns.data, canEdit],
  )

  const total = current.data?.length ?? 0
  return (
    <Page>
      <PageHeader title="Архив" />
      <p className="text-sm text-muted-foreground">Удалённое хранится 60 дней, потом стирается окончательно.</p>
      <Tabs value={entity.key} onValueChange={(v) => { setTab(v); setQ("") }}>
        <div className="max-w-full overflow-x-auto">
          <TabsList variant="line">
            {ENTITIES.map((e, i) => (
              <TabsTrigger key={e.key} value={e.key}>
                {e.label}{lists[i].data?.length ? ` · ${lists[i].data!.length}` : ""}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <Toolbar
        left={<SearchInput value={q} onChange={setQ} placeholder="Название или ID" />}
        right={
          canEdit && total > 0 && (
            <>
              <Button variant="outline" disabled={restore.isPending} onClick={() => restore.mutate((current.data ?? []).map((r) => r.id))}>Восстановить все</Button>
              <Button variant="destructive" onClick={() => setConfirm({ kind: "clear" })}>Очистить архив</Button>
            </>
          )
        }
      />
      <DataTable
        key={entity.key}
        data={rows}
        loading={current.isLoading}
        columns={columns}
        getRowId={(r) => String(r.id)}
        storageKey={`archive-${entity.key}`}
        initialSort={[{ id: "changed", desc: true }]}
        bulkActions={
          canEdit
            ? (sel, clear) => (
                <>
                  <Button variant="ghost" onClick={() => { restore.mutate(sel.map((r) => r.id)); clear() }}>Восстановить</Button>
                  <Button variant="destructive" onClick={() => { setConfirm({ kind: "purge", ids: sel.map((r) => r.id) }); clear() }}>Удалить навсегда</Button>
                </>
              )
            : undefined
        }
        empty={q ? "Ничего не найдено" : `В архиве нет ${EMPTY[entity.key]}`}
      />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm?.kind === "purge" ? `Удалить навсегда: ${confirm.ids.length}` : `Очистить архив: ${entity.label.toLowerCase()}`}
        description={
          confirm?.kind === "purge"
            ? "Элементы исчезнут безвозвратно."
            : `Все удалённые (${total}) в этой вкладке исчезнут безвозвратно. Другие вкладки не затрагиваются.`
        }
        confirmLabel="Удалить навсегда"
        destructive
        onConfirm={() => { purge.mutate(confirm?.kind === "purge" ? confirm.ids : undefined); setConfirm(null) }}
      />
    </Page>
  )
}
