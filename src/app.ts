import Fastify from "fastify";
import cors from "@fastify/cors";
import { documentProcessingPlugin } from "@/plugins/document-processing/process-document.routes";
import "dotenv/config";

const DEFAULT_FRONTEND_URL = "http://localhost:5137";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    origin: (origin, callback) => {
      const allowedOrigins = [
        process.env.FRONT_END_URL,
        DEFAULT_FRONTEND_URL,
      ].filter(Boolean);

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  });

  app.get("/health", async () => {
    return {
      status: "ok",
    };
  });

  app.register(documentProcessingPlugin);

  return app;
}
