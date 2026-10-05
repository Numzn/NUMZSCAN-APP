import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "./api";

function jsonResponse(status: number, body: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { "content-type": "application/json" },
  });
}

describe("request", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a JSON body with the JSON content type on writes", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await request("POST", "/auth/login", { email: "a@b.org", password: "x" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/login");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.org", password: "x" });
  });

  it("sends an empty JSON object on writes with no body, which the API requires", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await request("POST", "/auth/logout");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({});
  });

  it("sends no body and no content type on reads", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { events: [] }));
    await request("GET", "/events");
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it("turns the API error envelope into an ApiError with code, message and status", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" } }));
    const err = await request("POST", "/auth/login", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" });
  });

  it("falls back to a generic error when the error body is not the API envelope", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 502 }));
    const err = await request("GET", "/events").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, code: "UNKNOWN", message: "Request failed" });
  });

  it("returns undefined for a 204 response", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(request("POST", "/auth/logout", {})).resolves.toBeUndefined();
  });
});
