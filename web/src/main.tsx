import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { registerServiceWorker } from "./app/serviceWorker";
import "./styles.css";

registerServiceWorker(navigator.serviceWorker, import.meta.env.PROD);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
