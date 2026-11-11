// Deterministic fake data. All names are fictional. Replaced by the real API later.
import type {
  AffiliateNetwork,
  ApiKey,
  AuditEntry,
  Approach,
  Campaign,
  Click,
  Conversion,
  Domain,
  FbAd,
  AdAccountAssignment,
  AdProvider,
  FbAdAccount,
  FbAdset,
  FbCampaign,
  FbDayStat,
  Group,
  Integration,
  Landing,
  Offer,
  OfferGroup,
  OfferTerm,
  PostbackLogEntry,
  Resource,
  AccessLevel,
  Role,
  Settings,
  Stream,
  TrafficSource,
  User,
} from "@/api/types"
import { REJECT_REASONS, US_STATES } from "@/api/meta"

// Outgoing conversions to the ad network pixel (Conversions API) are shown as capi:// placeholders.
const CAPI = "capi://"

// mulberry32
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const r = rng(20261109)
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
const between = (a: number, b: number) => a + Math.floor(r() * (b - a + 1))
const hex = (n: number) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("")

const NOW = new Date()
const iso = (d: Date) => d.toISOString()
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000)

// ---------- groups & users ----------

const BUYERS = ["a_volkov", "d_sokolov", "m_orlova", "k_lebedev", "n_kozlova", "p_morozov", "s_novikov", "t_fedorova"]

export const groups: Group[] = [
  ...BUYERS.map((b, i): Group => ({ id: i + 1, name: b, type: "campaigns", position: i })),
  { id: 30, name: "US прелендинги", type: "landings", position: 0 },
  { id: 31, name: "BR прелендинги", type: "landings", position: 1 },
  { id: 40, name: "Основные", type: "domains", position: 0 },
  { id: 41, name: "Резерв", type: "domains", position: 1 },
]

const ALL: Resource[] = [
  "dashboard", "campaigns", "streams", "landings", "offers", "offer_swap", "affiliate_networks", "traffic_sources", "domains",
  "reports", "clicks", "conversions", "trends", "postbacks", "integrations", "users", "settings", "logs", "archive", "problems", "ad_accounts",
]
const access = (def: AccessLevel, over: Partial<Record<Resource, AccessLevel>> = {}) =>
  Object.fromEntries(ALL.map((k) => [k, over[k] ?? def])) as Record<Resource, AccessLevel>

export const roles: Role[] = [
  { id: 1, name: "Администратор", description: "Полный доступ ко всему трекеру", access: access("full"), hidden_metrics: [], system: true },
  {
    id: 2, name: "Тимлид", description: "Управляет кампаниями и сплитом своей команды", system: false, hidden_metrics: [],
    access: access("groups", { offers: "full", offer_swap: "groups", affiliate_networks: "full", landings: "full", users: "read", settings: "none", logs: "read", integrations: "read", archive: "read" }),
  },
  {
    id: 3, name: "Байер", description: "Свои кампании и статистика, офферы только просмотр", system: false, hidden_metrics: [],
    access: access("own", { dashboard: "own", offers: "read", offer_swap: "none", affiliate_networks: "read", landings: "read", traffic_sources: "read", domains: "read", postbacks: "own", conversions: "read", integrations: "none", users: "none", settings: "none", logs: "none", archive: "none", trends: "own" }),
  },
  {
    id: 4, name: "Финансы", description: "Вся статистика без права изменений", system: false, hidden_metrics: [],
    access: access("read", { offer_swap: "read", users: "none", settings: "none", integrations: "none", archive: "none" }),
  },
  {
    id: 5, name: "Стажёр", description: "Свои кампании, без денег партнёрок", system: false, hidden_metrics: ["revenue", "sale_revenue", "profit", "profit_confirmed", "profit_fee", "roi", "roi_confirmed", "roi_fee", "epc_confirmed", "uepc", "avg_sale", "rejected_revenue"],
    access: access("own", { offers: "read", offer_swap: "none", ad_accounts: "none", conversions: "read", affiliate_networks: "none", landings: "read", traffic_sources: "none", domains: "none", postbacks: "none", integrations: "none", users: "none", settings: "none", logs: "none", archive: "none" }),
  },
]

const NAMES: Record<string, string> = {
  a_volkov: "Алексей Волков", d_sokolov: "Дмитрий Соколов", m_orlova: "Мария Орлова", k_lebedev: "Кирилл Лебедев",
  n_kozlova: "Наталья Козлова", p_morozov: "Павел Морозов", s_novikov: "Сергей Новиков", t_fedorova: "Татьяна Фёдорова",
}

export const users: User[] = [
  { id: 1, login: "admin", name: "Администратор", role_id: 1, team: "—", state: "active", timezone: "Europe/London", language: "ru", group_ids: [], last_login_at: iso(daysAgo(0.1)), created_at: iso(daysAgo(200)), two_factor: true },
  { id: 2, login: "lead_alpha", name: "Игорь Смирнов", role_id: 2, team: "Alpha", state: "active", timezone: "Europe/London", language: "ru", group_ids: [1, 2, 3, 4], last_login_at: iso(daysAgo(0.3)), created_at: iso(daysAgo(150)), two_factor: true },
  { id: 3, login: "lead_bravo", name: "Ольга Кузнецова", role_id: 2, team: "Bravo", state: "active", timezone: "Europe/Warsaw", language: "ru", group_ids: [5, 6, 7, 8], last_login_at: iso(daysAgo(1.2)), created_at: iso(daysAgo(140)), two_factor: false },
  { id: 4, login: "finance", name: "Елена Попова", role_id: 4, team: "—", state: "active", timezone: "Europe/London", language: "ru", group_ids: [], last_login_at: iso(daysAgo(2)), created_at: iso(daysAgo(120)), two_factor: true },
  ...BUYERS.map((b, i): User => ({
    id: 10 + i, login: b, name: NAMES[b], role_id: i === 7 ? 5 : 3, team: i < 4 ? "Alpha" : "Bravo",
    state: i === 6 ? "disabled" : "active", timezone: "Europe/London", language: "ru", group_ids: [i + 1],
    last_login_at: i === 6 ? iso(daysAgo(40)) : iso(daysAgo(r() * 3)), created_at: iso(daysAgo(between(20, 180))), two_factor: r() > 0.4,
  })),
]

