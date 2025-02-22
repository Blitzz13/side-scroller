import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
    { files: ["**/*.{js,mjs,cjs,ts}"] },
    { languageOptions: { globals: globals.browser } },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            indent: ["error", 4],
            semi: ["error", "always"],
            quotes: ["error", "double"],
            "no-unused-vars": [
                "warn",
                {
                    vars: "all", // Warn about unused variables
                    args: "after-used", // Warn about unused function arguments
                    ignoreRestSiblings: true, // Ignore unused variables in object destructuring
                    caughtErrors: "none", // Ignore unused catch block parameters
                    varsIgnorePattern: "^_", // Ignore variables starting with "_"
                },
            ],
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    vars: "all",
                    args: "after-used",
                    ignoreRestSiblings: true,
                    caughtErrors: "none",
                    varsIgnorePattern: "^_", // Ignore variables starting with "_"
                    ignoreEnums: true, // ✅ Ignore unused exported enums
                },
            ],
        },
    },
];
