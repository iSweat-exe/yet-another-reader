import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { blockBrowserShortcuts } from "./lib/system/browserKeys";
import { initTheme } from "./lib/system/theme";
import "./index.css";

// The in-game overlay is its own window: the main window never loads its tree, and the overlay never loads the app.
const OverlayApp = lazy(() => import("./overlay/OverlayApp"));

// The overlay is drawn over the game and keeps its own look; only the app's windows follow the theme.
if (location.hash !== "#overlay") {
  blockBrowserShortcuts();
  initTheme();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {location.hash === "#overlay" ? (
      <Suspense fallback={null}>
        <OverlayApp />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
