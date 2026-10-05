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
// The normal URL serves the React EventPass build. The root build still ships the fundraising
// overlay, which is served from LEGACY_ROOT on the paths it has always had.
const WEB_ROOT = path.resolve(__dirname, "../../web/dist");
const LEGACY_ROOT = path.resolve(__dirname, "../../dist");
const NOT_PUBLIC = /^\/(api|tests|node_modules)(\/|$)|^\/(Dockerfile|docker-compose\.yml|package(-lock)?\.json|vitest\.config\.js)$|\.md$/i;
// Legacy pages that stay live. OBS and bookmarks use these URLs, and the ticket verifier page is
// reachable from printed tickets. Nothing else from the legacy ticket app is served.
const LEGACY_PAGES = ["/fundraising.html", "/fundraising.css", "/obs-overlay.html", "/data.json", "/ticket-page.html"];

// The EventPass v1 router is mounted only when config.tokenKey is set. Without it,
// production exposes exactly the legacy surface it had before.
export function createApp({
  pool = defaultPool,
  config = null,
  corsOrigin = false,
  webRoot = WEB_ROOT,
  legacyRoot = LEGACY_ROOT,
} = {}) {
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
  // Unknown API paths answer with JSON, never with the app shell below.
  app.use("/api", (req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }));

  app.use((req, res, next) => (NOT_PUBLIC.test(req.path) ? res.sendStatus(404) : next()));
  app.get(LEGACY_PAGES, (req, res, next) => {
    res.sendFile(path.join(legacyRoot, req.path), (err) => err && next(err));
  });
  app.use("/assets", express.static(path.join(legacyRoot, "assets"), { fallthrough: true }));
  app.use(
    express.static(webRoot, {
      setHeaders(res, filePath) {
        // The browser checks this file for updates, so it must never be served from a cache.
        if (path.basename(filePath) === "service-worker.js") res.setHeader("Cache-Control", "no-cache");
      },
    })
  );
  // Client-side routes: a browser navigation gets the React shell. Any other request for a
  // missing file still gets a 404, so a stray script or stylesheet never receives HTML.
  app.get("*", (req, res, next) => {
    if (!req.headers.accept?.includes("text/html")) return next();
    res.sendFile(path.join(webRoot, "index.html"), (err) => err && next(err));
  });

  app.use((err, req, res, next) => {
    console.error("[server] Unhandled error", err);
    res.status(500).json({ error: "internal error" });
  });

  return app;
}
