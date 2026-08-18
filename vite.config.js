import { defineConfig } from "vite";

const apiOrigin = process.env.KAS_WILL_API_ORIGIN || "http://127.0.0.1:4320";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4321,
    proxy: {
      "/api": apiOrigin
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4322
  }
});
