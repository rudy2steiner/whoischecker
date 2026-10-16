# 全球品牌目录数据审计

审计日期：2026-10-16

## 审计范围

- 500 个品牌的排名、名称、国家/地区、行业与品牌估值。
- 500 个品牌的主域名与官网链接。
- 500 个品牌的 Logo 文件、来源与本地可用性。

## 权威来源

- 排名、名称、国家/地区、行业：Brand Finance Global 500 2026 官方 API。
- 品牌估值：Brand Finance Global 500 2026 官方预览公开的前 100 名估值。
- Logo：Brand Finance 官方品牌资产地址，全部下载到项目本地。
- 主域名：Brandfetch、Clearbit 交叉匹配，并对缩写、集团品牌、地区站与冲突项进行人工官网复核。

## 更新结果

- 500 条排名记录均由官方数据重新生成。
- 500 个 Logo 均替换为 Brand Finance 官方 Logo，不再使用搜索引擎 favicon 或错误站点图标。
- 193 个存在歧义、缺失、地区站或明显误匹配风险的域名已写入人工确认覆盖表。
- 已移除 `monstercockland.com`、`nytimes.com`、`office.com`、`bc.game`、`cnn.com`、`hcaptcha.com`、`audible.com`、`ceeceesclosetnyc.com`、`warriortrainingalliance.com` 等错误或危险链接。
- 产品数据中的 `needsReview` 已归零。

## 可重复验证

- `scripts/sync-brand-finance-global-500.cjs`：根据官方 API 快照重新生成目录数据。
- `scripts/apply-brand-domain-overrides.cjs`：应用人工确认的官网域名覆盖。
- `scripts/normalize-brand-logo-extensions.cjs`：按真实文件签名修正官方 Logo 扩展名。
- `lib/data/brand-domain-overrides.json`：保存人工确认的域名映射。
- `lib/data/brand-directory-audit.json`：保存逐品牌域名审计证据。
- `tests/millionaire-domains-data.test.cjs`：校验条数、排名顺序、估值覆盖、Logo 文件、来源字段及危险域名回归。
