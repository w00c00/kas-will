import { defineConfig } from "vite";

const apiOrigin = process.env.STUDIO_API_ORIGIN || "http://127.0.0.1:4310";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4311,
    proxy: {
      "/api": apiOrigin
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4312
  }
});
