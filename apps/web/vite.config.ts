import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

// Configuration minimale (doc 03 §3.2) — alias, plugins de build additionnels
// (code-splitting back-office/client QR, doc 11 §11.4) introduits au fil des
// tickets qui en ont réellement besoin.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
  },
});
