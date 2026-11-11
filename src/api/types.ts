// Domain model of the tracker. Field names follow the Keitaro Admin API where one exists,
// so the backend can map 1:1. This file is the frontend side of the API contract.

export type ID = number
type ISODate = string // "2026-11-09T14:03:00Z"

type EntityState = "active" | "disabled" | "deleted"

export type GroupType = "campaigns" | "offers" | "landings" | "domains"
export interface Group {
  id: ID
  name: string
  type: GroupType
  position: number
}

// ---------- Campaigns ----------

export type RotationType = "position" | "weight"
type BindVisitors = null | "s" | "sl" | "slo" // flow / flow+landing / flow+landing+offer
export type CostType = "CPC" | "CPUC" | "CPM" | "CPA" | "CPS" | "RevShare"
type UniquenessMethod = "ip" | "ip_ua" | "cookies" | "parameter"

export interface CampaignParameter {
  name: string // sub_id_1, keyword, external_id ...
  alias: string // name shown in reports, e.g. "Ad ID"
  placeholder: string // token from the traffic source, e.g. {{ad.id}}
}

export interface S2SPostback {
  id: ID
  method: "GET" | "POST"
  statuses: ConversionStatus[]
  url: string
}

export interface Campaign {
  id: ID
  name: string
  alias: string
  state: EntityState
  type: RotationType
  bind_visitors: BindVisitors
  group_id: ID | null
  traffic_source_id: ID | null
  domain_id: ID | null
  cost_type: CostType
  cost_value: number
  cost_currency: string
  cost_auto: boolean
  traffic_loss: number
  uniqueness_method: UniquenessMethod
  uniqueness_use_cookies: boolean
  cookies_ttl: number // hours
  token: string
  parameters: CampaignParameter[]
  postbacks: S2SPostback[]
  notes: string
  owner_id: ID
  // Подход (creative approach, e.g. NEURO / EDIT): a campaign = approach + geo + buyer
  approach: string
  // Reference («эталонная») campaign: its streams are copied into the campaigns linked to it.
  is_template: boolean
  template_id: ID | null // the reference campaign this one follows
  created_at: ISODate
  updated_at: ISODate
}

// ---------- Streams (flows) ----------

export type StreamType = "forced" | "regular" | "default"
export type StreamSchema = "landings" | "redirect" | "action"
type OfferSelection = "before_click" | "after_click"

export interface StreamFilter {
  name: string // filter type key, see StreamFilterDef.key
  mode: "accept" | "reject"
  payload: string[]
}

interface StreamLanding {
  landing_id: ID
  share: number // percent inside the stream
  state: "active" | "disabled"
}
export interface StreamOffer {
  offer_id: ID
  share: number
  state: "active" | "disabled"
}

export interface Stream {
  id: ID
  campaign_id: ID
  type: StreamType
  name: string
  position: number
  weight: number
  state: EntityState
  collect_clicks: boolean
  schema: StreamSchema
  action_type: string // http, meta, js, campaign, status404, show_text ...
  action_payload: string
  filter_or: boolean
  filters: StreamFilter[]
  landings: StreamLanding[]
  offers: StreamOffer[]
  offer_selection: OfferSelection
  comments: string
  updated_at: ISODate
}

export interface StreamFilterDef {
  key: string
  name: string
  group: "geo" | "device" | "traffic" | "parameters" | "time" | "other"
  input: "list" | "text" | "tags" | "number" | "date_range" | "schedule" | "limit" | "boolean"
  options?: { value: string; label: string }[]
  hint?: string
}

export interface StreamActionDef {
  key: string
  name: string
  kind: "redirect" | "action"
  field: "url" | "text" | "campaign" | null
  description: string
}

// ---------- Landings, offers, networks, sources ----------

type LandingType = "local" | "external" | "preloaded" | "action"
export interface Landing {
  id: ID
  name: string
  state: EntityState
  landing_type: LandingType
  action_type: string
  url: string
  group_id: ID | null
  notes: string
  created_at: ISODate
  updated_at: ISODate
}

