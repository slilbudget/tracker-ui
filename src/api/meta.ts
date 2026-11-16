// Static dictionaries: stream filters / actions, report dimensions / metrics, labels.
// Mirrors what Keitaro returns from streamFilters.filters, streamActions.index, gridDefinition.
import type {
  AccessLevel,
  ConversionStatus,
  DateInterval,
  DimensionDef,
  MetricDef,
  ProblemKind,
  Resource,
  StreamActionDef,
  StreamFilterDef,
  StreamSchema,
  StreamType,
} from "./types"

export const COUNTRIES: { value: string; label: string }[] = [
  { value: "US", label: "США" },
  { value: "CA", label: "Канада" },
  { value: "BR", label: "Бразилия" },
  { value: "MX", label: "Мексика" },
  { value: "GB", label: "Великобритания" },
  { value: "DE", label: "Германия" },
  { value: "AU", label: "Австралия" },
  { value: "PH", label: "Филиппины" },
  { value: "AT", label: "Австрия" },
  { value: "IE", label: "Ирландия" },
  { value: "FR", label: "Франция" },
  { value: "IT", label: "Италия" },
  { value: "ES", label: "Испания" },
  { value: "PL", label: "Польша" },
]

export const US_STATES = [
  "Alabama", "Arizona", "Arkansas", "California", "Colorado", "Florida", "Georgia", "Idaho", "Indiana",
  "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Michigan", "Minnesota", "Mississippi", "Missouri",
  "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "Ohio", "Oklahoma",
  "Oregon", "South Dakota", "Texas", "Utah", "Washington", "West Virginia", "Wisconsin", "Wyoming",
]

// Regions an offer can be limited to, per country (US states, German Länder, provinces …). Names are what GeoIP returns.
export const REGIONS: Record<string, string[]> = {
  US: US_STATES,
  CA: ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan"],
  BR: ["Bahia", "Ceará", "Distrito Federal", "Goiás", "Minas Gerais", "Paraná", "Pernambuco", "Rio de Janeiro", "Rio Grande do Sul", "Santa Catarina", "São Paulo"],
  MX: ["Ciudad de México", "Estado de México", "Jalisco", "Nuevo León", "Puebla", "Veracruz", "Guanajuato", "Chihuahua", "Baja California", "Yucatán"],
  GB: ["England", "Scotland", "Wales", "Northern Ireland"],
  DE: ["Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen", "Hamburg", "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen", "Nordrhein-Westfalen", "Rheinland-Pfalz", "Saarland", "Sachsen", "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen"],
  AT: ["Burgenland", "Kärnten", "Niederösterreich", "Oberösterreich", "Salzburg", "Steiermark", "Tirol", "Vorarlberg", "Wien"],
  AU: ["Australian Capital Territory", "New South Wales", "Northern Territory", "Queensland", "South Australia", "Tasmania", "Victoria", "Western Australia"],
  IT: ["Lazio", "Lombardia", "Campania", "Sicilia", "Veneto", "Emilia-Romagna", "Piemonte", "Puglia", "Toscana", "Calabria"],
  ES: ["Andalucía", "Cataluña", "Comunidad de Madrid", "Comunidad Valenciana", "Galicia", "Castilla y León", "País Vasco", "Canarias", "Aragón", "Murcia"],
  FR: ["Île-de-France", "Auvergne-Rhône-Alpes", "Nouvelle-Aquitaine", "Occitanie", "Hauts-de-France", "Grand Est", "Provence-Alpes-Côte d'Azur", "Bretagne", "Normandie"],
  PL: ["Mazowieckie", "Śląskie", "Wielkopolskie", "Małopolskie", "Dolnośląskie", "Łódzkie", "Pomorskie", "Lubelskie"],
}
export const regionCountry = (r: string) => Object.entries(REGIONS).find(([, xs]) => xs.includes(r))?.[0]

const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }))

export const STREAM_FILTER_GROUPS: Record<StreamFilterDef["group"], string> = {
  geo: "Гео",
  device: "Устройство",
  traffic: "Трафик",
  parameters: "Параметры",
  time: "Время",
  other: "Прочее",
}

