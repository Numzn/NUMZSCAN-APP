import { ApiError } from "./security.js";

export function v1ErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof ApiError) {
    const body = { code: err.code, message: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json({ error: body });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Request body is not valid JSON" } });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } });
  }
  // Log only the error class and driver code: no message, SQL, or values.
  console.error("[api/v1] internal error", req.method, req.path, err.code ?? err.name);
  return res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
}
