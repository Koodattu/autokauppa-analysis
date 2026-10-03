import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) },
    exclude: [...configDefaults.exclude, "**/dist/**"],
    fileParallelism: false,
  },
});
