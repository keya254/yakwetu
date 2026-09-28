import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// The adapter needs the schema told to it directly; `?schema=` in the URL only
// reaches the migration engine.
const schema = process.env.DATABASE_SCHEMA ?? "storefront";

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema });
  return new PrismaClient({ adapter });
}

// One client across hot reloads in dev; a fresh one per reload leaks connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
