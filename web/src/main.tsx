import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/utilities.css";
import "./styles/forms.css";
import "./styles/buttons.css";
import "./styles/cards.css";
import "./styles/badges.css";
import "./styles/upload.css";
import "./styles/dashboard.css";
import "./styles/stats.css";
import "./styles/filters.css";
import "./styles/logs-table.css";
import "./styles/states.css";
import "./styles/responsive.css";
import "./styles/print.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root application mount point.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
