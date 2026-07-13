import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { sampleData } from "./sampleData";
import type { RepoData } from "./types";

function resolveData(): RepoData {
  const raw = window.__GIT_DATA__;
  if (raw && typeof raw === "object") return raw;
  return sampleData;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App data={resolveData()} />
  </StrictMode>,
);
