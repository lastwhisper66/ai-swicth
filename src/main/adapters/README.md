# 工具适配器

在此通过统一接口隔离 Claude Code 和 Codex 的配置发现、解析与字段映射。实现前核对对应版本的官方配置文档，更新时保留无关配置。

`configuration-policy.ts` 统一运行时合法值和版本门槛；模型能力、字段归属与表单定义位于 `src/shared/configuration.ts`。适配器组合连接、模型预设和共通草稿，生成原生字段并读回校验。JSON/TOML 按叶子合并，未知字段保留；TOML 会重新排版并丢弃注释，原文留在写前备份中。

本版核对基线为 Claude Code 2.1.310、Codex CLI 0.154.0，细分门槛和官方依据见 `docs/tool-configuration-implementation.md`。兼容写入不代表模型、账号或网关实际可用，不调用付费 API 探测。

Claude 模型仅使用模型名及 `[1m]` 开关；思考强度归共通配置，写入顶层 `effortLevel` 并同步当前模型的 `modelSettings` 条目，保留其他模型及子字段。Fast、自动压缩不再由预设管理，已有原生字段保留。Codex 模型选项仍由各预设管理。
