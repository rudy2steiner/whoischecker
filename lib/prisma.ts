import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * Cloudflare Workers can't use Prisma's default TCP engine directly, so we use the
 * `pg` driver adapter (over Workers' `nodejs_compat` TCP). The pool is lazy: it only
 * connects on first query, so constructing it without `DATABASE_URL` is harmless —
 * callers in `lib/domain-cache.ts` guard every query behind `hasDatabaseUrl()`.
 */
function createPrismaClient(): PrismaClient {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