export const STREAM_FILTERS: StreamFilterDef[] = [
  { key: "country", name: "Страна", group: "geo", input: "list", options: COUNTRIES },
  { key: "region", name: "Регион / штат", group: "geo", input: "list", options: Object.entries(REGIONS).flatMap(([c, xs]) => xs.map((x) => ({ value: x, label: `${x} (${c})` }))) },
  { key: "city", name: "Город", group: "geo", input: "tags" },
  { key: "ip", name: "IP", group: "geo", input: "tags", hint: "Маски 1.2.3.*, диапазоны 1.2.3.1-1.2.3.50, CIDR" },
  { key: "ipv_6", name: "IPv6", group: "geo", input: "boolean" },
  { key: "isp", name: "Провайдер (ISP)", group: "geo", input: "tags" },
  { key: "operator", name: "Мобильный оператор", group: "geo", input: "tags" },
  { key: "proxy", name: "Прокси", group: "geo", input: "boolean" },
  { key: "bot", name: "Бот", group: "traffic", input: "boolean", hint: "По базе ботов трекера и бот-листам" },
  { key: "uniqueness", name: "Уникальность", group: "traffic", input: "list", options: [
    { value: "stream", label: "В потоке" }, { value: "campaign", label: "В кампании" }, { value: "global", label: "Во всех кампаниях" },
  ] },
  { key: "limit", name: "Лимит кликов", group: "traffic", input: "limit", hint: "В час / в сутки / всего" },
  { key: "device_type", name: "Тип устройства", group: "device", input: "list", options: [
    { value: "mobile", label: "Смартфон" }, { value: "tablet", label: "Планшет" }, { value: "desktop", label: "Компьютер" }, { value: "tv", label: "ТВ" },
  ] },
  { key: "os", name: "ОС", group: "device", input: "list", options: opts(["iOS", "Android", "Windows", "macOS", "Linux"]) },
  { key: "os_version", name: "Версия ОС", group: "device", input: "tags" },
  { key: "browser", name: "Браузер", group: "device", input: "list", options: opts(["Safari", "Chrome", "Facebook", "Instagram", "Samsung Internet", "Firefox"]) },
  { key: "browser_version", name: "Версия браузера", group: "device", input: "tags" },
  { key: "device_model", name: "Модель устройства", group: "device", input: "tags" },
  { key: "connection_type", name: "Тип подключения", group: "device", input: "list", options: opts(["wifi", "mobile", "cable", "dsl"]) },
  { key: "user_agent", name: "User-Agent", group: "device", input: "tags" },
  { key: "language", name: "Язык браузера", group: "device", input: "list", options: opts(["en", "es", "pt", "ru", "de", "fr"]) },
  { key: "referrer", name: "Реферер", group: "parameters", input: "tags" },
  { key: "empty_referrer", name: "Пустой реферер", group: "parameters", input: "boolean" },
  { key: "source", name: "Сайт-источник", group: "parameters", input: "tags" },
  { key: "keyword", name: "Ключевое слово", group: "parameters", input: "tags" },
  { key: "search_engine", name: "Поисковая система", group: "parameters", input: "tags" },
  { key: "ad_campaign_id", name: "ID рекламной кампании", group: "parameters", input: "tags" },
  { key: "creative_id", name: "ID креатива", group: "parameters", input: "tags" },
  { key: "x_requested_with", name: "X-Requested-With", group: "parameters", input: "tags" },
  { key: "parameter", name: "Любой параметр", group: "parameters", input: "text", hint: "имя=значение" },
  ...Array.from({ length: 30 }, (_, i): StreamFilterDef => ({
    key: `sub_id_${i + 1}`,
    name: `Sub ID ${i + 1}`,
    group: "parameters",
    input: "tags",
  })),
  { key: "interval", name: "Период дат", group: "time", input: "date_range" },
  { key: "schedule", name: "Расписание", group: "time", input: "schedule", hint: "Дни недели и часы" },
]

export const streamFilterDef = (key: string) => STREAM_FILTERS.find((f) => f.key === key)