type PayoutType = "CPA" | "CPC"
// An offer is one link inside an offer group (geo, landing or rate variant).
// country / regions are routing restrictions: a stream sends a click to this offer only from these places
// (empty = no restriction), so streams need no geo filters for it.
export interface Offer {
  id: ID
  name: string
  state: EntityState
  group_id: ID | null // OfferGroup.id
  affiliate_network_id: ID | null
  offer_type: LandingType
  action_type: string
  url: string
  payout_type: PayoutType
  payout_value: number
  payout_currency: string
  payout_auto: boolean
  payout_upsell: boolean
  country: string[]
  regions: string[] // states / regions inside the countries above; empty = the whole country
  conversion_cap_enabled: boolean
  daily_cap: number
  conversion_timezone: string
  alternative_offer_id: ID | null
  notes: string
  created_at: ISODate
  updated_at: ISODate
}

// Offer group: one advertiser product with a shared cap. Terms are dated: the same offers are extended month to month
// with a new rate and maybe a new cap. A cap belongs to the group (an offer never has its own: then it is another group).
export type CapMetric = "ftd" | "install"
export type CapWindow = "term" | "day" // whole term (e.g. month) or every day
export interface OfferCap { metric: CapMetric; window: CapWindow; value: number }
export interface OfferTerm {
  id: ID
  from: string // YYYY-MM-DD, inclusive
  to: string // YYYY-MM-DD, inclusive
  caps: OfferCap[] // empty = no cap
  payouts: Record<string, number> // offer_id → fixed rate per FTD in this term
}
export interface OfferGroup {
  id: ID
  name: string
  state: EntityState
  affiliate_network_id: ID | null // the advertiser / partner
  product: string // brand
  terms: OfferTerm[]
  fallback_offer_ids: ID[] // chain: cap reached → traffic goes to the first offer of the chain that still has room
  cap_timezone: string // a daily cap restarts at 00:00 in this zone
  alert_at: number[] // percent of a cap that sends a Telegram alert, e.g. [80, 100]
  alert_chat: string // Telegram chat for the alerts
  notes: string
  created_at: ISODate
  updated_at: ISODate
}
export interface CapProgress { metric: CapMetric; window: CapWindow; value: number; done: number }
export interface OfferGroupCap {
  term: OfferTerm | null // the term in force today
  caps: CapProgress[]
  pct: number // the fullest cap, 0..∞
  status: "none" | "ok" | "warn" | "full" | "no_term"
}

// Mass offer replacement: one row per stream that holds the offer.
export interface OfferSwapRow {
  campaign_id: ID
  stream_id: ID
  stream_name: string
  before: StreamOffer[]
  after: StreamOffer[]
  filters_before: StreamFilter[]
  filters_after: StreamFilter[]
}
export interface OfferSwapRequest {
  from_offer_id: ID
  to_offer_id: ID | null // null = remove the offer, the rest of the stream shares grow
  stream_ids?: ID[] // only these streams (preview rows the user kept); all visible when omitted
  drop_geo_filters: boolean // remove stream geo filters that only repeated the old offer's restrictions
}

// Reference campaign sync: what applying the reference would change in one linked campaign (streams matched by name).
export interface TemplateDiff {
  campaign_id: ID
  added: string[]
  removed: string[]
  changed: string[]
}

export interface AffiliateNetwork {
  id: ID
  name: string
  state: EntityState
  offer_param: string // appended to every offer URL, e.g. sub1={subid}
  postback_url: string // reference for the partner's panel
  notes: string
  created_at: ISODate
  updated_at: ISODate
}

export interface TrafficSource {
  id: ID
  name: string
  state: EntityState
  template_name: string
  postback_url: string
  postback_statuses: ConversionStatus[]
  parameters: CampaignParameter[]
  traffic_loss: number
  notes: string
  created_at: ISODate
  updated_at: ISODate
}

// ---------- Domains ----------

export type DomainStatus = "ok" | "awaiting_dns" | "requesting_cert" | "error"
export interface Domain {
  id: ID
  name: string
  group_id: ID | null
  status: DomainStatus
  is_ssl: boolean
  ssl_redirect: boolean
  allow_indexing: boolean
  catch_not_found: boolean
  default_campaign_id: ID | null
  campaigns_count: number
  dns_provider: string
  error_description: string
  notes: string
  next_check_at: ISODate
  created_at: ISODate
}

// ---------- Clicks, conversions, postbacks ----------

export type ConversionStatus = "lead" | "sale" | "rejected" | "rebill" | "registration" | "deposit"

