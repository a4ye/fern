import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    globalIgnores([
        ".next/**",
        "out/**",
        "build/**",
        "extension/dist/**",
        "next-env.d.ts",
        "src/db/gen/**",
    ]),
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            "@typescript-eslint/no-non-null-assertion": "warn",
            "no-console": "warn",
            "no-var": "error",
            "prefer-const": "error",
        },
    },
    {
        // Command-line tools, where printing to the terminal is the whole
        // interface rather than a leftover debugging line.
        files: ["db/**/*.ts", "scripts/**/*.ts"],
        rules: { "no-console": "off" },
    },
    eslintConfigPrettier,
]);

export default eslintConfig;
