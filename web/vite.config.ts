import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single-file build: the CLI embeds exactly one index.html into the Go
// binary and injects data into it, so JS/CSS must be inlined rather than
// emitted as separate /assets/*.js files.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "dist",
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
