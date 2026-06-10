import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works at any GitHub Pages project path.
  base: "./",
  build: {
    target: "es2022",
  },
});
