import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../api/src/app.js";

// Serving rules, tested against fixture builds so no real build output is needed.
// `web` stands in for the React app, `legacy` for the root build (fundraising and OBS only).
const pool = { query: async () => ({ rows: [{ "?column?": 1 }] }) };

const FILES = {
  web: {
    "index.html": "REACT-SHELL",
    "service-worker.js": "EVENTPASS-WORKER",
    "assets/index-abc.js": "REACT-BUNDLE",
  },
  legacy: {
    "fundraising.html": "FUNDRAISING-PAGE",
    "fundraising.css": "FUNDRAISING-CSS",
    "obs-overlay.html": "OBS-PAGE",
    "data.json": '{"raised":1}',
    "ticket-page.html": "TICKET-VERIFIER",
    "assets/fundraising-xyz.js": "FUNDRAISING-BUNDLE",
    // Legacy ticket app and its helpers. None of these may be served.
    "index.html": "LEGACY-TICKET-APP",
    "sync.js": "LEGACY-SYNC",
    "style.css": "LEGACY-STYLE",
    "manifest.json": '{"name":"legacy"}',
    "service-worker.js": "LEGACY-WORKER",
    "debug-qr-content.html": "LEGACY-DEBUG-PAGE",
  },
};

let root;
let server;
let base;

async function writeTree(dir, files) {
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(dir, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
}

async function get(pathname, accept = "text/html") {
  const response = await fetch(base + pathname, { headers: { accept } });
  return { status: response.status, type: response.headers.get("content-type") ?? "", cache: response.headers.get("cache-control"), body: await response.text() };
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "eventpass-serving-"));
  await writeTree(path.join(root, "web"), FILES.web);
  await writeTree(path.join(root, "legacy"), FILES.legacy);
  const app = createApp({ pool, webRoot: path.join(root, "web"), legacyRoot: path.join(root, "legacy") });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
});

describe("React EventPass at the normal URL", () => {
  it("serves the React shell at the root", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.body).toBe("REACT-SHELL");
  });

  it("answers browser navigation to every React route with the shell, so a refresh works", async () => {
    for (const route of ["/login", "/events", "/events/abc", "/events/abc/groups", "/events/abc/participants", "/event-participants/abc"]) {
      const res = await get(route);
      expect(res.status, route).toBe(200);
      expect(res.body, route).toBe("REACT-SHELL");
    }
  });

  it("serves the React bundle from the React build", async () => {
    const res = await get("/assets/index-abc.js", "*/*");
    expect(res.body).toBe("REACT-BUNDLE");
  });

  it("never answers an API path with the app shell", async () => {
    for (const route of ["/api/v1/events", "/api/unknown", "/api/v1/auth/me"]) {
      const res = await get(route);
      expect(res.status, route).toBe(404);
      expect(res.type, route).toContain("application/json");
      expect(res.body, route).not.toContain("REACT-SHELL");
    }
  });

  it("keeps the health check on /api/health", async () => {
    const res = await get("/api/health", "application/json");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "ok" });
  });

  it("serves the new service worker and tells the browser never to cache it", async () => {
    const res = await get("/service-worker.js", "*/*");
    expect(res.body).toBe("EVENTPASS-WORKER");
    expect(res.cache).toContain("no-cache");
  });
});

describe("legacy pages that stay live", () => {
  it("keeps the fundraising and OBS pages on the paths they have always used", async () => {
    expect((await get("/fundraising.html")).body).toBe("FUNDRAISING-PAGE");
    expect((await get("/fundraising.css", "*/*")).body).toBe("FUNDRAISING-CSS");
    expect((await get("/obs-overlay.html")).body).toBe("OBS-PAGE");
    expect((await get("/data.json", "application/json")).body).toBe('{"raised":1}');
  });

  it("keeps the fundraising bundle under /assets", async () => {
    expect((await get("/assets/fundraising-xyz.js", "*/*")).body).toBe("FUNDRAISING-BUNDLE");
  });

  it("keeps the public ticket verifier page", async () => {
    expect((await get("/ticket-page.html")).body).toBe("TICKET-VERIFIER");
  });
});

describe("legacy ticket app is no longer served", () => {
  it("does not serve the legacy ticket shell at the root or at /index.html", async () => {
    expect((await get("/")).body).not.toContain("LEGACY-TICKET-APP");
    expect((await get("/index.html")).body).toBe("REACT-SHELL");
  });

  it("does not serve the legacy scripts, styles, manifest, worker, or debug pages", async () => {
    for (const file of ["/sync.js", "/style.css", "/manifest.json", "/debug-qr-content.html"]) {
      const asset = await get(file, "*/*");
      expect(asset.status, file).toBe(404);
      expect(asset.body, file).not.toContain("LEGACY");
      // A browser navigation to the same path gets the React shell, never the legacy file.
      const navigation = await get(file);
      expect(navigation.body, file).not.toContain("LEGACY");
    }
  });

  it("does not serve the legacy service worker", async () => {
    expect((await get("/service-worker.js", "*/*")).body).not.toContain("LEGACY-WORKER");
  });

  it("answers unknown non-page requests with 404, not HTML", async () => {
    const res = await get("/missing-image.png", "*/*");
    expect(res.status).toBe(404);
  });
});
