import "reflect-metadata";
import "dotenv/config";
import { buildApp } from "./app.js";
import { AppDataSource, initDatabase } from "./db/data-source.js";

const app = buildApp();

const port = Number(process.env.PORT ?? 9000);
const host = process.env.HOST ?? "0.0.0.0";

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
  } catch (error) {
    app.log.error(error);
  }
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await initDatabase();
  app.log.info("database connection ready");
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(1);
}
