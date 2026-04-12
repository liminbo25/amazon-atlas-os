export const competitorMonitorRoutes = {
  dashboard: "/competitor-monitor",
  markets: "/competitor-monitor/markets",
  marketDetail: (marketId: string) => `/competitor-monitor/markets/${marketId}`,
  asinDetail: (asin: string) => `/competitor-monitor/asins/${asin}`,
  alerts: "/competitor-monitor/alerts",
};

export const competitorMonitorApiRoutes = {
  dashboard: "/api/competitor-monitor/dashboard",
  markets: "/api/competitor-monitor/markets",
  marketDetail: (marketId: string) =>
    `/api/competitor-monitor/markets/${marketId}`,
  asinDetail: (asin: string) => `/api/competitor-monitor/asins/${asin}`,
  alerts: "/api/competitor-monitor/alerts",
};

