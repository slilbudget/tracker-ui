import { createHashRouter } from "react-router"
import { Shell } from "./shell"
import { NotFound } from "./not-found"

// Warm up every section chunk once the first screen is idle, so navigation feels instant.
export function preloadSections() {
  const loaders = [
    () => import("@/features/dashboard/DashboardPage"),
    () => import("@/features/campaigns/CampaignsPage"),
    () => import("@/features/campaigns/CampaignPage"),
    () => import("@/features/landings/LandingsPage"),
    () => import("@/features/offers/OffersPage"),
    () => import("@/features/offers/OfferGroupsPage"),
    () => import("@/features/offers/OfferSwapPage"),
    () => import("@/features/affiliate-networks/AffiliateNetworksPage"),
    () => import("@/features/traffic-sources/TrafficSourcesPage"),
    () => import("@/features/domains/DomainsPage"),
    () => import("@/features/reports/ReportPage"),
    () => import("@/features/reports/ClicksLogPage"),
    () => import("@/features/reports/ConversionsLogPage"),
    () => import("@/features/trends/TrendsPage"),
    () => import("@/features/postbacks/PostbacksPage"),
    () => import("@/features/users/UsersPage"),
    () => import("@/features/integrations/IntegrationsPage"),
    () => import("@/features/settings/SettingsPage"),
    () => import("@/features/audit/AuditPage"),
    () => import("@/features/archive/ArchivePage"),
    () => import("@/features/problems/ProblemsPage"),
    () => import("@/features/ad-accounts/AdAccountsPage"),
    () => import("@/features/profile/ProfilePage"),
  ]
  let i = 0
  const next = () => { if (i < loaders.length) loaders[i++]().finally(() => setTimeout(next, 30)) }
  setTimeout(next, 800)
}

// Hash routing: works on any static hosting without server rewrites.
export const router = createHashRouter([
  {
    element: <Shell />,
    HydrateFallback: () => null,
    children: [
      { path: "/", lazy: () => import("@/features/dashboard/DashboardPage").then((m) => ({ Component: m.default })) },
      { path: "/campaigns", lazy: () => import("@/features/campaigns/CampaignsPage").then((m) => ({ Component: m.default })) },
      { path: "/campaigns/:id", lazy: () => import("@/features/campaigns/CampaignPage").then((m) => ({ Component: m.default })) },
      { path: "/landings", lazy: () => import("@/features/landings/LandingsPage").then((m) => ({ Component: m.default })) },
      { path: "/offers", lazy: () => import("@/features/offers/OffersPage").then((m) => ({ Component: m.default })) },
      { path: "/offers/replace", lazy: () => import("@/features/offers/OfferSwapPage").then((m) => ({ Component: m.default })) },
      { path: "/offer-groups", lazy: () => import("@/features/offers/OfferGroupsPage").then((m) => ({ Component: m.default })) },
      { path: "/affiliate-networks", lazy: () => import("@/features/affiliate-networks/AffiliateNetworksPage").then((m) => ({ Component: m.default })) },
      { path: "/traffic-sources", lazy: () => import("@/features/traffic-sources/TrafficSourcesPage").then((m) => ({ Component: m.default })) },
      { path: "/domains", lazy: () => import("@/features/domains/DomainsPage").then((m) => ({ Component: m.default })) },
      { path: "/reports", lazy: () => import("@/features/reports/ReportPage").then((m) => ({ Component: m.default })) },
      { path: "/clicks", lazy: () => import("@/features/reports/ClicksLogPage").then((m) => ({ Component: m.default })) },
      { path: "/conversions", lazy: () => import("@/features/reports/ConversionsLogPage").then((m) => ({ Component: m.default })) },
      { path: "/trends", lazy: () => import("@/features/trends/TrendsPage").then((m) => ({ Component: m.default })) },
      { path: "/postbacks", lazy: () => import("@/features/postbacks/PostbacksPage").then((m) => ({ Component: m.default })) },
      { path: "/users", lazy: () => import("@/features/users/UsersPage").then((m) => ({ Component: m.default })) },
      { path: "/integrations", lazy: () => import("@/features/integrations/IntegrationsPage").then((m) => ({ Component: m.default })) },
      { path: "/settings", lazy: () => import("@/features/settings/SettingsPage").then((m) => ({ Component: m.default })) },
      { path: "/audit", lazy: () => import("@/features/audit/AuditPage").then((m) => ({ Component: m.default })) },
      { path: "/archive", lazy: () => import("@/features/archive/ArchivePage").then((m) => ({ Component: m.default })) },
      { path: "/problems", lazy: () => import("@/features/problems/ProblemsPage").then((m) => ({ Component: m.default })) },
      { path: "/ad-accounts", lazy: () => import("@/features/ad-accounts/AdAccountsPage").then((m) => ({ Component: m.default })) },
      { path: "/it-notes", lazy: () => import("@/features/devnotes/notes").then((m) => ({ Component: m.default })) },
      { path: "/profile", lazy: () => import("@/features/profile/ProfilePage").then((m) => ({ Component: m.default })) },
      { path: "*", element: <NotFound /> },
    ],
  },
])
