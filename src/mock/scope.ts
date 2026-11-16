// Viewer scope of the mock API: which campaigns the current role may see.
// The real backend applies the same rule server-side from the session; the UI never filters by itself.
import { campaigns, users } from "./seed"
import type { AccessLevel, Campaign, Resource, Role } from "@/api/types"

let groupIds: number[] | null = null // null = every campaign
let viewerId = 1
let viewerRole: Role | null = null
// Access level of the viewer's role; secrets and admin-only fields are decided here, never by the caller.
export const viewerAccess = (r: Resource): AccessLevel => viewerRole?.access[r] ?? "full"

// The demo user behind the viewer role: admin, lead_alpha, a_volkov, finance, the intern.
export const viewerUser = () => users.find((u) => u.id === viewerId) ?? users[0]

export function setViewerRole(role: Role) {
  viewerRole = role
  viewerId = role.id === 1 ? 1 : users.find((u) => u.role_id === role.id)?.id ?? 1
  const level = role.access.campaigns
  // own / groups: campaigns in the viewer's groups (a buyer has one, a team lead the team's) and the ones they own
  groupIds = level === "full" || level === "read" ? null : viewerUser().group_ids
}
// Campaign groups the viewer works in (null = all).
export const viewerGroupIds = () => groupIds
// Checked live (not a snapshot), so campaigns created or moved after the role switch count too.
let index: { n: number; byId: Map<number, Campaign> } = { n: -1, byId: new Map() }
const campaignById = (id: number) => {
  if (index.n !== campaigns.length) index = { n: campaigns.length, byId: new Map(campaigns.map((c) => [c.id, c])) }
  return index.byId.get(id) ?? campaigns.find((x) => x.id === id)
}
// a single-object grant of the viewer on this campaign or its group (null = none)
function grantOn(c: Campaign): "read" | "edit" | null {
  const g = viewerUser().grants.filter((x) => (x.kind === "campaign" && x.id === c.id) || (x.kind === "campaign_group" && x.id === c.group_id))
  return g.some((x) => x.level === "edit") ? "edit" : g.length ? "read" : null
}
// visible by the role alone (own / group / everything), without single-object grants
function byRole(c: Campaign) {
  if (groupIds === null) return true
  if (viewerAccess("campaigns") === "none") return false
  return c.owner_id === viewerId || (c.group_id != null && groupIds.includes(c.group_id))
}
// Visible campaign: by the role, or by a grant (Users → «Отдельные доступы»). Role «none» + grants = only the granted ones.
export const canSeeCampaign = (id: number | null | undefined) => {
  if (groupIds === null) return true
  if (id == null) return false
  const c = campaignById(id)
  return !!c && (byRole(c) || grantOn(c) != null)
}
// Visible by the role only: things that belong to a buyer rather than to one campaign (ad accounts, their problems)
// do not open up because of a grant on one of the buyer's campaigns.
export const inRoleScope = (id: number | null | undefined) => {
  if (groupIds === null) return true
  if (id == null) return false
  const c = campaignById(id)
  return !!c && byRole(c)
}
// What the viewer may do with a campaign and with its streams. Edit by the role = the resource level is full, or
// own / groups and the campaign is in the role scope. An «edit» grant gives edit on both, a «read» grant on neither.
export function campaignAccess(id: number): { level: "edit" | "read" | "none"; streams: "edit" | "read" | "none" } {
  const c = campaignById(id)
  if (!c || !canSeeCampaign(id)) return { level: "none", streams: "none" }
  const grant = grantOn(c)
  const edits = (r: "campaigns" | "streams") => {
    const level = viewerAccess(r)
    return level === "full" || ((level === "own" || level === "groups") && byRole(c)) || grant === "edit"
  }
  return { level: edits("campaigns") ? "edit" : "read", streams: edits("streams") ? "edit" : "read" }
}
export const canEditCampaign = (id: number) => campaignAccess(id).level === "edit"
export const canEditStreams = (id: number) => campaignAccess(id).streams === "edit"
// campaign groups the viewer gets through grants (to show them in group pickers)
export const grantedGroupIds = () => viewerUser().grants.filter((g) => g.kind === "campaign_group").map((g) => g.id)
