// «Для IT»: how a feature works from the business side, shown next to the feature and collected on /it-notes.
// The owner hands this to the backend team. Toggle in the user menu (per browser).
import { useSyncExternalStore } from "react"
import { Link } from "react-router"
import { Page, PageHeader } from "@/components/page"
import { cn } from "@/lib/utils"

export interface DevNoteDef { title: string; where: { label: string; href: string }; text: string[] }

export const NOTES = {
  offer_geo: {
    title: "Гео оффера: страны и регионы",
    where: { label: "Офферы → оффер → Гео", href: "/offers" },
    text: [
      "Гео оффера — ограничение маршрутизации, а не подпись. Отдельный поток под штаты/регионы не создаётся, фильтр по штатам в потоке не нужен.",
      "При клике поток выбирает оффер по долям только среди своих офферов, у которых разрешены страна и регион клика (регион — по GeoIP трекера). Доли остальных пересчитываются пропорционально.",
      "Если в потоке нет ни одного разрешённого оффера для этого клика, поток считается не подошедшим: клик идёт в следующий поток по порядку, в конце — в замыкающий.",
      "Пример: в потоке оффер «только NY, NJ, OH» 60% и общий 40%. Клик из Огайо: 60/40. Клик из Техаса: 100% на общий.",
      "Замена оффера: если старый был ограничен по штатам, а в потоке стоял фильтр по штатам только ради него — замена предлагает убрать фильтр. Если новый оффер ограничен, клики из других регионов уйдут на остальные офферы потока или в следующий поток — предпросмотр замены это показывает.",
    ],
  },
  caps: {
    title: "Капы оффер-группы",
    where: { label: "Офферы → Оффер-группы и капы", href: "/offer-groups" },
    text: [
      "Капа живёт на оффер-группе и считается по всем кампаниям компании. У оффера своей капы нет: другая капа — другая группа.",
      "FTD — продажи (sale) офферов группы с начала периода условий или с начала дня. Инсталл — уникальный клик кампании, ушедший на оффер группы. День — в часовом поясе капы группы (по умолчанию UTC).",
      "Капа проверяется при каждом клике. Любая капа отлита → клики, которые шли бы на офферы группы, идут на первый оффер цепочки запасных, у которого капа ещё есть. Запасных нет → трафик продолжает идти на оффер, а в «Проблемы» уходит критичная.",
      "Алерт в Telegram — один раз на каждый порог (50/80/90/100%) за период.",
      "Ставка фиксирована на период условий; деп получает ставку периода, в который пришёл постбек.",
    ],
  },
  s2s_default: {
    title: "S2S-постбек: по умолчанию из источника трафика",
    where: { label: "Источники → источник → S2S-постбек", href: "/traffic-sources" },
    text: [
      "Основной исходящий постбек (пиксель FB через CAPI, SKAK) задаётся один раз в источнике трафика и уходит по конверсиям всех кампаний с этим источником, только с отмеченными статусами (обычно — продажа).",
      "Постбеки во вкладке кампании — дополнительные (вебхук команды и т.п.). Кампания видит постбек источника, но не меняет его.",
      "Если URL постбека кампании совпадает с URL источника, отправлять один раз. Повторы при ошибке — до 5 попыток, результат в разделе «Постбеки».",
    ],
  },
  tracking_link: {
    title: "Трекинг-ссылка кампании",
    where: { label: "Кампания → Ссылка кампании", href: "/campaigns" },
    text: [
      "Ссылка = домен + идентификатор кампании + параметры кампании (имя_параметра=макрос источника), собирается сразу целиком. Байер вставляет её в объявление как есть.",
      "Без параметров у клика не будет ID объявления: расход не привяжется к кликам (проверка «Клики без меток FB»).",
    ],
  },
  approaches: {
    title: "Подходы и нейминг объявлений",
    where: { label: "Настройки → Подходы", href: "/settings" },
    text: [
      "Справочник подходов общий на компанию. Байер может добавить новый подход прямо при создании кампании; удалить или переименовать — админ.",
      "У подхода есть код. Код — часть стандартного нейминга объявлений (шаблон в настройках). По коду в названии объявления трекер относит объявление к подходу в отчётах.",
      "Кампания = подход + гео + байер. Неизвестный код в названии объявления → проблема «Неверный нейминг FB».",
    ],
  },
  ad_accounts: {
    title: "Рекламные кабинеты, закрепление, провайдеры",
    where: { label: "Кабинеты", href: "/ad-accounts" },
    text: [
      "Три сущности: кабинет (ID, токен API, прокси, валюта, часовой пояс, баланс, статус), закрепление за байером на период (с–по, комиссия провайдера %) и провайдер (агент или наш фарм, комиссия по умолчанию).",
      "Расход кабинета за день относится к байеру, за которым кабинет был закреплён в этот день. Комиссия для «Спэнд+%» берётся из закрепления этого дня, если там пусто — из провайдера.",
      "Нераспределённый расход (spend diff) = расход кабинета из FB API − расход, привязанный к кампаниям трекера по ID объявлений, + ручная поправка (spend offset). Больше порога «алерт» → проблема и Telegram.",
      "active = false: метрики и баланс не парсим, алерты не шлём. disabled_at ставится при выключении. watchdog_control — кабинет под автоправилами. multi_geo — кабинет льёт на несколько гео.",
      "Токен API и прокси видят и меняют только админы; в списке токен скрыт.",
    ],
  },
} satisfies Record<string, DevNoteDef>
export type NoteId = keyof typeof NOTES

const KEY = "trk.devnotes"
const listeners = new Set<() => void>()
const read = () => { try { return localStorage.getItem(KEY) !== "0" } catch { return true } }
export function setDevNotes(on: boolean) {
  try { localStorage.setItem(KEY, on ? "1" : "0") } catch { /* private mode */ }
  listeners.forEach((l) => l())
}
export const useDevNotes = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, read)

// Collapsed by default: one line «Для IT: <title>», the text opens on click.
export function DevNote({ id, className }: { id: NoteId; className?: string }) {
  const on = useDevNotes()
  if (!on) return null
  const n: DevNoteDef = NOTES[id]
  return (
    <details className={cn("rounded-md border border-dashed px-3 py-2 text-sm", className)}>
      <summary className="cursor-pointer text-muted-foreground">
        <span className="mr-1.5 rounded-sm border px-1 text-xs">Для IT</span>{n.title}
      </summary>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
        {n.text.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </details>
  )
}

export default function DevNotesPage() {
  return (
    <Page>
      <PageHeader title="Справка для IT">
        <p className="text-sm text-muted-foreground">Как работают функции с бизнес-стороны. Те же пометки стоят рядом с функциями (переключатель «Пометки для IT» в меню пользователя).</p>
      </PageHeader>
      <div className="flex max-w-4xl flex-col gap-4">
        {(Object.values(NOTES) as DevNoteDef[]).map((n) => (
          <section key={n.title} className="rounded-md border p-4">
            <h2 className="font-semibold">{n.title}</h2>
            <Link to={n.where.href} className="text-sm text-link">{n.where.label}</Link>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {n.text.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  )
}
