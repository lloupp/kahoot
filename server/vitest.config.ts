import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret",
      NODE_ENV: "test",
      CLIENT_ORIGIN: "http://localhost:5173",
    },
  },
});
