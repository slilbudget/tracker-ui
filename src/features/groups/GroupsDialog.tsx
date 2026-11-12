// Reusable «Группы» manager for a GroupType: list, inline rename, add, delete with confirm.
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { FolderIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { Group, GroupType } from "@/api/types"
import { api } from "@/api/client"
import { useAccess } from "@/app/state"
import { ConfirmDialog } from "@/components/common"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const RESOURCE = { campaigns: "campaigns", offers: "offers", landings: "landings", domains: "domains" } as const

// Toolbar button + dialog in one piece: <GroupsButton type="offers" />.
export function GroupsButton({ type }: { type: GroupType }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Icon icon={FolderIcon} size={14} /> Группы
      </Button>
      <GroupsDialog type={type} open={open} onOpenChange={setOpen} />
    </>
  )
}

function GroupsDialog({ type, open, onOpenChange }: { type: GroupType; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  // groups are shared access scopes: only full access manages them
  const { isFull: canEdit } = useAccess(RESOURCE[type])
  const [name, setName] = useState("")
  const [toDelete, setToDelete] = useState<Group | null>(null)
  const groups = useQuery({ queryKey: ["groups", type], queryFn: () => api.groups.list(type), enabled: open })
  const refresh = () => qc.invalidateQueries({ queryKey: ["groups", type] })

  const add = useMutation({
    mutationFn: (n: string) => api.groups.create({ name: n, type, position: (groups.data?.length ?? 0) }),
    onSuccess: () => { refresh(); setName(""); toast.success("Группа добавлена") },
  })
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.groups.update(id, { name }),
    onSuccess: () => { refresh(); toast.success("Группа переименована") },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.groups.remove(id),
    onSuccess: () => {
      refresh()
      // entities of the deleted group lose it: refresh the lists
      qc.invalidateQueries({ queryKey: [type] })
      toast.success("Группа удалена")
    },
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Группы</DialogTitle>
            <DialogDescription>
              {canEdit ? "Название меняется на месте: правьте и нажмите Enter или уйдите из поля." : "Только просмотр: у вашей роли нет прав на изменение"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-80 flex-col overflow-y-auto rounded-md border">
            {groups.isLoading && <div className="p-3 text-sm text-muted-foreground">Загрузка…</div>}
            {groups.data?.length === 0 && <div className="p-3 text-sm text-muted-foreground">Групп пока нет</div>}
            {groups.data?.map((g) => (
              <div key={g.id} className="flex items-center gap-2 border-b px-2 py-1 last:border-b-0">
                <GroupName group={g} readOnly={!canEdit} onCommit={(n) => rename.mutate({ id: g.id, name: n })} />
                {canEdit && (
                  <Button variant="ghost" size="icon-sm" aria-label="Удалить группу" onClick={() => setToDelete(g)}>
                    <Icon icon={Trash2Icon} size={14} />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (name.trim()) add.mutate(name.trim())
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название новой группы" />
              <Button type="submit" disabled={!name.trim() || add.isPending}>
                <Icon icon={PlusIcon} size={14} /> Добавить
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={`Удалить группу «${toDelete?.name ?? ""}»?`}
        description="Сами объекты останутся, но окажутся без группы."
        confirmLabel="Удалить"
        destructive
        onConfirm={() => {
          remove.mutate(toDelete!.id)
          setToDelete(null)
        }}
      />
    </>
  )
}

function GroupName({ group, readOnly, onCommit }: { group: Group; readOnly: boolean; onCommit: (n: string) => void }) {
  const [v, setV] = useState(group.name)
  const [seen, setSeen] = useState(group.name)
  if (seen !== group.name) { setSeen(group.name); setV(group.name) }
  const commit = () => {
    const n = v.trim()
    if (!n) setV(group.name)
    else if (n !== group.name) onCommit(n)
  }
  return (
    <Input
      value={v}
      readOnly={readOnly}
      aria-label="Название группы"
      className="border-transparent bg-transparent shadow-none focus-visible:border-ring dark:bg-transparent"
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        if (e.key === "Escape") setV(group.name)
      }}
    />
  )
}
