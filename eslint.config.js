import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "ios", "android", "supabase/functions", "coverage", "Website", ".tmp", "infrastructure/owner-backup", "scripts/recovery"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        __APP_VERSION__: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      // A UTC date string is tomorrow after 6 pm in Missouri and yesterday
      // before 11 am in Sydney. Use toLocalIsoDate() for farm and report dates.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name=/^(split|slice|substring)$/][callee.object.callee.property.name='toISOString']",
          message: "toISOString() is UTC. Use toLocalIsoDate() from @/utils/dates for a local calendar date; disable this line only for UTC-by-design data.",
        },
      ],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "**/__tests__/**"],
    rules: { "no-restricted-syntax": "off" },
  }
);