export const STREAM_ACTIONS: StreamActionDef[] = [
  { key: "http", name: "HTTP-редирект (302)", kind: "redirect", field: "url", description: "Рекомендуется. Классический редирект" },
  { key: "meta", name: "Meta-редирект", kind: "redirect", field: "url", description: "Редирект через тег meta" },
  { key: "js", name: "JS-редирект", kind: "redirect", field: "url", description: "Редирект через JavaScript" },
  { key: "blank_referrer", name: "Без реферера", kind: "redirect", field: "url", description: "Редирект без передачи Referer" },
  { key: "double_meta", name: "Двойной meta", kind: "redirect", field: "url", description: "Редирект в 2 шага, скрывает источник" },
  { key: "curl", name: "CURL", kind: "redirect", field: "url", description: "Показывает страницу без видимого редиректа" },
  { key: "remote", name: "Remote", kind: "redirect", field: "url", description: "Загружает URL, ответ используется как адрес редиректа" },
  { key: "formsubmit", name: "Отправка формы", kind: "redirect", field: "url", description: "Редирект с передачей POST-данных" },
  { key: "iframe", name: "Iframe", kind: "redirect", field: "url", description: "Показывает страницу во фрейме" },
  { key: "campaign", name: "В другую кампанию", kind: "action", field: "campaign", description: "Без редиректа, клик учитывается в обеих" },
  { key: "status404", name: "Ошибка 404", kind: "action", field: null, description: "Белая страница с ошибкой 404" },
  { key: "show_text", name: "Показать текст", kind: "action", field: "text", description: "Показывает текст" },
  { key: "show_html", name: "Показать HTML", kind: "action", field: "text", description: "Показывает HTML-страницу" },
  { key: "do_nothing", name: "Ничего не делать", kind: "action", field: null, description: "Посетитель остаётся на месте" },
]

export const STREAM_TYPES: { value: StreamType; label: string; hint: string }[] = [
  { value: "forced", label: "Перехватывающий", hint: "Проверяется первым, до обычных потоков, вне весов" },
  { value: "regular", label: "Обычный", hint: "Участвует в распределении по весу" },
  { value: "default", label: "Замыкающий", hint: "Срабатывает, если ни один поток не подошёл" },
]

export const STREAM_SCHEMAS: { value: StreamSchema; label: string }[] = [
  { value: "landings", label: "Лендинги и офферы" },
  { value: "redirect", label: "Прямой URL" },
  { value: "action", label: "Действие" },
]

export const CONVERSION_STATUSES: { value: ConversionStatus; label: string }[] = [
  { value: "lead", label: "Лид (регистрация)" },
  { value: "sale", label: "Продажа (депозит)" },
  { value: "rejected", label: "Отклонено" },
  { value: "rebill", label: "Повторная выплата" },
  { value: "registration", label: "Регистрация" },
  { value: "deposit", label: "Депозит" },
]

// Why a deposit was rejected: the partners' own words (as in the PBI page «Срезы»), free text is allowed too.
export const REJECT_REASONS: { value: string; label: string }[] = [
  { value: "chargeback", label: "Чарджбэк" },
  { value: "multi-account", label: "Мультиаккаунт" },
  { value: "self-exclusion", label: "Самоисключение игрока" },
  { value: "KPI", label: "Не выполнен KPI" },
  { value: "post-click", label: "Post-click (деп вне окна)" },
  { value: "no spin", label: "Не играл после депа" },
  { value: "scam", label: "Фрод" },
  { value: "dolet", label: "Долёт" },
  { value: "after stops", label: "После стопа оффера" },
]
export const rejectReasonLabel = (v: string) => REJECT_REASONS.find((x) => x.value === v)?.label ?? v