export const apiKeys: ApiKey[] = [
  { id: 1, user_id: 1, name: "Сводная таблица", prefix: "trk_9f2c", created_at: iso(daysAgo(60)), last_used_at: iso(daysAgo(0.01)) },
  { id: 2, user_id: 1, name: "Загрузка расходов FB", prefix: "trk_41ab", created_at: iso(daysAgo(45)), last_used_at: iso(daysAgo(0.05)) },
  { id: 3, user_id: 15, name: "Скрипт запуска", prefix: "trk_c07e", created_at: iso(daysAgo(12)), last_used_at: iso(daysAgo(1)) },
]

// ---------- sources, networks, offers, landings ----------

export const trafficSources: TrafficSource[] = [
  {
    id: 1, name: "Facebook", state: "active", template_name: "facebook", traffic_loss: 0, notes: "",
    postback_url: `${CAPI}{sub_id_5}/Purchase`, postback_statuses: ["sale"],
    parameters: [
      { name: "sub_id_1", alias: "Кабинет", placeholder: "{{account.id}}" },
      { name: "sub_id_2", alias: "Плейсмент", placeholder: "{{placement}}" },
      { name: "sub_id_3", alias: "ID группы", placeholder: "{{adset.id}}" },
      { name: "sub_id_4", alias: "Группа", placeholder: "{{adset.name}}" },
      { name: "sub_id_6", alias: "ID объявления", placeholder: "{{ad.id}}" },
    ],
    created_at: iso(daysAgo(200)), updated_at: iso(daysAgo(10)),
  },
  {
    id: 2, name: "PWA-магазин", state: "active", template_name: "pwa", traffic_loss: 0, notes: "Трафик из PWA-приложений",
    postback_url: "https://skak.example/postback?click_id={external_id}&event={status}&value={revenue}", postback_statuses: ["lead", "sale"],
    parameters: [{ name: "external_id", alias: "Click ID PWA", placeholder: "{clickId}" }, { name: "sub_id_5", alias: "Пиксель", placeholder: "{fbp}" }],
    created_at: iso(daysAgo(180)), updated_at: iso(daysAgo(30)),
  },
  {
    id: 3, name: "TikTok", state: "disabled", template_name: "tiktok", traffic_loss: 0, notes: "Пока не используется",
    postback_url: "", postback_statuses: ["sale"], parameters: [], created_at: iso(daysAgo(90)), updated_at: iso(daysAgo(90)),
  },
]

const NETWORKS = [
  "NorthPeak Partners", "Bluewave Affiliates", "Crown Media", "Silverline", "Arcadia Network", "Delta Leads",
  "OrbitAds", "Harbor Partners", "Summit CPA", "Vertex Club",
]
export const affiliateNetworks: AffiliateNetwork[] = NETWORKS.map((name, i) => ({
  id: i + 1, name, state: i === 9 ? "disabled" : "active",
  offer_param: "sub1={subid}&sub2={sub_id_6}&click_id={external_id}",
  postback_url: `https://trk.example.com/7f3a9c/postback?subid={sub1}&status={status}&payout={payout}`,
  notes: i === 0 ? "Прямой рекламодатель, выплаты по понедельникам" : "",
  created_at: iso(daysAgo(between(60, 200))), updated_at: iso(daysAgo(between(1, 50))),
}))

const BRANDS = ["LuckyRiver", "GoldPeak", "StarSpin", "RoyalBay", "BlueAce", "WildMint", "JackpotHill"]
// States of the restricted («только NY, NJ, OH») offer variants
export const RESTRICTED_STATES = ["New York", "New Jersey", "Ohio"]
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const monthStart = (shift: number) => new Date(NOW.getFullYear(), NOW.getMonth() + shift, 1)
const monthEnd = (shift: number) => new Date(NOW.getFullYear(), NOW.getMonth() + shift + 1, 0)
const offerBase = {
  state: "active" as const, offer_type: "external" as const, action_type: "http", payout_type: "CPA" as const, payout_currency: "USD",
  payout_auto: false, payout_upsell: false, regions: [] as string[], conversion_cap_enabled: false, daily_cap: 0,
  conversion_timezone: "Europe/London", alternative_offer_id: null, notes: "",
}

