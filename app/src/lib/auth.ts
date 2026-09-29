import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_PREFIX } from "@/lib/auth-cookie";
import { emitServerEvent } from "@/lib/events/server";
import { publicSiteUrl } from "@/lib/site-url";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [...new Set([process.env.BETTER_AUTH_URL, publicSiteUrl()].filter((origin): origin is string => Boolean(origin)))],
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  // Email and password only, signed in straight away: no verification email
  // for the hackathon demo.
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
    minPasswordLength: 8,
  },

  user: {
    additionalFields: {
      // Where n8n sends SMS nudges. Optional: a viewer without one gets email.
      phone: { type: "string", required: false, input: true },
    },
  },

  // No cookie cache: it kept a signed-out (or revoked) session alive for up to
  // its maxAge. One session query per page is cheap; a stale login is not.
  session: {
    expiresIn: 60 * 60 * 24 * 30,
  },

  // Account events come from the server, where the browser can't block or fake them.
  // emitServerEvent never throws, so capture can't break signing up or in.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await emitServerEvent("user.signed_up", user.id, { method: "email", hasPhone: Boolean(user.phone) });
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          await emitServerEvent("user.signed_in", session.userId, { method: "email" });
        },
      },
    },
  },

  // Our own cookie names. The default "better-auth.*" collides with any other
  // better-auth app a developer runs on localhost:3000 (a foreign cookie made
  // the proxy and the pages disagree about who is signed in).
  advanced: { cookiePrefix: AUTH_COOKIE_PREFIX },

  // Must stay last: lets server actions set the auth cookie.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

/** The signed-in viewer, or null. For server components and route handlers. */
export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/** The signed-in viewer, or a redirect to sign-in that comes back here afterwards. */
export async function requireSession(returnTo: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  return session;
}
