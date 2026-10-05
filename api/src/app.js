import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import ticketsRouter from "./routes/tickets.js";
import { pool as defaultPool } from "./db.js";
import { createV1Router } from "./v1/router.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, "../../dist");
const NOT_PUBLIC = /^\/(api|tests|node_modules)(\/|$)|^\/(Dockerfile|docker-compose\.yml|package(-lock)?\.json|vitest\.config\.js)$|\.md$/i;

// The EventPass v1 router is mounted only when config.tokenKey is set. Without it,
// production exposes exactly the legacy surface it had before.
export function createApp({ pool = defaultPool, config = null, corsOrigin = false } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: corsOrigin }));

  if (config?.tokenKey) {
    app.use("/api/v1", createV1Router({ pool, config }));
  }

  app.use(express.json({ limit: "2mb" }));

  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get("/api/health", async (req, res) => {
    try {
      await pool.query("select 1");
      res.json({ status: "ok" });
    } catch (err) {
      res.status(503).json({ status: "error", message: err.message });
    }
  });

  app.use("/api", ticketsRouter);

  app.use((req, res, next) => (NOT_PUBLIC.test(req.path) ? res.sendStatus(404) : next()));
  app.use(express.static(FRONTEND_ROOT, { extensions: ["html"] }));

  app.use((err, req, res, next) => {
    console.error("[server] Unhandled error", err);
    res.status(500).json({ error: "internal error" });
  });

  return app;
}
