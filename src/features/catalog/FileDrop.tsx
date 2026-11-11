// Drop zone for a .zip: click or drag a file in. Replaces the browser's English file input.
import { useRef, useState } from "react"
import { FileArchiveIcon, UploadIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/icon"

export const fmtSize = (n: number) => (n < 1024 ? `${n} Б` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`)

export function FileDrop({
  value, onChange, error, id, removable = true,
}: { value: { name: string; size: number } | null; onChange: (f: File | null) => void; error?: string; id?: string; removable?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [local, setLocal] = useState<string>("")

  const take = (f: File | undefined) => {
    if (!f) return
    if (!/\.zip$/i.test(f.name)) return setLocal("Нужен файл .zip: упакуйте страницу в архив")
    setLocal("")
    onChange(f)
  }
  const msg = local || error

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={input} id={id} type="file" accept=".zip,application/zip" className="sr-only" tabIndex={-1}
        onChange={(e) => { take(e.target.files?.[0]); e.target.value = "" }}
      />
      {value ? (
        <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Icon icon={FileArchiveIcon} size={16} className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{value.name}</span>
          <span className="num shrink-0 text-muted-foreground">{fmtSize(value.size)}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>Заменить</Button>
          {removable && (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Убрать файл" onClick={() => { setLocal(""); onChange(null) }}>
              <Icon icon={XIcon} size={14} />
            </Button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]) }}
          aria-invalid={!!msg}
          className={cn(
            "flex w-full flex-col items-center gap-1 rounded-md border border-dashed px-3 py-5 text-sm text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
            over && "border-primary bg-accent text-foreground",
            msg && "border-destructive",
          )}
        >
          <Icon icon={UploadIcon} size={18} />
          <span className="text-foreground">Перетащите ZIP сюда или нажмите, чтобы выбрать</span>
          <span className="text-xs">Архив с index.html в корне</span>
        </button>
      )}
      {msg && <p className="text-xs text-destructive">{msg}</p>}
    </div>
  )
}
