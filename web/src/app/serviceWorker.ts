// Registers the offline shell worker (web/public/service-worker.js). It only runs in the production build,
// and a failed registration never stops the app, because the app works fine without it.
export function registerServiceWorker(
  container: Pick<ServiceWorkerContainer, "register"> | undefined,
  enabled: boolean,
): void {
  if (!enabled || !container) return;

  const register = () =>
    container.register("/service-worker.js").catch((err: unknown) => {
      console.warn("Service worker registration failed", err);
    });

  if (document.readyState === "complete") {
    void register();
  } else {
    window.addEventListener("load", () => void register(), { once: true });
  }
}
