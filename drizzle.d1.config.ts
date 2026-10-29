import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./drizzle/d1-schema.ts", "./drizzle/auth-schema.ts"],
  out: "./drizzle/d1",
  dialect: "sqlite",
});