// Checks of the «Проблемы» page: what each one watches and its threshold unit.
export const PROBLEM_KINDS: { kind: ProblemKind; name: string; hint: string; unit?: string; auto?: string }[] = [
  { kind: "no_postbacks", name: "Партнёрка молчит", hint: "Нет постбеков от партнёрки дольше обычного, хотя клики на её офферы идут", unit: "ч", auto: "Автоматически: по обычной конверсии партнёрки за 14 дней клики после последнего постбека должны были дать 3+ конверсии, а не пришло ни одной" },
  { kind: "fb_naming", name: "Неверный нейминг FB", hint: "Название кампании FB без ID кампании трекера или с ID не той кампании; в названии объявления неизвестный код подхода" },
  { kind: "spend_no_clicks", name: "Расход без кликов", hint: "Кампания FB тратит сегодня, а кликов по её объявлениям в трекере нет", unit: "$ расхода" },
  { kind: "clicks_no_ad", name: "Клики без меток FB", hint: "Доля кликов без ID объявления за 6 ч: макросы FB не подставляются", unit: "% кликов" },
  { kind: "no_spend", name: "Нет расходов", hint: "Клики за сутки есть, расхода нет: сборщик не загрузил кабинеты" },
  { kind: "postback_out", name: "Исходящие постбеки", hint: "Ошибки отправки в пиксель / SKAK за 24 ч", unit: "ошибок" },
  { kind: "cap_full", name: "Капа без запасного", hint: "Капа оффер-группы отлита, запасных офферов нет" },
  { kind: "terms_end", name: "Заканчиваются условия", hint: "До конца периода условий осталось мало дней, следующего нет", unit: "дн." },
  { kind: "spend_diff", name: "Нераспределённый расход", hint: "Расход кабинета, который не привязался к кампаниям трекера, больше порога кабинета" },
  { kind: "account_error", name: "Ошибка API кабинета", hint: "Последний запрос к FB API по кабинету вернул ошибку: метрики и баланс не обновляются" },
  { kind: "domain", name: "Домены", hint: "Домен не работает или без SSL" },
]

export const DATE_INTERVALS: { value: DateInterval; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "yesterday", label: "Вчера" },
  { value: "7_days_ago", label: "Последние 7 дней" },
  { value: "first_day_of_this_week", label: "Эта неделя" },
  { value: "first_day_of_this_month", label: "Этот месяц" },
  { value: "previous_month", label: "Прошлый месяц" },
  { value: "1_month_ago", label: "Последние 30 дней" },
  { value: "all_time", label: "Всё время" },
  { value: "custom", label: "Выбрать даты" },
]

export const DIMENSIONS: DimensionDef[] = [
  { key: "campaign", name: "Кампания", group: "campaign" },
  { key: "stream", name: "Поток", group: "campaign" },
  { key: "landing", name: "Лендинг", group: "campaign" },
  { key: "offer_group", name: "Оффер-группа", group: "campaign" },
  { key: "offer", name: "Оффер", group: "campaign" },
  { key: "affiliate_network", name: "Партнёрская сеть", group: "campaign" },
  { key: "product", name: "Продукт", group: "campaign" },
  { key: "ts", name: "Источник", group: "campaign" },
  { key: "team", name: "Команда", group: "campaign" },
  { key: "buyer", name: "Байер", group: "campaign" },
  { key: "approach", name: "Подход", group: "campaign" },
  { key: "agency", name: "Провайдер кабинета", group: "facebook" },
  { key: "fb_account", name: "Кабинет FB", group: "facebook" },
  { key: "fb_campaign", name: "Кампания FB", group: "facebook" },
  { key: "fb_adset", name: "Адсет FB", group: "facebook" },
  { key: "fb_ad", name: "Объявление FB", group: "facebook" },
  { key: "country", name: "Страна", group: "geo" },
  { key: "region", name: "Регион / штат", group: "geo" },
  { key: "city", name: "Город", group: "geo" },
  { key: "device_type", name: "Тип устройства", group: "device" },
  { key: "os", name: "ОС", group: "device" },
  { key: "browser", name: "Браузер", group: "device" },
  { key: "connection_type", name: "Подключение", group: "device" },
  { key: "sub_id_1", name: "Рекламный кабинет", group: "params" },
  { key: "sub_id_2", name: "Плейсмент", group: "params" },
  { key: "sub_id_3", name: "ID группы объявлений", group: "params" },
  { key: "sub_id_4", name: "Группа объявлений", group: "params" },
  { key: "sub_id_5", name: "Пиксель", group: "params" },
  { key: "sub_id_6", name: "ID объявления", group: "params" },
  { key: "external_id", name: "External ID", group: "params" },
  { key: "reject_reason", name: "Причина отклонения", group: "other" },
  { key: "day", name: "День", group: "time" },
  { key: "hour", name: "Час", group: "time" },
  { key: "weekday", name: "День недели", group: "time" },
  { key: "month", name: "Месяц", group: "time" },
]