export const offers: Offer[] = []
export const offerGroups: OfferGroup[] = []
{
  let id = 800
  let gid = 0
  let termId = 0
  const term = (shift: number, payouts: Record<string, number>, caps: OfferTerm["caps"]): OfferTerm =>
    ({ id: ++termId, from: ymd(monthStart(shift)), to: ymd(monthEnd(shift)), caps, payouts })
  const group = (name: string, network: number, product: string, offerIds: number[], extra: Partial<OfferGroup> = {}) => {
    const cur = Object.fromEntries(offerIds.map((o) => [String(o), offers.find((x) => x.id === o)!.payout_value]))
    const prev = Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, v - 10]))
    const g: OfferGroup = {
      id: ++gid, name, state: "active", affiliate_network_id: network, product,
      terms: [term(-1, prev, [{ metric: "ftd", window: "term", value: 250 }]), term(0, cur, [{ metric: "ftd", window: "term", value: 300 }])],
      fallback_offer_ids: [], cap_timezone: "UTC", alert_at: [80, 100], alert_chat: "Капы | алерты", notes: "",
      created_at: iso(daysAgo(between(40, 150))), updated_at: iso(daysAgo(between(0, 10))), ...extra,
    }
    offerGroups.push(g)
    for (const o of offerIds) offers.find((x) => x.id === o)!.group_id = g.id
    return g
  }
  for (let n = 0; n < NETWORKS.length; n++) {
    const brands = BRANDS.filter((_, i) => (i + n) % 3 !== 0).slice(0, between(2, 3))
    for (const b of brands) {
      const payout = pick([150, 160, 165, 170, 175, 180])
      const net = NETWORKS[n].split(" ")[0]
      const main = ++id
      offers.push({
        ...offerBase, id: main, name: `US | PWA/iOS | ${net} | ${b}(RF)`, state: n === 9 ? "disabled" : "active",
        group_id: null, affiliate_network_id: n + 1, url: `https://go.${b.toLowerCase()}.example/c/${hex(6)}?sub1={subid}`,
        payout_value: payout, country: ["US"], created_at: iso(daysAgo(between(20, 150))), updated_at: iso(daysAgo(between(0, 20))),
      })
      const ids = [main]
      // every third product also has a link only for NY / NJ / OH at a higher rate
      if (n < 9 && (n + b.length) % 3 === 0) {
        ids.push(++id)
        offers.push({
          ...offerBase, id, name: `US | PWA/iOS | ${net} | ${b}(RF) | NY-NJ-OH`, group_id: null, affiliate_network_id: n + 1,
          url: `https://go.${b.toLowerCase()}.example/c/${hex(6)}?sub1={subid}`, payout_value: payout + 15, country: ["US"],
          regions: RESTRICTED_STATES, created_at: iso(daysAgo(between(20, 90))), updated_at: iso(daysAgo(between(0, 20))),
        })
      }
      group(`${b} · ${net}`, n + 1, b, ids, n === 9 ? { state: "disabled", terms: [] } : {})
    }
  }
  offers.push({
    ...offerBase, id: 950, name: "BR | PWA | Arcadia | RoletaSol", group_id: null, affiliate_network_id: 5,
    url: "https://go.roletasol.example/c/77aa?sub1={subid}", payout_value: 45, country: ["BR"], conversion_timezone: "UTC",
    created_at: iso(daysAgo(60)), updated_at: iso(daysAgo(30)),
  })
  group("RoletaSol · Arcadia", 5, "RoletaSol", [950])
  // Europe goes to many countries at once with different rates; Tier-3 is uncapped with a daily limit.
  offers.push(
    { ...offerBase, id: 960, name: "EU | PWA | Crown | StarSpin | DE-AT", group_id: null, affiliate_network_id: 3,
      url: "https://go.starspin.example/c/de01?sub1={subid}", payout_value: 210, country: ["DE", "AT"],
      created_at: iso(daysAgo(25)), updated_at: iso(daysAgo(5)) },
    { ...offerBase, id: 961, name: "EU | PWA | Crown | StarSpin | GB-IE", group_id: null, affiliate_network_id: 3,
      url: "https://go.starspin.example/c/gb01?sub1={subid}", payout_value: 190, country: ["GB", "IE"],
      created_at: iso(daysAgo(25)), updated_at: iso(daysAgo(5)) },
    { ...offerBase, id: 962, name: "T3 | PWA | Crown | StarSpin | PH-MX", group_id: null, affiliate_network_id: 3,
      url: "https://go.starspin.example/c/t301?sub1={subid}", payout_value: 35, country: ["PH", "MX"],
      created_at: iso(daysAgo(25)), updated_at: iso(daysAgo(5)) },
  )
  group("StarSpin EU · Crown", 3, "StarSpin", [960, 961])
  const t3 = group("StarSpin Tier-3 · Crown", 3, "StarSpin", [962])
  for (const t of t3.terms) t.caps = [{ metric: "ftd", window: "day", value: 40 }]
}

export const landings: Landing[] = [
  ["US | Vegas bonus", 30], ["US | Vegas bonus 2", 30], ["US | Vegas bonus 3", 30], ["US | Blue Clean", 30],
  ["US | Wheel spin", 30], ["US | Scratch card", 30], ["BR | Roleta", 31], ["US | Blue Clean (копия)", 30],
].map(([name, g], i) => ({
  id: [128, 160, 161, 94, 132, 144, 210, 95][i], name: name as string, state: i === 7 ? "disabled" : "active",
  landing_type: (i % 3 === 2 ? "external" : "local") as Landing["landing_type"], action_type: "local_file",
  url: i % 3 === 2 ? `https://pre.example.net/${hex(5)}/` : "", group_id: g as number, notes: "",
  created_at: iso(daysAgo(between(20, 120))), updated_at: iso(daysAgo(between(0, 15))),
}))

// ---------- domains ----------

export const domains: Domain[] = [
  "go.trfx-one.com", "b.trfx-two.com", "click.northlane.io", "t.bluepath.net", "r.quickhop.xyz", "track.amberline.co",
  "go.redmaple.app", "l.stillwater.site",
].map((name, i) => ({
  id: i + 1, name, group_id: i < 5 ? 40 : 41,
  status: (i === 5 ? "error" : i === 6 ? "awaiting_dns" : i === 7 ? "requesting_cert" : "ok") as Domain["status"],
  is_ssl: i < 6, ssl_redirect: i < 5, allow_indexing: false, catch_not_found: i === 0, default_campaign_id: null,
  campaigns_count: 0, dns_provider: i % 2 ? "Cloudflare" : "Namecheap",
  error_description: i === 5 ? "DNS указывает на другой сервер" : "", notes: "",
  next_check_at: iso(new Date(NOW.getTime() + between(5, 50) * 60000)), created_at: iso(daysAgo(between(5, 200))),
}))

// ---------- campaigns & streams ----------

const fbParams = trafficSources[0].parameters
export const campaigns: Campaign[] = []
export const streams: Stream[] = []