export interface Click {
  sub_id: string // click id
  datetime: ISODate
  campaign_id: ID
  stream_id: ID
  landing_id: ID | null
  offer_id: ID | null
  ts_id: ID | null
  ip: string
  country: string // ISO-2
  region: string
  city: string
  os: string
  browser: string
  device_type: "mobile" | "desktop" | "tablet"
  device_model: string
  connection_type: string
  is_bot: boolean
  is_unique_campaign: boolean
  is_unique_stream: boolean
  lp_clicked: boolean
  cost: number
  external_id: string // e.g. PWA click id
  sub_id_1: string // ad account
  sub_id_2: string // placement
  sub_id_3: string // ad set id
  sub_id_4: string // ad set name
  sub_id_5: string // pixel
  sub_id_6: string // ad id
  buyer_id: ID
}

export interface Conversion {
  conversion_id: string
  sub_id: string
  campaign_id: ID
  stream_id: ID
  landing_id: ID | null
  offer_id: ID | null
  click_datetime: ISODate
  postback_datetime: ISODate
  status: ConversionStatus
  original_status: string
  previous_status: ConversionStatus | null
  revenue: number
  tid: string
  // set when the partner or the financier rejects a deposit: why, and the payout that was lost
  reject_reason: string
  rejected_revenue: number
}

type PostbackDirection = "in" | "out"
export interface PostbackLogEntry {
  id: ID
  direction: PostbackDirection
  datetime: ISODate
  // incoming: from an affiliate network; outgoing: S2S to a pixel / source / webhook
  affiliate_network_id: ID | null
  campaign_id: ID | null
  sub_id: string
  status: string
  payout: number | null
  url: string
  http_code: number | null
  result: "ok" | "error" | "ignored" | "retrying"
  message: string
  attempts: number
}

// ---------- Reports ----------

export type DateInterval =
  | "today"
  | "yesterday"
  | "7_days_ago"
  | "first_day_of_this_week"
  | "first_day_of_this_month"
  | "previous_month"
  | "1_month_ago"
  | "all_time"
  | "custom"

export interface DateRange {
  interval: DateInterval
  from?: string // YYYY-MM-DD, used when interval = custom
  to?: string
  timezone: string
}

export type FilterOperator =
  | "EQUALS"
  | "NOT_EQUAL"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "CONTAINS"
  | "NOT_CONTAIN"
  | "IN_LIST"
  | "NOT_IN_LIST"
  | "IS_TRUE"
  | "IS_FALSE"

export interface ReportFilter {
  name: string
  operator: FilterOperator
  expression: string | number | (string | number)[] | null
}

export interface ReportRequest {
  range: DateRange
  dimensions: string[] // grouping, up to 5 levels
  measures: string[]
  filters: ReportFilter[]
  sort: { name: string; order: "ASC" | "DESC" }[]
  limit?: number
  offset?: number
}

export type ReportRow = Record<string, string | number | null>
export interface ReportResponse {
  rows: ReportRow[]
  total: number
  summary: ReportRow
}

// Подход: how the creative is made. A shared directory; its code is part of the standard ad naming.
export interface Approach { id: ID; name: string; code: string; description: string; created_by: ID; created_at: ISODate }

// ---------- Facebook entities (from the team's spend collector, matched to clicks by ad id = sub_id_6) ----------

// Who gave us the account: an agency (rent, % of spend) or our own farm.
export interface AdProvider { id: ID; name: string; fee: number; self_made: boolean; group_name: string }

export interface FbAdAccount {
  id: string // act_…
  name: string
  // current assignment, filled by the API from AdAccountAssignment (null = free account)
  buyer_id: ID | null
  agency: string // provider name of the current assignment
  agency_fee: number // % added to spend («Спэнд+%»)
  provider_id: ID | null // who gave the account (default for new assignments)
  api_token: string // masked in lists; full value only for admins
  proxy: string
  active: boolean // false: metrics and balance are not parsed, no alerts
  last_error: string // last FB API error
  currency: string
  timezone: string
  created_at: ISODate // created in FB
  handed_at: ISODate // given to us (our_after)
  total_spend: number
  spend_diff: number // spend not matched to tracker campaigns
  spend_offset: number // manual correction of spend_diff
  spend_diff_comment: string
  alert_on_spend_diff: number // $; above it → problem + Telegram
  fb_balance: number
  balance_checked_at: ISODate | null
  disabled_at: ISODate | null
  watchdog_control: boolean // under auto rules
  multi_geo: boolean
}
// Account → buyer for a period, with the provider fee for that period.
export interface AdAccountAssignment {
  id: ID
  account_id: string
  buyer_id: ID
  provider_id: ID | null
  provider_fee: number | null // null = provider default
  date_from: string // YYYY-MM-DD
  date_to: string | null // null = still assigned
}
export interface FbCampaign {
  id: string
  account_id: string
  name: string // naming starts with the tracker campaign id
  created_at: ISODate
}
export interface FbAdset { id: string; campaign_id: string; name: string }
export interface FbAd { id: string; adset_id: string; name: string }
export interface FbDayStat { ad_id: string; day: string; impressions: number; spend: number }