export const METRICS: MetricDef[] = [
  { key: "impressions", name: "Показы (из FB)", short: "Показы", format: "int", group: "traffic" },
  { key: "clicks", name: "Клики", format: "int", group: "traffic" },
  { key: "campaign_unique_clicks", name: "Инсталлы (уникальные клики)", short: "Инсталлы", format: "int", group: "traffic" },
  { key: "bots", name: "Боты", format: "int", group: "traffic" },
  { key: "lp_clicks", name: "Клики по лендингу", short: "Клики LP", format: "int", group: "traffic" },
  { key: "lp_ctr", name: "CTR лендинга", short: "LP CTR", format: "percent", group: "rates" },
  { key: "leads", name: "Лиды (реги, включая ставшие депами)", short: "Лиды", format: "int", group: "conversions" },
  { key: "sales", name: "Продажи (депы)", short: "Продажи", format: "int", group: "conversions" },
  { key: "rejected", name: "Отклонённые", short: "Откл.", format: "int", group: "conversions" },
  { key: "ctr", name: "CTR объявления, показ → клик", short: "CTR", format: "percent", group: "rates" },
  { key: "c2i", name: "Клик → инсталл (c2i)", short: "c2i", format: "percent", group: "rates" },
  { key: "i2r", name: "Инсталл → рег (i2r)", short: "i2r", format: "percent", group: "rates" },
  { key: "cr", name: "CR, клик → рег", short: "CR", format: "percent", group: "rates" },
  { key: "crs", name: "CR, клик → деп", short: "CR деп", format: "percent", group: "rates" },
  { key: "approve", name: "Рег → деп (r2d)", short: "r2d", format: "percent", group: "rates" },
  { key: "i2d", name: "Инсталлов на один деп (i2d)", short: "i2d", format: "decimal", group: "rates" },
  { key: "cost", name: "Расход", format: "money", group: "money" },
  { key: "cost_fee", name: "Расход с комиссией агентства", short: "Расход+%", format: "money", group: "money" },
  { key: "revenue", name: "Доход (все)", short: "Доход", format: "money", group: "money" },
  { key: "sale_revenue", name: "Доход (подтверждённый)", short: "Доход подтв.", format: "money", group: "money" },
  { key: "profit", name: "Прибыль (все)", short: "Прибыль", format: "money", group: "money", signed: true },
  { key: "profit_confirmed", name: "Прибыль (подтверждённая)", short: "Прибыль подтв.", format: "money", group: "money", signed: true },
  { key: "profit_fee", name: "Прибыль с комиссией агентства", short: "Прибыль+%", format: "money", group: "money", signed: true },
  { key: "rejected_revenue", name: "Отклонённая сумма", short: "Откл. сумма", format: "money", group: "money" },
  { key: "roi", name: "ROI (все)", short: "ROI", format: "percent", group: "rates", signed: true },
  { key: "roi_confirmed", name: "ROI (подтверждённый)", short: "ROI подтв.", format: "percent", group: "rates", signed: true },
  { key: "roi_fee", name: "ROI с комиссией агентства", short: "ROI+%", format: "percent", group: "rates", signed: true },
  { key: "epc_confirmed", name: "EPC (подтверждённый)", short: "EPC подтв.", format: "money", group: "rates" },
  { key: "uepc", name: "Доход на инсталл (uEPC)", short: "uEPC", format: "money", group: "rates" },
  { key: "cpm", name: "Цена 1000 показов (CPM)", short: "CPM", format: "money", group: "rates" },
  { key: "cpc", name: "Цена клика (CPC)", short: "CPC", format: "money", group: "rates" },
  { key: "install_cost", name: "Цена инсталла", short: "Цена инст.", format: "money", group: "rates" },
  { key: "cpa", name: "Цена рега (CPL)", short: "CPL", format: "money", group: "rates" },
  { key: "cps", name: "Цена депа (CPS)", short: "CPS", format: "money", group: "rates" },
  { key: "avg_sale", name: "Средняя выплата за продажу", short: "Ср. выплата", format: "money", group: "rates" },
]

export const METRIC_GROUPS: { key: MetricDef["group"]; name: string }[] = [
  { key: "traffic", name: "Трафик" },
  { key: "conversions", name: "Конверсии" },
  { key: "money", name: "Деньги" },
  { key: "rates", name: "Показатели" },
]

