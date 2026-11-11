import { useEffect, useState } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ChevronDownIcon, MenuIcon, SearchIcon, TriangleAlertIcon, UserIcon } from "lucide-react"
import type { Resource } from "@/api/types"
import { api } from "@/api/client"
import { roles } from "@/mock/seed"
import { cn } from "@/lib/utils"
import { useApp } from "@/app/state"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { Icon } from "@/components/icon"
import { setDevNotes, useDevNotes } from "@/features/devnotes/notes"

interface NavItem { to: string; label: string; resource: Resource }
const MAIN: NavItem[] = [
  { to: "/", label: "Дашборд", resource: "dashboard" },
  { to: "/campaigns", label: "Кампании", resource: "campaigns" },
  { to: "/ad-accounts", label: "Кабинеты", resource: "ad_accounts" },
  { to: "/landings", label: "Лендинги", resource: "landings" },
  { to: "/affiliate-networks", label: "Партнёрские сети", resource: "affiliate_networks" },
]
const OFFERS: NavItem[] = [
  { to: "/offer-groups", label: "Оффер-группы и капы", resource: "offers" },
  { to: "/offers", label: "Офферы", resource: "offers" },
  { to: "/offers/replace", label: "Замена оффера", resource: "offer_swap" },
]
const SOURCES: NavItem[] = [
  { to: "/traffic-sources", label: "Источники", resource: "traffic_sources" },
]
const REPORTS: NavItem[] = [
  { to: "/reports", label: "Отчёт", resource: "reports" },
  { to: "/clicks", label: "Лог кликов", resource: "clicks" },
  { to: "/conversions", label: "Лог конверсий", resource: "conversions" },
  { to: "/trends", label: "Тренды", resource: "trends" },
]
const AFTER: NavItem[] = [
  { to: "/domains", label: "Домены", resource: "domains" },
  { to: "/postbacks", label: "Постбеки", resource: "postbacks" },
]
const SYSTEM: NavItem[] = [
  { to: "/problems", label: "Проблемы", resource: "problems" },
  { to: "/users", label: "Пользователи и роли", resource: "users" },
  { to: "/integrations", label: "Интеграции", resource: "integrations" },
  { to: "/settings", label: "Настройки", resource: "settings" },
  { to: "/audit", label: "Журнал действий", resource: "logs" },
  { to: "/archive", label: "Архив", resource: "archive" },
]

const linkCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex h-12 items-center border-b-2 px-2 text-[15px] font-medium whitespace-nowrap 2xl:px-2.5",
    isActive ? "border-primary text-foreground" : "border-transparent text-nav",
  )

function useVisible(items: NavItem[]) {
  const { role } = useApp()
  return items.filter((i) => (role.access[i.resource] ?? "none") !== "none")
}

const ROUTE_RESOURCE: [string, Resource][] = [
  ["/campaigns", "campaigns"], ["/ad-accounts", "ad_accounts"], ["/landings", "landings"], ["/affiliate-networks", "affiliate_networks"],
  ["/offers/replace", "offer_swap"], ["/offer-groups", "offers"], ["/offers", "offers"],
  ["/traffic-sources", "traffic_sources"], ["/domains", "domains"], ["/reports", "reports"], ["/clicks", "clicks"],
  ["/conversions", "conversions"], ["/trends", "trends"], ["/postbacks", "postbacks"], ["/users", "users"],
  ["/integrations", "integrations"], ["/settings", "settings"], ["/audit", "logs"], ["/archive", "archive"], ["/problems", "problems"],
]
const resourceOf = (path: string): Resource | null =>
  path === "/" ? "dashboard" : ROUTE_RESOURCE.find(([p]) => path === p || path.startsWith(p + "/"))?.[1] ?? null

// Open problems count next to the search: red when something is critical. Polls once a minute.
function ProblemsBell() {
  const { role } = useApp()
  const allowed = (role.access.problems ?? "none") !== "none"
  const q = useQuery({ queryKey: ["problems"], queryFn: api.problems.list, refetchInterval: 60000, enabled: allowed })
  if (!allowed) return null
  const open = (q.data ?? []).filter((p) => p.status === "open")
  const critical = open.some((p) => p.severity === "critical")
  return (
    <Button variant="ghost" asChild className="gap-1.5 px-2 text-nav" aria-label={`Проблемы: ${open.length}`}>
      <NavLink to="/problems">
        <Icon icon={TriangleAlertIcon} className={critical ? "text-destructive" : open.length ? "text-warning" : ""} />
        {open.length > 0 && <span className={cn("num text-sm", critical ? "text-destructive" : "text-warning")}>{open.length}</span>}
      </NavLink>
    </Button>
  )
}

