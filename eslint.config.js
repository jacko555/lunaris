import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // Determinism: all randomness must flow from the world's seeded RNG.
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message:
            "Use the world's seeded Rng (packages/sim-core/src/rng.ts). See CLAUDE.md hard rule 2.",
        },
      ],
    },
  },
  {
    // sim-core purity: no DOM, no engine, no Node-only APIs, no wall-clock.
    // CI fails if any of these leak into the simulation core. See CLAUDE.md hard rules 1–2.
    files: ["packages/sim-core/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...[
          "window",
          "document",
          "navigator",
          "location",
          "localStorage",
          "sessionStorage",
          "indexedDB",
          "fetch",
          "XMLHttpRequest",
          "WebSocket",
          "Worker",
          "performance",
          "requestAnimationFrame",
          "alert",
          "crypto",
        ].map((name) => ({
          name,
          message: `sim-core must stay DOM-free and deterministic; '${name}' is banned here.`,
        })),
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use the world's seeded Rng. See CLAUDE.md hard rule 2.",
        },
        {
          object: "Date",
          property: "now",
          message: "No wall-clock in sim-core; time is the tick counter.",
        },
        {
          object: "performance",
          property: "now",
          message: "No wall-clock in sim-core; time is the tick counter.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "No wall-clock in sim-core; time is the tick counter.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path", "os", "child_process", "worker_threads"],
              message: "sim-core must not depend on Node-only APIs.",
            },
            {
              group: ["pixi.js", "react", "react-*", "vite", "@lunaris/web-client"],
              message: "sim-core must not depend on rendering or UI layers.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
