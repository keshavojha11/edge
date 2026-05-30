import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma";
import { PrismaBetterSqlite3 as PrismaLibSQL } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";

function createPrisma() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const filePath = url.replace(/^file:/, "");
  const sqlite = new Database(filePath);
  const adapter = new PrismaLibSQL(sqlite);
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

declare global {
  // eslint-disable-next-line no-var
  var __prisma: ReturnType<typeof createPrisma> | undefined;
}

export const prisma = globalThis.__prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