let streamId = 3630000
function makeStreams(c: Campaign, count: number, geo: "US" | "BR") {
  const pool = offers.filter((o) => o.country.includes(geo) && o.state === "active" && !o.regions.length)
  streams.push(baseStream(c, "forced", "Боты → 404", 0, {
    schema: "action", action_type: "status404", filters: [{ name: "bot", mode: "accept", payload: ["1"] }], landings: [], offers: [],
  }))
  const active = Math.min(count, pool.length)
  const weighted = new Set(Array.from({ length: Math.min(5, active) }, () => between(0, active - 1)))
  for (let i = 0; i < active; i++) {
    const o = pool[i]
    const net = affiliateNetworks.find((n) => n.id === o.affiliate_network_id)!
    const brand = o.name.split(" | ")[3]
    const w = weighted.has(i) ? pick([10, 15, 20, 25, 30]) : 0
    streams.push(baseStream(c, "regular", `${geo} | ${net.name.split(" ")[0]} | ${brand}_land`, w, {
      filters: [{ name: "country", mode: "accept", payload: [geo] }],
      landings: geo === "US"
        ? [{ landing_id: 128, share: 50, state: "active" }, { landing_id: 160, share: 25, state: "active" }, { landing_id: 161, share: 25, state: "active" }]
        : [{ landing_id: 210, share: 100, state: "active" }],
      offers: [{ offer_id: o.id, share: 100, state: "active" }],
      state: r() > 0.92 ? "disabled" : "active",
    }))
  }
  // NY / NJ / OH: a stream with several offers and a state filter (the restricted link + the general one)
  if (geo === "US") {
    for (const ro of offers.filter((o) => o.regions.length && o.state === "active").slice(0, 2)) {
      const general = offers.find((o) => o.group_id === ro.group_id && !o.regions.length)!
      const brand = ro.name.split(" | ")[3]
      streams.push(baseStream(c, "regular", `US | NY-NJ-OH | ${brand}_mix`, pick([10, 15]), {
        filters: [{ name: "country", mode: "accept", payload: ["US"] }, { name: "region", mode: "accept", payload: [...RESTRICTED_STATES] }],
        landings: [{ landing_id: 128, share: 100, state: "active" }],
        offers: [{ offer_id: ro.id, share: 60, state: "active" }, { offer_id: general.id, share: 40, state: "active" }],
      }))
    }
  }
  streams.push(baseStream(c, "default", "Остальной трафик → белая страница", 0, {
    schema: "redirect", action_type: "http", action_payload: "https://white.example.org/", landings: [], offers: [], filters: [],
  }))
}
function baseStream(c: Campaign, type: Stream["type"], name: string, weight: number, extra: Partial<Stream>): Stream {
  const pos = streams.filter((s) => s.campaign_id === c.id).length + 1
  return {
    id: ++streamId, campaign_id: c.id, type, name, position: pos, weight, state: "active", collect_clicks: true,
    schema: "landings", action_type: "http", action_payload: "", filter_or: false, filters: [], landings: [], offers: [],
    offer_selection: "before_click", comments: "", updated_at: iso(daysAgo(r() * 10)), ...extra,
  }
}

export const approaches: Approach[] = [
  { id: 1, name: "NEURO", code: "NEURO", description: "Нейросетевые крео: сгенерированные ролики и картинки", created_by: 2, created_at: iso(daysAgo(90)) },
  { id: 2, name: "EDIT", code: "EDIT", description: "Монтаж из готовых видео", created_by: 2, created_at: iso(daysAgo(90)) },
  { id: 3, name: "UGC", code: "UGC", description: "Ролики от лица игрока", created_by: 3, created_at: iso(daysAgo(60)) },
  { id: 4, name: "STORY", code: "STORY", description: "Истории в формате сторис", created_by: 13, created_at: iso(daysAgo(20)) },
]
const CAMPAIGN_DEFS: [string, number, "US" | "BR", Campaign["state"], string][] = [
  ["US | a_volkov | NEURO | iOS/PWA", 0, "US", "active", "NEURO"],
  ["US | d_sokolov | EDIT | iOS/PWA", 1, "US", "active", "EDIT"],
  ["US | m_orlova | NEURO | iOS/PWA", 2, "US", "active", "NEURO"],
  ["US | k_lebedev | UGC | iOS/PWA", 3, "US", "active", "UGC"],
  ["US | n_kozlova | EDIT | iOS/PWA", 4, "US", "active", "EDIT"],
  ["US | p_morozov | NEURO | iOS/PWA", 5, "US", "active", "NEURO"],
  ["BR | a_volkov | NEURO | PWA", 0, "BR", "disabled", "NEURO"],
  ["US | s_novikov | EDIT | iOS/PWA", 6, "US", "disabled", "EDIT"],
  ["US | t_fedorova | UGC | test", 7, "US", "active", "UGC"],
]
CAMPAIGN_DEFS.forEach(([name, b, geo, state, approach], i) => {
  const c: Campaign = {
    id: 2552 + i * 7, name, alias: hex(8), state, type: "weight", bind_visitors: "slo", group_id: b + 1,
    traffic_source_id: 2, domain_id: (i % 2) + 1, cost_type: "CPC", cost_value: 0, cost_currency: "USD", cost_auto: false,
    traffic_loss: 0, uniqueness_method: "ip_ua", uniqueness_use_cookies: true, cookies_ttl: 1440, token: hex(16),
    parameters: [
      ...fbParams,
      { name: "sub_id_5", alias: "Пиксель", placeholder: "{fbp}" },
      { name: "external_id", alias: "Click ID PWA", placeholder: "{clickId}" },
    ],
    postbacks: [
      { id: i * 10 + 2, method: "GET", statuses: ["lead", "sale"], url: "https://hooks.example.com/team?subid={subid}&status={status}&payout={revenue}" },
    ],
    notes: i === 0 ? "Основная кампания команды. Веса меняет только тимлид." : "",
    owner_id: 10 + b, approach, is_template: false, template_id: null, created_at: iso(daysAgo(between(30, 120))), updated_at: iso(daysAgo(r() * 3)),
  }
  campaigns.push(c)
  makeStreams(c, geo === "US" ? between(12, 22) : 1, geo)
})
// Reference campaign: streams and offers are set up here once and copied into the linked campaigns.
{
  const base = campaigns[0]
  const t: Campaign = {
    ...structuredClone(base), id: 2700, name: "US | ЭТАЛОН | iOS/PWA", alias: hex(8), state: "active", group_id: null, owner_id: 2, approach: "",
    is_template: true, template_id: null, notes: "Эталон для US-кампаний. Менять потоки здесь, потом «Применить к кампаниям».",
    created_at: iso(daysAgo(100)), updated_at: iso(daysAgo(0.5)),
  }
  campaigns.push(t)
  makeStreams(t, 22, "US")
  for (const c of campaigns) if (c.name.startsWith("US |") && !c.is_template && c.state === "active") c.template_id = t.id
  // linked campaigns were copied from the reference: same streams, own weights; a few already differ
  const tpl = streams.filter((x) => x.campaign_id === t.id)
  campaigns.filter((c) => c.template_id === t.id).forEach((c, i) => {
    for (let k = streams.length - 1; k >= 0; k--) if (streams[k].campaign_id === c.id) streams.splice(k, 1)
    for (const x of tpl) {
      if (i === 1 && x === tpl[4]) continue // added to the reference after this campaign was synced
      const copy: Stream = { ...structuredClone(x), id: ++streamId, campaign_id: c.id, weight: x.type === "regular" && r() < 0.3 ? pick([10, 15, 20, 25, 30]) : 0 }
      if (i === 3 && x === tpl[2]) copy.landings = [{ landing_id: 94, share: 100, state: "active" }] // the buyer changed a landing
      streams.push(copy)
    }
  })
}
for (const d of domains) d.campaigns_count = campaigns.filter((c) => c.domain_id === d.id).length

