/**
 * 采用 Conventional Commits 官方社区配置，使提交历史可被 Changesets、
 * Changelog 和自动化发布工具稳定解析，避免维护仓库专属格式。
 */
export default {
  extends: ["@commitlint/config-conventional"],
  helpUrl: "https://www.conventionalcommits.org/en/v1.0.0/",
};
