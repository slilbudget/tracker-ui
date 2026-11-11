// Approach picker for campaign forms: the shared directory + «Новый подход» right here (any buyer may add one).
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { api } from "@/api/client"
import { namingExample } from "@/api/client-directory"
import { Icon } from "@/components/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function ApproachSelect({ value, onChange, invalid, disabled, allowEmpty }: {
  value: string; onChange: (v: string) => void; invalid?: boolean; disabled?: boolean; allowEmpty?: boolean
}) {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ["approaches"], queryFn: api.approaches.list })
  const naming = useQuery({ queryKey: ["adNaming"], queryFn: api.adNaming.get })
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const finalCode = (code || name).trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  const create = useMutation({
    mutationFn: () => api.approaches.create({ name: name.trim(), code: finalCode, description: "" }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["approaches"] })
      onChange(a.name)
      toast.success(`Подход «${a.name}» добавлен в справочник`)
      setOpen(false); setName(""); setCode("")
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const current = list.data?.find((a) => a.name === value)
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex gap-2">
        <Select value={value || (allowEmpty ? "none" : undefined)} onValueChange={(v) => onChange(v === "none" ? "" : v)} disabled={disabled}>
          <SelectTrigger className="min-w-0 flex-1" aria-invalid={invalid}><SelectValue placeholder="Выберите подход" /></SelectTrigger>
          <SelectContent>
            {allowEmpty && <SelectItem value="none">Не задан</SelectItem>}
            {list.data?.map((a) => <SelectItem key={a.id} value={a.name}>{a.name}{a.code !== a.name && <span className="text-muted-foreground"> · {a.code}</span>}</SelectItem>)}
          </SelectContent>
        </Select>
        {!disabled && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline"><Icon icon={PlusIcon} size={14} /> Новый</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))] gap-2 p-3">
              <Label htmlFor="ap-name">Название подхода</Label>
              <Input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, SLIDESHOW" />
              <Label htmlFor="ap-code">Код в нейминге объявлений</Label>
              <Input id="ap-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={finalCode || "Как название"} className="font-mono" />
              {naming.data && <p className="text-xs break-all text-muted-foreground">Объявление: <span className="font-mono">{namingExample(naming.data.template, finalCode)}</span></p>}
              <Button type="button" disabled={!name.trim() || !finalCode || create.isPending} onClick={() => create.mutate()}>Добавить в справочник</Button>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {current && naming.data && <p className="text-xs break-all text-muted-foreground">В нейминге объявлений: <span className="font-mono">{namingExample(naming.data.template, current.code)}</span></p>}
    </div>
  )
}
