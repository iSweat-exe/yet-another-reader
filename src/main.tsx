import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { blockBrowserShortcuts } from "./lib/browserKeys";
import OverlayApp from "./overlay/OverlayApp";
import "./index.css";

if (location.hash !== "#overlay") blockBrowserShortcuts();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {location.hash === "#overlay" ? <OverlayApp /> : <App />}
  </React.StrictMode>,
);
