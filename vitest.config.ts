import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "packages/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.tsx",
    ],
    environmentMatchGlobs: [
      ["**/*.test.tsx", "jsdom"],
    ],
    setupFiles: ["./src/test-setup.ts"],
  },
});
