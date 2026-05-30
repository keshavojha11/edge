import "dotenv/config";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require("../app/generated/prisma");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require("better-sqlite3");

function createPrisma() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const filePath = url.replace(/^file:/, "");
  const sqlite = new Database(filePath);
  const adapter = new PrismaBetterSqlite3(sqlite);
  return new PrismaClient({ adapter });
}

declare global {
  // eslint-disable-next-line no-var
  var __prisma: ReturnType<typeof createPrisma> | undefined;
}

export const prisma = globalThis.__prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
