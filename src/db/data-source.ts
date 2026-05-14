import "reflect-metadata";
import { DataSource } from "typeorm";
import { DocumentExtractions } from "./entities/document-extractions.entity.js";
import { Documents } from "./entities/documents.entity.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  ssl: false,
  synchronize: false,
  logging: process.env.NODE_ENV === "local",
  entities: [Documents, DocumentExtractions],
  migrations: ["src/db/migrations/*-*.{ts,js}"],
});

export async function initDatabase(): Promise<void> {
  await AppDataSource.initialize();
}
