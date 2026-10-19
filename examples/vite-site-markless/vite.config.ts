import { markless } from "@markless/core/vite";
import { router } from "@markless/router/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  // The old site downloads nothing for a link before it is clicked.
  plugins: [markless(), router({ prefetch: false })],
  // public/ holds byte-for-byte copies of the old site's files.
  fmt: { ignorePatterns: ["public/**"] },
});
