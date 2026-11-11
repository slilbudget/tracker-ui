import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// One icon wrapper for the whole app: <Icon icon={SearchIcon} />. Icons: lucide-react (the shadcn standard pack).
export function Icon({ icon: C, className, size }: { icon: LucideIcon; className?: string; size?: number }) {
  return <C size={size ?? 16} strokeWidth={1.75} className={cn("shrink-0", className)} aria-hidden />
}
