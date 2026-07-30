import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // src/lib/** is deliberately free of @raycast/api imports so the expansion
    // engine can be tested under plain Node. Guard that invariant here rather
    // than discovering it when a test suddenly needs the Raycast runtime.
    coverage: {
      include: ["src/lib/**"],
    },
  },
});
