// Free tags: type and press Enter (or comma); existing tags are suggested. Backspace in an empty field removes the last one.
import { normalizeTags } from "@/lib/tags"
import { useId, useState } from "react"
import { XIcon } from "lucide-react"
import { Icon } from "@/components/icon"
import { cn } from "@/lib/utils"

export function TagsInput({ value, onChange, suggestions = [], disabled, placeholder = "Добавить тег" }: {
  value: string[]
  onChange: (v: string[]) => void
  suggestions?: string[]
  disabled?: boolean
  placeholder?: string
}) {
  const [text, setText] = useState("")
  const listId = useId()
  // «a, b, c» (typed or pasted) adds three tags; a tag already there (any case) is skipped
  const add = (raw: string) => {
    const next = normalizeTags([...value, raw])
    if (next.length !== value.length) onChange(next)
    setText("")
  }
  return (
    <div className={cn("flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border border-input px-1.5 py-1 focus-within:border-ring", disabled && "opacity-60")}>
      {value.map((t) => (
        <span key={t} className="inline-flex h-6 items-center gap-0.5 rounded-sm bg-muted pr-0.5 pl-1.5 text-xs">
          {t}
          {!disabled && (
            <button type="button" aria-label={`Убрать тег ${t}`} className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground" onClick={() => onChange(value.filter((x) => x !== t))}>
              <Icon icon={XIcon} size={10} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          value={text}
          list={listId}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text")
            if (t.includes(",")) { e.preventDefault(); add(text + t) }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(text) }
            if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => text.trim() && add(text)}
          placeholder={value.length ? "" : placeholder}
          aria-label="Новый тег"
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      )}
      <datalist id={listId}>{suggestions.filter((s) => !value.some((x) => x.toLowerCase() === s.toLowerCase())).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  )
}

export function TagChips({ tags }: { tags: string[] }) {
  return tags.map((t) => <span key={t} className="shrink-0 rounded-sm bg-muted px-1 text-xs text-muted-foreground">{t}</span>)
}
