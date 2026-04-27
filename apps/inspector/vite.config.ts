import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const inspectorBase = () => {
  const baseFlagIndex = process.argv.findIndex((arg) => arg === "--base");
  const explicitBase = baseFlagIndex >= 0 ? process.argv[baseFlagIndex + 1] : undefined;
  const inlineBase = process.argv.find((arg) => arg.startsWith("--base="));
  const baseValue = explicitBase ?? inlineBase?.split("=")[1];

  if (!baseValue) {
    return undefined;
  }

  const normalizedBase = baseValue.replace(/\/+$|^\s+|\s+$/g, "");
  if (!normalizedBase) {
    return "/inspector";
  }

  return normalizedBase.endsWith("/inspector")
    ? normalizedBase
    : `${normalizedBase}/inspector`;
};

// https://vitejs.dev/config/
export default defineConfig({
  base: inspectorBase(),
  plugins: [react()],
  server: {
    host: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
});
