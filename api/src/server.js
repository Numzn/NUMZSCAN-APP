import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./v1/config.js";

const PORT = process.env.PORT || 3000;
// HOST is set only for local development, so the dev API stays on 127.0.0.1. Production leaves it unset.
const HOST = process.env.HOST || undefined;
const CORS_ORIGIN = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : false;

const config = loadConfig();
const app = createApp({ config, corsOrigin: CORS_ORIGIN });

const listenArgs = HOST ? [PORT, HOST] : [PORT];
app.listen(...listenArgs, () => {
  console.log(`[server] numzscan-api listening on :${PORT}${config.tokenKey ? " (EventPass v1 enabled)" : ""}`);
});
