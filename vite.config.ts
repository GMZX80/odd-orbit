import { defineConfig } from "vite";

export default defineConfig({
  base: "/odd-orbit/",
  server: {
    port: 5173
  },
  preview: {
    port: 4173
  }
});