export function Shell() {
  const loc = useLocation()
  const { role, setRoleId } = useApp()
  const res = resourceOf(loc.pathname)
  const denied = res != null && (role.access[res] ?? "none") === "none"
  const main = useVisible(MAIN), offerItems = useVisible(OFFERS), sources = useVisible(SOURCES)
  const reports = useVisible(REPORTS), after = useVisible(AFTER), system = useVisible(SYSTEM)
  const [mobile, setMobile] = useState(false)
  const [search, setSearch] = useState(false)
  useEffect(() => setMobile(false), [loc.pathname])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearch((v) => !v) }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [])
  const reportsActive = reports.some((r) => loc.pathname.startsWith(r.to))
  const offersActive = loc.pathname.startsWith("/offer")
  const systemActive = system.some((r) => loc.pathname.startsWith(r.to))

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-30 bg-header">
        <div className="mx-auto flex h-12 max-w-[1800px] items-center gap-1 px-2 md:px-4">
          <Button variant="ghost" size="icon" className="text-nav xl:hidden" aria-label="Меню" onClick={() => setMobile(true)}>
            <Icon icon={MenuIcon} />
          </Button>
          <nav className="hidden items-center xl:flex">
            {main.map((i) => <NavLink key={i.to} to={i.to} end={i.to === "/"} className={linkCls}>{i.label}</NavLink>)}
            {offerItems.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger className={linkCls({ isActive: offersActive }) + " gap-1 outline-none"}>
                  Офферы <Icon icon={ChevronDownIcon} size={12} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-52">
                  {offerItems.map((i) => <DropdownMenuItem key={i.to} asChild><NavLink to={i.to} end>{i.label}</NavLink></DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {sources.map((i) => <NavLink key={i.to} to={i.to} className={linkCls}>{i.label}</NavLink>)}
            {reports.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger className={linkCls({ isActive: reportsActive }) + " gap-1 outline-none"}>
                  Отчёты <Icon icon={ChevronDownIcon} size={12} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-44">
                  {reports.map((i) => <DropdownMenuItem key={i.to} asChild><NavLink to={i.to}>{i.label}</NavLink></DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {after.map((i) => <NavLink key={i.to} to={i.to} className={linkCls}>{i.label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" className="hidden w-40 justify-start text-muted-foreground 2xl:inline-flex" onClick={() => setSearch(true)}>
              <Icon icon={SearchIcon} /> Поиск
              <Kbd className="ml-auto">⌘K</Kbd>
            </Button>
            <Button variant="ghost" size="icon" className="text-nav 2xl:hidden" aria-label="Поиск" onClick={() => setSearch(true)}>
              <Icon icon={SearchIcon} />
            </Button>
            <ProblemsBell />
            {system.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger className={linkCls({ isActive: systemActive }) + " gap-1 outline-none max-xl:hidden"}>
                  Система <Icon icon={ChevronDownIcon} size={12} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56">
                  {system.map((i) => <DropdownMenuItem key={i.to} asChild><NavLink to={i.to}>{i.label}</NavLink></DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <UserMenu />
          </div>
        </div>
      </header>

      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader><SheetTitle>Меню</SheetTitle></SheetHeader>
          <nav className="flex flex-col overflow-y-auto p-2 text-sm">
            {[["", main], ["Офферы", offerItems], ["", sources], ["Отчёты", reports], ["", after], ["Система", system]].map(([title, items], gi) => (
              <div key={gi} className="flex flex-col py-1">
                {title && (items as NavItem[]).length > 0 && <div className="px-2 pt-2 pb-1 text-xs text-muted-foreground">{title as string}</div>}
                {(items as NavItem[]).map((i) => (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    end={i.to === "/" || i.to === "/offers"}
                    className={({ isActive }) => cn("rounded-md px-2 py-2", isActive ? "bg-accent text-accent-foreground" : "")}
                  >
                    {i.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <GlobalSearch open={search} onOpenChange={setSearch} />

      {role.id !== 1 && (
        <div className="bg-muted">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-2 px-4 py-1.5 text-sm md:px-6">
            <span>Вы смотрите трекер как роль «{role.name}». Так его видят пользователи с этой ролью.</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setRoleId(1)}>Вернуться к администратору</Button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {denied ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
            <h1 className="text-xl font-semibold">Нет доступа к разделу</h1>
            <p className="text-sm text-muted-foreground">У роли «{role.name}» этот раздел закрыт. Если доступ нужен, попросите администратора изменить роль.</p>
            <Button asChild variant="outline"><NavLink to="/">На дашборд</NavLink></Button>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  )
}

function UserMenu() {
  const { role, setRoleId } = useApp()
  const devNotes = useDevNotes()
  const nav = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-1.5 text-nav">
          <Icon icon={UserIcon} />
          <span className="hidden sm:inline">admin</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">admin · {role.name}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => nav("/profile")}>Профиль и API-ключи</DropdownMenuItem>
        <DropdownMenuItem onClick={() => nav("/it-notes")}>Справка для IT</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={devNotes} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setDevNotes(!!v)}>Пометки для IT на страницах</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Смотреть как роль (демо прав)</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={String(role.id)} onValueChange={(v) => setRoleId(Number(v))}>
          {roles.map((r) => <DropdownMenuRadioItem key={r.id} value={String(r.id)}>{r.name}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>Выйти</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const TYPE_LABEL: Record<string, string> = {
  click: "Клик", campaign: "Кампании", stream: "Потоки", offer: "Офферы", landing: "Лендинги", affiliate_network: "Партнёрские сети",
  traffic_source: "Источники", domain: "Домены", user: "Пользователи",
}

const HIT_RESOURCE: Record<string, Resource> = {
  click: "clicks", campaign: "campaigns", stream: "campaigns", offer: "offers", landing: "landings",
  affiliate_network: "affiliate_networks", traffic_source: "traffic_sources", domain: "domains", user: "users",
}

function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState("")
  const nav = useNavigate()
  const { role } = useApp()
  const { data: raw = [] } = useQuery({ queryKey: ["search", q], queryFn: () => api.search(q), enabled: open && q.length > 0 })
  // Sections the role cannot open are not offered in search either.
  const data = raw.filter((h) => (role.access[HIT_RESOURCE[h.type]] ?? "none") !== "none")
  const groups = Object.entries(Object.groupBy(data, (h) => h.type))
  const go = (h: (typeof data)[number]) => {
    onOpenChange(false)
    setQ("")
    switch (h.type) {
      case "campaign": return nav(`/campaigns/${h.id}`)
      case "stream": return nav(`/campaigns/${h.campaign_id}?stream=${h.id}`)
      case "offer": return nav(`/offers?edit=${h.id}`)
      case "landing": return nav(`/landings?edit=${h.id}`)
      case "affiliate_network": return nav(`/affiliate-networks?edit=${h.id}`)
      case "domain": return nav(`/domains?edit=${h.id}`)
      case "traffic_source": return nav(`/traffic-sources?edit=${h.id}`)
      case "user": return nav(`/users?edit=${h.id}`)
      case "click": return nav(`/clicks?click=${h.name}&period=all_time`)
    }
  }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Поиск" description="Кампании, потоки, офферы, лендинги, партнёрки, источники, домены, пользователи, subid клика">
      {/* Results come filtered from the API, so cmdk's own filter is off. */}
      <Command shouldFilter={false}>
      <CommandInput placeholder="Название, ID или subid…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{q ? "Ничего не найдено" : "Начните вводить"}</CommandEmpty>
        {groups.map(([type, hits]) => (
          <CommandGroup key={type} heading={TYPE_LABEL[type]}>
            {hits!.map((h) => (
              <CommandItem key={`${h.type}-${h.id}`} value={`${h.type}-${h.id}-${h.name}`} onSelect={() => go(h)}>
                <span className="min-w-0 flex-1 truncate">
                  {h.name}
                  {h.hint && <span className="text-muted-foreground"> · {h.hint}</span>}
                </span>
                {h.type !== "click" && <span className="num text-xs text-muted-foreground">#{h.id}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
