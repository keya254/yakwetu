/**
 * The storefront's public address: where Paystack sends viewers back, and what
 * links in SMS and PostHog point to. PUBLIC_SITE_URL is the tunnel (ngrok) or
 * the real domain; without it, BETTER_AUTH_URL (localhost in development).
 */
export function publicSiteUrl(): string {
  return (process.env.PUBLIC_SITE_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}
