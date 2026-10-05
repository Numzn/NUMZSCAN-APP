import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./serviceWorker";

function fakeContainer(result: Promise<unknown> = Promise.resolve({})) {
  return { register: vi.fn(() => result) } as unknown as Pick<ServiceWorkerContainer, "register">;
}

describe("registerServiceWorker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers the worker at the site root once the page has loaded", async () => {
    const container = fakeContainer();
    registerServiceWorker(container, true);
    await vi.waitFor(() => expect(container.register).toHaveBeenCalledWith("/service-worker.js"));
  });

  it("does nothing outside the production build", async () => {
    const container = fakeContainer();
    registerServiceWorker(container, false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.register).not.toHaveBeenCalled();
  });

  it("does nothing where service workers are unsupported", () => {
    expect(() => registerServiceWorker(undefined, true)).not.toThrow();
  });

  it("logs a failed registration without throwing, because the app works without it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const container = fakeContainer(Promise.reject(new Error("blocked")));
    registerServiceWorker(container, true);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith("Service worker registration failed", expect.any(Error)));
  });
});
