import tseslint from "typescript-eslint";

/**
 * ESLint flat config enforcing Phase 0 architectural boundaries:
 * Core packages (`core-*`, `map-builder`, `ai-system`, `game-state`) must have
 * zero dependencies on `pixi.js`, `@pixi/sound`, or browser DOM globals.
 */
export default [
  {
    files: [
      "packages/core-*/src/**/*.ts",
      "packages/map-builder/src/**/*.ts",
      "packages/ai-system/src/**/*.ts",
      "packages/game-state/src/**/*.ts",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "pixi.js",
              message: "Core packages must not depend on pixi.js.",
            },
            {
              name: "@pixi/sound",
              message: "Core packages must not depend on @pixi/sound.",
            },
            {
              name: "pixi-stats",
              message: "Core packages must not depend on pixi-stats.",
            },
          ],
          patterns: [
            {
              group: ["pixi.js/*", "@pixi/*"],
              message: "Core packages must not depend on Pixi modules.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "window",
          message: "Core packages must not access browser `window`.",
        },
        {
          name: "document",
          message: "Core packages must not access browser `document`.",
        },
        {
          name: "localStorage",
          message: "Core packages must not access browser `localStorage`.",
        },
        {
          name: "navigator",
          message: "Core packages must not access browser `navigator`.",
        },
      ],
    },
  },
];