// ---------- Problems (observability) ----------

export type ProblemKind =
  | "no_postbacks" | "fb_naming" | "spend_no_clicks" | "clicks_no_ad" | "postback_out" | "cap_full" | "terms_end" | "domain" | "no_spend" | "spend_diff" | "account_error"
export interface Problem {
  id: string
  kind: ProblemKind
  severity: "critical" | "warning"
  title: string // what is wrong, one line
  details: string // numbers behind it
  where: { label: string; href: string }[]
  buyer_id: ID | null
  since: ISODate
  status: "open" | "muted" | "resolved"
  muted_until: ISODate | null
}
export interface ProblemCheck {
  kind: ProblemKind
  enabled: boolean
  // threshold in the check's own unit (hours, %, clicks); null = learned automatically
  threshold: number | null
  notify: boolean // send to Telegram
}

export interface DimensionDef {
  key: string
  name: string
  group: "campaign" | "facebook" | "geo" | "device" | "params" | "time" | "other"
}
export interface MetricDef {
  key: string
  name: string
  short?: string
  format: "int" | "money" | "percent" | "decimal"
  group: "traffic" | "conversions" | "money" | "rates"
  // sign coloring: positive green, negative red
  signed?: boolean
}

// ---------- Users and access ----------

export type Resource =
  | "dashboard"
  | "campaigns"
  | "streams"
  | "landings"
  | "offers"
  | "offer_swap" // replacing offers inside campaigns (full = all campaigns, groups = the team's campaigns)
  | "affiliate_networks"
  | "traffic_sources"
  | "domains"
  | "reports"
  | "clicks"
  | "conversions"
  | "trends"
  | "postbacks"
  | "integrations"
  | "users"
  | "settings"
  | "logs"
  | "archive"
  | "problems"
  | "ad_accounts"

export type AccessLevel = "none" | "read" | "own" | "groups" | "full"

export interface Role {
  id: ID
  name: string
  description: string
  access: Record<Resource, AccessLevel>
  hidden_metrics: string[] // e.g. revenue, profit for buyers who must not see payouts
  system: boolean
}

export interface User {
  id: ID
  login: string
  name: string
  role_id: ID
  team: string
  state: "active" | "disabled"
  timezone: string
  language: "ru" | "en"
  group_ids: ID[] // groups of campaigns the user can access when access = groups
  last_login_at: ISODate | null
  created_at: ISODate
  two_factor: boolean
}

export interface ApiKey {
  id: ID
  user_id: ID
  name: string
  prefix: string
  created_at: ISODate
  last_used_at: ISODate | null
}

export interface AuditEntry {
  id: ID
  datetime: ISODate
  user_id: ID
  action: "create" | "update" | "delete" | "restore" | "login"
  resource: Resource
  resource_id: ID | null
  summary: string
  ip: string
}

export interface Integration {
  id: ID
  kind: "facebook_conversions" | "tiktok" | "cloudflare"
  name: string
  state: "active" | "paused" | "error"
  campaign_ids: ID[] // campaigns whose conversions go to the pixel (facebook_conversions) / whose cost is imported (tiktok)
  ad_account_id: string // tiktok: Advertiser ID
  pixel_id: string
  update_every_min: number
  last_sync_at: ISODate | null
  last_error: string
}

export interface Settings {
  currency: string
  timezone: string
  postback_key: string
  s2s_timeout_sec: number
  statistics_retention_days: number
  archive_retention_days: number
  allow_indexing_default: boolean
  global_aliases: Record<string, string[]>
}
