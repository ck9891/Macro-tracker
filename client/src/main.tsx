import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { api } from "./api.js";
import App from "./App.js";
import { setupPwaAndSyncListeners } from "./pwa.js";
import "./styles/global.css";

setupPwaAndSyncListeners();
void api.bootstrapFromNetwork();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