// Ready column sets in every «Колонки» menu: what each part of the team looks at.
// `chart`: the same set cut to 5 metrics for trends (one chart per metric).
export const METRIC_PRESETS: { name: string; hint: string; keys: string[]; chart: string[] }[] = [
  { name: "Основные", hint: "Байер: каждый день", keys: ["clicks", "leads", "sales", "cost", "profit_confirmed", "roi_confirmed"], chart: ["clicks", "leads", "sales", "cost", "profit_confirmed"] },
  { name: "Воронка", hint: "Байер, тимлид: где теряется трафик", keys: ["clicks", "campaign_unique_clicks", "bots", "lp_ctr", "leads", "sales", "rejected", "cr", "approve", "cpa", "cps"], chart: ["clicks", "leads", "sales", "cr", "approve"] },
  { name: "Facebook", hint: "Как доска FacebookNew в Power BI", keys: ["impressions", "clicks", "campaign_unique_clicks", "leads", "sales", "ctr", "c2i", "i2r", "approve", "i2d", "cost_fee", "sale_revenue", "profit_fee", "roi_fee", "uepc", "cpm", "cpc", "install_cost", "cpa", "cps"], chart: ["cost_fee", "campaign_unique_clicks", "sales", "roi_fee", "cpm"] },
  { name: "Финансы", hint: "Финансист: деньги и окупаемость", keys: ["sales", "cost", "revenue", "sale_revenue", "profit", "profit_confirmed", "roi_confirmed", "avg_sale"], chart: ["cost", "revenue", "sale_revenue", "profit_confirmed", "roi_confirmed"] },
]

export const metricDef = (key: string) => METRICS.find((m) => m.key === key)
export const dimensionDef = (key: string) => DIMENSIONS.find((d) => d.key === key)

export const RESOURCES: { key: Resource; name: string; section: string }[] = [
  { key: "dashboard", name: "Дашборд", section: "Статистика" },
  { key: "reports", name: "Отчёты", section: "Статистика" },
  { key: "clicks", name: "Лог кликов", section: "Статистика" },
  { key: "conversions", name: "Лог конверсий", section: "Статистика" },
  { key: "trends", name: "Тренды", section: "Статистика" },
  { key: "campaigns", name: "Кампании", section: "Трафик" },
  { key: "streams", name: "Потоки", section: "Трафик" },
  { key: "landings", name: "Лендинги", section: "Трафик" },
  { key: "offers", name: "Офферы и оффер-группы", section: "Трафик" },
  { key: "offer_swap", name: "Замена офферов в кампаниях", section: "Трафик" },
  { key: "ad_accounts", name: "Рекламные кабинеты", section: "Трафик" },
  { key: "affiliate_networks", name: "Партнёрские сети", section: "Трафик" },
  { key: "traffic_sources", name: "Источники", section: "Трафик" },
  { key: "domains", name: "Домены", section: "Трафик" },
  { key: "postbacks", name: "Постбеки", section: "Система" },
  { key: "integrations", name: "Интеграции", section: "Система" },
  { key: "users", name: "Пользователи и роли", section: "Система" },
  { key: "settings", name: "Настройки", section: "Система" },
  { key: "logs", name: "Журнал действий", section: "Система" },
  { key: "archive", name: "Архив", section: "Система" },
  { key: "problems", name: "Проблемы и мониторинг", section: "Система" },
]

export const ACCESS_LEVELS: { value: AccessLevel; label: string; hint: string }[] = [
  { value: "none", label: "Нет доступа", hint: "Раздел скрыт" },
  { value: "read", label: "Просмотр", hint: "Видит всё, ничего не меняет" },
  { value: "own", label: "Свои", hint: "Видит и меняет только созданное им" },
  { value: "groups", label: "Группы", hint: "Видит и меняет выбранные группы" },
  { value: "full", label: "Полный", hint: "Видит и меняет всё" },
]

export const TIMEZONES = ["Europe/London", "UTC", "Europe/Warsaw", "Europe/Moscow", "America/New_York", "America/Los_Angeles"]
export const CURRENCIES = ["USD", "EUR", "BRL", "RUB"]
