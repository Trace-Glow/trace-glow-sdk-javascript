/** 支持 TypeScript 的扁平配置工具确保 lint 规则与工作区语言一致。 */
import tseslint from "typescript-eslint";

/* 单一根配置可防止工作区扩展时各包规则逐渐分歧。 */
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["packages/**/*.ts", "*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
    },
  },
);
