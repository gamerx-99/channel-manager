import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // Several router tests import the whole appRouter inside the test, so its cold import
    // (about 5 s on Windows now that billing, onboarding and draft routers exist) counts
    // toward the timeout. 15 s keeps them from failing on load alone; assertions are unchanged.
    testTimeout: 15_000,
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/**/*.test.ts",
      "client/**/*.spec.ts",
      "client/**/*.test.tsx",
      "client/**/*.spec.tsx",
      "shared/**/*.test.ts",
      "shared/**/*.spec.ts",
      "worker/**/*.test.ts",
    ],
  },
});
