import { cpSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: "copy-original-assets",
      writeBundle() {
        cpSync(resolve(projectRoot, "assets"), resolve(projectRoot, "dist/assets"), {
          recursive: true,
        });
      },
    },
  ],
});
