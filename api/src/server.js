import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./v1/config.js";

const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : false;

const config = loadConfig();
const app = createApp({ config, corsOrigin: CORS_ORIGIN });

app.listen(PORT, () => {
  console.log(`[server] numzscan-api listening on :${PORT}${config.tokenKey ? " (EventPass v1 enabled)" : ""}`);
});
