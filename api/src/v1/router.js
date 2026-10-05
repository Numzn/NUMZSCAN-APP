import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import { loadPrincipal } from "./access.js";
import { authRouter } from "./auth.js";
import { checkpointsRouter } from "./routes/checkpoints.js";
import { credentialsRouter } from "./routes/credentials.js";
import { devicesRouter } from "./routes/devices.js";
import { eventsRouter } from "./routes/events.js";
import { interactionsRouter } from "./routes/interactions.js";
import { participantsRouter } from "./routes/participants.js";
import { v1ErrorHandler } from "./errors.js";
import { ApiError } from "./security.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function originHost(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function createV1Router({ pool, config }) {
  const router = Router();

  router.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.apiLimitPerMinute,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );
  router.use(express.json({ limit: "100kb" }));

  // Every state change must be JSON. A cross-site form cannot send that without a preflight,
  // which is also refused, so this blocks CSRF on top of SameSite=Strict cookies.
  router.use((req, res, next) => {
    if (UNSAFE_METHODS.has(req.method) && !req.is("application/json")) {
      return next(new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON with Content-Type: application/json"));
    }
    const origin = req.get("origin");
    if (UNSAFE_METHODS.has(req.method) && origin && originHost(origin) !== req.get("host")) {
      return next(new ApiError(403, "FORBIDDEN", "Cross-origin requests are not allowed"));
    }
    return next();
  });

  router.use(loadPrincipal({ pool, config }));
  router.use("/auth", authRouter({ pool, config }));
  router.use(eventsRouter({ pool }));
  router.use(participantsRouter({ pool }));
  router.use(credentialsRouter({ pool, config }));
  router.use(checkpointsRouter({ pool }));
  router.use(devicesRouter({ pool, config }));
  router.use(interactionsRouter({ pool, config }));

  router.use((req, res, next) => next(new ApiError(404, "NOT_FOUND", "Route not found")));
  router.use(v1ErrorHandler);
  return router;
}
