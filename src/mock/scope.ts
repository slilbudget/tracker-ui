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
export const canSeeCampaign = (id: number | null | undefined) => {
  if (groupIds === null) return true
  if (id == null) return false
  const c = campaignById(id)
  return !!c && (c.owner_id === viewerId || (c.group_id != null && groupIds.includes(c.group_id)) || grantOn(c) != null)
}
// edit = the role lets the viewer change this campaign, or a grant gives «edit» on it or its group
export function campaignAccess(id: number): "edit" | "read" | "none" {
  const c = campaignById(id)
  if (!c || !canSeeCampaign(id)) return "none"
  const level = viewerAccess("campaigns")
  const byRole = level === "full" || ((level === "own" || level === "groups") && (c.owner_id === viewerId || (c.group_id != null && (groupIds ?? []).includes(c.group_id))))
  return byRole || grantOn(c) === "edit" ? "edit" : "read"
}