// ---------- Facebook: ad accounts › campaigns › ad sets › ads (what the spend collector loads) ----------

// Providers: agencies rent accounts for a % of spend, the farm is ours. Names are fictional.
export const adProviders: AdProvider[] = [
  { id: 1, name: "Agent Nova", fee: 6, self_made: false, group_name: "Agent Nova" },
  { id: 2, name: "Agent Orbit", fee: 7, self_made: false, group_name: "Agent Orbit" },
  { id: 3, name: "Peak Agency", fee: 8, self_made: false, group_name: "Peak Agency" },
  { id: 4, name: "Farm · A", fee: 4.5, self_made: true, group_name: "Наш фарм" },
  { id: 5, name: "Farm · B", fee: 4.5, self_made: true, group_name: "Наш фарм" },
  { id: 6, name: "Без комиссии", fee: 0, self_made: false, group_name: "Прочие" },
]
export const fbAccounts: FbAdAccount[] = []
export const adAssignments: AdAccountAssignment[] = []
// current buyer / provider / fee of an account = its open assignment (the API calls this after every change)
export function syncAccount(a: FbAdAccount) {
  const cur = adAssignments.find((x) => x.account_id === a.id && x.date_to == null)
  const p = adProviders.find((x) => x.id === (cur?.provider_id ?? a.provider_id))
  a.buyer_id = cur?.buyer_id ?? null
  a.agency = p?.name ?? "—"
  a.agency_fee = cur?.provider_fee ?? p?.fee ?? 0
}
// fee and provider on a given day (YYYY-MM-DD): the assignment of that day, else the account default
export function accountOnDay(accountId: string, day: string) {
  const a = adAssignments.find((x) => x.account_id === accountId && x.date_from <= day && (x.date_to == null || day <= x.date_to))
  const acc = fbAccounts.find((x) => x.id === accountId)
  const p = adProviders.find((x) => x.id === (a?.provider_id ?? acc?.provider_id))
  return { buyer_id: a?.buyer_id ?? null, provider: p?.name ?? "—", fee: a?.provider_fee ?? p?.fee ?? 0 }
}
export const fbCampaigns: FbCampaign[] = []
export const fbAdsets: FbAdset[] = []
export const fbAds: FbAd[] = []
export const fbStats: FbDayStat[] = []
// tracker campaign → the FB ads whose links point to it (where the click really lands, whatever the naming says)
const adsByCampaign = new Map<number, FbAd[]>()
const fbDate = (d: Date) => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`
{
  const TEAM_PROVIDER: Record<string, number> = { Alpha: 1, Bravo: 2 }
  const account = (id: string, name: string, provider: number, n: number, extra: Partial<FbAdAccount> = {}): FbAdAccount => {
    const p = adProviders.find((x) => x.id === provider)!
    return {
      id, name, buyer_id: null, agency: p.name, agency_fee: p.fee, provider_id: provider,
      api_token: `EAAU${hex(6).toUpperCase()}x${hex(10)}ZBR${hex(8)}`, proxy: `${hex(4)}:${hex(6)}@px${n % 5 + 1}.proxy.example:${8000 + n}`,
      active: true, last_error: "", currency: "USD", timezone: "America/Los_Angeles",
      created_at: iso(daysAgo(30 + (n * 7) % 60)), handed_at: iso(daysAgo(20 + (n * 5) % 40)),
      total_spend: 0, spend_diff: 0, spend_offset: 0, spend_diff_comment: "", alert_on_spend_diff: 50,
      fb_balance: 0, balance_checked_at: iso(daysAgo(0.02 + (n % 4) * 0.01)), disabled_at: null, watchdog_control: n % 3 === 0, multi_geo: n % 5 === 0,
      ...extra,
    }
  }
  let n = 0
  let asg = 0
  for (const u of users.filter((x) => x.role_id === 3 || x.role_id === 5)) {
    for (let k = 1; k <= 3; k++) {
      const provider = k === 3 ? 4 + (u.id % 2) : TEAM_PROVIDER[u.team] ?? 1
      const a = account(`act_${u.id}${k}0${between(1000, 9999)}`, `${u.login}-0${k}`, provider, ++n)
      fbAccounts.push(a)
      const from = a.handed_at.slice(0, 10)
      // every 4th account worked for another buyer first, then was handed over
      if (n % 4 === 0) {
        const prev = users.find((x) => (x.role_id === 3 || x.role_id === 5) && x.id !== u.id)!
        const mid = iso(daysAgo(12)).slice(0, 10)
        adAssignments.push({ id: ++asg, account_id: a.id, buyer_id: prev.id, provider_id: provider, provider_fee: null, date_from: from, date_to: iso(daysAgo(13)).slice(0, 10) })
        adAssignments.push({ id: ++asg, account_id: a.id, buyer_id: u.id, provider_id: provider, provider_fee: provider === 1 ? 5 : null, date_from: mid, date_to: null })
      } else {
        adAssignments.push({ id: ++asg, account_id: a.id, buyer_id: u.id, provider_id: provider, provider_fee: null, date_from: from, date_to: null })
      }
    }
  }
  // free accounts waiting for a buyer, one switched off, one with a dead token
  fbAccounts.push(
    account("act_90010001", "free-nova-01", 1, ++n, { handed_at: iso(daysAgo(2)), fb_balance: 0 }),
    account("act_90010002", "free-nova-02", 1, ++n, { handed_at: iso(daysAgo(2)) }),
    account("act_90020001", "free-farm-01", 4, ++n, { handed_at: iso(daysAgo(1)) }),
    account("act_90030001", "peak-old-01", 3, ++n, { active: false, disabled_at: iso(daysAgo(6)), last_error: "(#200) Ad account has been disabled", handed_at: iso(daysAgo(50)) }),
  )
  for (const a of fbAccounts) syncAccount(a)
  // s_novikov's first account: the token died (FB returns an auth error), balance is stale
  {
    const a = fbAccounts.find((x) => x.name === "s_novikov-01")
    if (a) Object.assign(a, { last_error: "Error validating access token: Session has expired", balance_checked_at: iso(daysAgo(1.6)) })
  }
  let launch = 1900
  let adNo = 0
  campaigns.filter((c) => !c.is_template).forEach((c, ci) => {
    const owner = users.find((u) => u.id === c.owner_id)!
    const accs = fbAccounts.filter((a) => a.buyer_id === owner.id)
    const geo = c.name.slice(0, 2)
    const ads: FbAd[] = []
    for (let n = 0; n < 4; n++) {
      const acc = accs[n % 2]
      const brand = pick(BRANDS)
      const created = daysAgo(between(1, 40))
      const state = geo === "US" ? pick(["OH", "NY", "TX", "FL", "AL"]) : "SP"
      let prefix = `${c.id} | `
      // wrong naming: no tracker id (d_sokolov) / the id of another campaign (k_lebedev)
      if (ci === 1 && n === 2) prefix = ""
      if (ci === 3 && n === 1) prefix = `${campaigns[0].id} | `
      const fc: FbCampaign = {
        id: `1202${between(10000000, 99999999)}${n}`, account_id: acc.id, created_at: iso(created),
        name: `${prefix}${fbDate(created)} | ${++launch} | ${state} | ${brand} | ${owner.login} | V${between(1, 3)} | ${c.approach}`,
      }
      fbCampaigns.push(fc)
      for (let a = 1; a <= 2; a++) {
        const set: FbAdset = { id: `${fc.id}${a}`, campaign_id: fc.id, name: `${owner.login} | ${brand} | ${state} ${a} | V1` }
        fbAdsets.push(set)
        for (let m = 1; m <= between(2, 3); m++) {
          const ad: FbAd = {
            id: `${set.id}${m}`, adset_id: set.id,
            name: `EN-${owner.team.slice(0, 3).toUpperCase()}-${between(100, 199)}-${c.approach}-${state}-${brand.toUpperCase()}-${String(++adNo).padStart(3, "0")}`,
          }
          fbAds.push(ad)
          ads.push(ad)
        }
      }
    }
    adsByCampaign.set(c.id, ads)
  })
}

// p_morozov's buyer typed the approach wrong in one ad name
{
  const ad = fbAds.find((x) => x.name.includes("-NEURO-") && adsByCampaign.get(campaigns[5].id)?.includes(x))
  if (ad) ad.name = ad.name.replace("-NEURO-", "-NEURAL-")
}

// ---------- clicks & conversions ----------

const OSES = [["iOS", "Safari", "iPhone"], ["iOS", "Facebook", "iPhone"], ["Android", "Chrome", "Samsung Galaxy"], ["iOS", "Instagram", "iPhone"]] as const
const CITIES: Record<string, string[]> = {
  Alabama: ["Montgomery", "Birmingham"], Texas: ["Houston", "Dallas"], "New York": ["Buffalo", "Syracuse"],
  Florida: ["Tampa", "Miami"], Ohio: ["Dayton", "Columbus"], Oklahoma: ["Norman", "Tulsa"],
}

export const clicks: Click[] = []
export const conversions: Conversion[] = []
{
  const live = streams.filter((s) => s.type === "regular" && s.state === "active")
  const byCampaign = new Map<number, Stream[]>()
  for (const s of live) byCampaign.set(s.campaign_id, [...(byCampaign.get(s.campaign_id) ?? []), s])
  const quality = new Map(live.map((s) => [s.id, 0.4 + r() * 1.4]))
  const landingQ: Record<number, number> = { 128: 1.25, 160: 0.95, 161: 0.9, 94: 0.7, 210: 1 }
  let seq = 0
  for (let day = 44; day >= 0; day--) {
    for (const c of campaigns) {
      if (c.is_template) continue
      const ss = byCampaign.get(c.id)
      if (!ss?.length) continue
      const vol = c.state === "active" || day > 20 ? between(60, 190) : 0
      for (let k = 0; k < vol; k++) {
        const s = pickWeighted(ss)
        const t = new Date(daysAgo(day).getTime() - r() * 86400000 * (day === 0 ? 0.6 : 1))
        if (t > NOW) continue
        const geo = s.filters.find((f) => f.name === "country")?.payload[0] ?? "US"
        const regionFilter = s.filters.find((f) => f.name === "region")?.payload
        const region = regionFilter ? pick(regionFilter) : geo === "US" ? pick(US_STATES.slice(0, 20)) : pick(["São Paulo", "Rio de Janeiro", "Bahia"])
        const [os, browser, model] = pick(OSES)
        const lid = s.landings.length ? pickShare(s.landings.map((l) => [l.landing_id, l.share])) : null
        const allowed = s.offers.filter((x) => {
          const o = offers.find((y) => y.id === x.offer_id)
          return x.state === "active" && o && (!o.country.length || o.country.includes(geo)) && (!o.regions.length || o.regions.includes(region))
        })
        const oid = allowed.length ? pickShare(allowed.map((x) => [x.offer_id, x.share])) : null
        const isBot = r() < 0.03
        const lp = !isBot && r() < 0.72
        const cost = isBot ? 0 : 0.6 + r() * 1.6
        const subId = `${hex(8)}${(++seq).toString(36)}`
        const ad = pick(adsByCampaign.get(c.id)!)
        const set = fbAdsets.find((x) => x.id === ad.adset_id)!
        const acct = fbCampaigns.find((x) => x.id === set.campaign_id)!.account_id
        // n_kozlova's links lost the FB macros a few hours ago (no ad id on the click)
        const lost = c.id === campaigns[4].id && t.getTime() > NOW.getTime() - 5 * 3600000
        clicks.push({
          sub_id: subId, datetime: iso(t), campaign_id: c.id, stream_id: s.id, landing_id: lid, offer_id: lp ? oid : null,
          ts_id: c.traffic_source_id, ip: `${between(23, 199)}.${between(1, 254)}.${between(1, 254)}.${between(1, 254)}`,
          country: geo, region, city: pick(CITIES[region] ?? ["—"]), os, browser, device_type: "mobile", device_model: model,
          connection_type: r() > 0.4 ? "wifi" : "mobile", is_bot: isBot, is_unique_campaign: r() > 0.35, is_unique_stream: r() > 0.3,
          lp_clicked: lp, cost: Math.round(cost * 100) / 100, external_id: hex(12),
          sub_id_1: lost ? "" : acct, sub_id_2: lost ? "" : pick(["Facebook_Mobile_Feed", "Instagram_Stories", "Facebook_Stories", "Instagram_Feed"]),
          sub_id_3: lost ? "" : set.id, sub_id_4: lost ? "" : set.name, sub_id_5: `${between(10, 99)}${hex(6)}`,
          sub_id_6: lost ? "" : ad.id, buyer_id: c.owner_id,
        })
        if (lp && oid) {
          const q = (quality.get(s.id) ?? 1) * (landingQ[lid ?? 0] ?? 1)
          if (r() < 0.12 * q) {
            const ct = new Date(t.getTime() + between(2, 90) * 60000)
            if (ct > NOW) continue
            const offer = offers.find((o) => o.id === oid)!
            const sale = r() < 0.17 * q
            const zeroPay = sale && r() < 0.04
            // ~7% of deposits are rejected later by the partner (finance loads the list with a reason)
            const rejected = sale && !zeroPay && r() < 0.07
            conversions.push({
              conversion_id: hex(16), sub_id: subId, campaign_id: c.id, stream_id: s.id, landing_id: lid, offer_id: oid,
              click_datetime: iso(t), postback_datetime: iso(ct), status: rejected ? "rejected" : sale ? "sale" : "lead",
              original_status: rejected ? "rejected" : sale ? "dep" : "reg",
              previous_status: rejected ? "sale" : sale ? "lead" : null, revenue: sale && !zeroPay && !rejected ? offer.payout_value : 0, tid: hex(10),
              reject_reason: rejected ? pick(REJECT_REASONS).value : "", rejected_revenue: rejected ? offer.payout_value : 0,
            })
          } else if (r() < 0.004) {
            conversions.push({
              conversion_id: hex(16), sub_id: subId, campaign_id: c.id, stream_id: s.id, landing_id: lid, offer_id: oid,
              click_datetime: iso(t), postback_datetime: iso(new Date(t.getTime() + 3600000)), status: "rejected",
              original_status: "fraud", previous_status: "lead", revenue: 0, tid: hex(10), reject_reason: "scam", rejected_revenue: 0,
            })
          }
        }
      }
    }
  }
  clicks.sort((a, b) => (a.datetime < b.datetime ? 1 : -1))
  // Harbor Partners stopped sending postbacks 20 hours ago (their side is down)
  const silent = offers.filter((o) => o.affiliate_network_id === 8).map((o) => o.id)
  for (let k = conversions.length - 1; k >= 0; k--) {
    const cv = conversions[k]
    if (cv.offer_id != null && silent.includes(cv.offer_id) && NOW.getTime() - new Date(cv.postback_datetime).getTime() < 20 * 3600000) conversions.splice(k, 1)
  }
  conversions.sort((a, b) => (a.postback_datetime < b.postback_datetime ? 1 : -1))
  // the spend collector has not loaded t_fedorova's accounts since yesterday: her clicks carry no cost
  for (const ck of clicks) if (ck.campaign_id === campaigns[8].id && NOW.getTime() - new Date(ck.datetime).getTime() < 30 * 3600000) ck.cost = 0
  // FB daily stats per ad (UTC day): spend = what the clicks carry, impressions from a CTR of 2–5%
  const agg = new Map<string, { n: number; spend: number }>()
  for (const ck of clicks) {
    if (!ck.sub_id_6) continue
    const key = `${ck.sub_id_6}|${ck.datetime.slice(0, 10)}`
    const a = agg.get(key) ?? { n: 0, spend: 0 }
    a.n++
    a.spend += ck.cost
    agg.set(key, a)
  }
  for (const [key, a] of agg) {
    const [ad_id, day] = key.split("|")
    fbStats.push({ ad_id, day, impressions: Math.round(a.n * (20 + r() * 30)), spend: Math.round(a.spend * 100) / 100 })
  }
  // account money: spend from FB stats; spend_diff = what FB billed but no tracker campaign took (seeded per account)
  {
    const accOfAd = new Map<string, string>()
    for (const ad of fbAds) {
      const set = fbAdsets.find((x) => x.id === ad.adset_id)!
      accOfAd.set(ad.id, fbCampaigns.find((x) => x.id === set.campaign_id)!.account_id)
    }
    const spend = new Map<string, number>()
    for (const st of fbStats) spend.set(accOfAd.get(st.ad_id)!, (spend.get(accOfAd.get(st.ad_id)!) ?? 0) + st.spend)
    fbAccounts.forEach((a, i) => {
      a.spend_diff = i === 4 ? 86.4 : i === 9 ? 31.7 : Math.round((i % 6) * 0.37 * 100) / 100
      a.total_spend = Math.round(((spend.get(a.id) ?? 0) + a.spend_diff) * 100) / 100
      a.fb_balance = a.active ? Math.round((40 + ((i * 37) % 260)) * 100) / 100 : 0
    })
    if (fbAccounts[4]) fbAccounts[4].spend_diff_comment = ""
    if (fbAccounts[9]) Object.assign(fbAccounts[9], { spend_diff_comment: "Тест креативов без ссылки трекера, согласовано", alert_on_spend_diff: 100 })
  }
  // a campaign launched today that spends but sends no clicks (wrong link in the ad)
  {
    const c = campaigns[2]
    const acc = fbAccounts.find((a) => a.buyer_id === c.owner_id)!
    const fc: FbCampaign = { id: "120299990001", account_id: acc.id, created_at: iso(daysAgo(0.3)), name: `${c.id} | ${fbDate(NOW)} | 2051 | TX | GoldPeak | m_orlova | V1 | NEURO` }
    const set: FbAdset = { id: "1202999900011", campaign_id: fc.id, name: "m_orlova | GoldPeak | TX 1 | V1" }
    fbCampaigns.push(fc)
    fbAdsets.push(set)
    for (const m of [1, 2]) {
      const ad: FbAd = { id: `${set.id}${m}`, adset_id: set.id, name: `EN-ALP-177-NEURO-TX-GOLDPEAK-90${m}` }
      fbAds.push(ad)
      fbStats.push({ ad_id: ad.id, day: NOW.toISOString().slice(0, 10), impressions: 2100 + m * 340, spend: 18.4 + m * 6.1 })
    }
  }
}
{
  const today = ymd(NOW)
  const live = offerGroups.filter((g) => g.state === "active" && g.terms.length)
  // fullest first: two reached, two near, the rest comfortable
  const targets = [1, 0.88, 0.84, 0.55, 0.42, 0.63, 0.3, 0.48, 0.71, 0.37, 0.5, 0.58, 0.27, 0.66, 0.44, 0.39, 0.52, 0.6, 0.33, 0.45]
  live.forEach((g, i) => {
    const t = g.terms.find((x) => x.from <= today && today <= x.to)
    if (!t) return
    const ids = new Set(offers.filter((o) => o.group_id === g.id).map((o) => o.id))
    const from = new Date(`${t.from}T00:00:00`)
    const sales = conversions.filter((cv) => cv.status === "sale" && cv.offer_id != null && ids.has(cv.offer_id) && new Date(cv.postback_datetime) >= from).length
    if (!sales) return
    const target = targets[i] ?? 0.3 + (i % 5) * 0.08
    for (const cap of t.caps) if (cap.window === "term") cap.value = target >= 1 ? sales : Math.max(sales + 1, Math.ceil(sales / target))
  })
  // one group capped by installs, one with a fallback offer
  if (live[2]) live[2].terms.at(-1)!.caps.push({ metric: "install", window: "term", value: 2500 })
  if (live[0]) live[0].fallback_offer_ids = [live[3], live[5]].map((g) => offers.find((o) => o.group_id === g?.id && !o.regions.length)?.id).filter((x): x is number => x != null)
}
function pickWeighted(ss: Stream[]) {
  const total = ss.reduce((a, s) => a + s.weight + 1.5, 0)
  let x = r() * total
  for (const s of ss) if ((x -= s.weight + 1.5) <= 0) return s
  return ss[0]
}
function pickShare(xs: [number, number][]) {
  const total = xs.reduce((s, [, w]) => s + w, 0)
  let x = r() * total
  for (const [v, w] of xs) if ((x -= w) <= 0) return v
  return xs[0][0]
}

// ---------- postback log ----------

export const postbackLog: PostbackLogEntry[] = []
{
  let id = 1
  for (const cv of conversions.slice(0, 600)) {
    const offer = offers.find((o) => o.id === cv.offer_id)
    const ignored = r() < 0.01
    postbackLog.push({
      id: id++, direction: "in", datetime: cv.postback_datetime, affiliate_network_id: offer?.affiliate_network_id ?? null,
      campaign_id: cv.campaign_id, sub_id: cv.sub_id, status: cv.original_status, payout: cv.revenue,
      url: `/7f3a9c/postback?subid=${cv.sub_id}&status=${cv.original_status}&payout=${cv.revenue}&tid=${cv.tid}`,
      http_code: 200, result: ignored ? "ignored" : "ok",
      message: ignored ? "Неизвестный статус «chargeback»" : cv.status === "sale" && cv.revenue === 0 ? "Выплата 0 — проверьте партнёрку" : "",
      attempts: 1,
    })
    if (cv.status === "sale") {
      // d_sokolov's pixel token expired yesterday: all his deposits since then fail to reach the pixel
      const expired = cv.campaign_id === campaigns[1].id && NOW.getTime() - new Date(cv.postback_datetime).getTime() < 20 * 3600000
      const fail = expired || r() < 0.06
      postbackLog.push({
        id: id++, direction: "out", datetime: new Date(new Date(cv.postback_datetime).getTime() + 4000).toISOString(),
        affiliate_network_id: null, campaign_id: cv.campaign_id, sub_id: cv.sub_id, status: "sale", payout: cv.revenue,
        url: `${CAPI}${hex(15)}/Purchase`, http_code: fail ? 400 : 200,
        result: fail ? (r() > 0.5 ? "retrying" : "error") : "ok",
        message: fail ? "Invalid OAuth access token — токен пикселя истёк" : "", attempts: fail ? between(2, 5) : 1,
      })
    }
  }
  postbackLog.push({
    id: id++, direction: "in", datetime: iso(daysAgo(0.2)), affiliate_network_id: 4, campaign_id: null, sub_id: "unknown123",
    status: "sale", payout: 170, url: "/7f3a9c/postback?subid=unknown123&status=sale&payout=170", http_code: 200, result: "error",
    message: "Клик с таким subid не найден", attempts: 1,
  })
  postbackLog.sort((a, b) => (a.datetime < b.datetime ? 1 : -1))
}

// ---------- integrations, audit, settings ----------

export const integrations: Integration[] = [
  { id: 3, kind: "facebook_conversions", name: "Purchase в пиксели", state: "active", campaign_ids: campaigns.map((c) => c.id), ad_account_id: "", pixel_id: "по sub_id_5", update_every_min: 0, last_sync_at: iso(daysAgo(0.005)), last_error: "" },
  { id: 4, kind: "cloudflare", name: "DNS доменов", state: "paused", campaign_ids: [], ad_account_id: "", pixel_id: "", update_every_min: 60, last_sync_at: iso(daysAgo(2)), last_error: "" },
]

export const audit: AuditEntry[] = Array.from({ length: 60 }, (_, i): AuditEntry => {
  const u = pick(users.filter((x) => x.state === "active"))
  const s = pick(streams.filter((x) => x.type === "regular"))
  const kinds: [AuditEntry["action"], Resource, string][] = [
    ["update", "streams", `Вес потока «${s.name}» изменён на ${s.weight}%`],
    ["update", "campaigns", `Изменены настройки кампании «${campaigns.find((c) => c.id === s.campaign_id)?.name}»`],
    ["create", "offers", `Создан оффер «${pick(offers).name}»`],
    ["update", "offers", `Выплата оффера изменена на ${pick([160, 170, 180])}$`],
    ["login", "dashboard", "Вход в трекер"],
    ["delete", "streams", `Поток «${s.name}» перемещён в архив`],
  ]
  const [action, resource, summary] = pick(kinds)
  return { id: 1000 - i, datetime: iso(daysAgo(i * 0.15 + r() * 0.1)), user_id: u.id, action, resource, resource_id: s.id, summary, ip: `91.${between(1, 254)}.${between(1, 254)}.${between(1, 254)}` }
})

export const settings: Settings = {
  currency: "USD", timezone: "Europe/London", postback_key: "7f3a9c", s2s_timeout_sec: 5, statistics_retention_days: 365,
  archive_retention_days: 60, allow_indexing_default: false,
  global_aliases: { keyword: ["keyword", "utm_term"], external_id: ["external_id", "clickid", "click_id"] },
}

export const CURRENT_USER_ID = 1
