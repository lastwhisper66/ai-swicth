# 工具适配器

在此通过统一接口隔离 Claude Code 和 Codex 的配置发现、解析与字段映射。实现前核对官方配置文档，更新时保留无关配置。

`configuration-policy.ts` 统一运行时合法值校验；模型能力、字段归属与表单定义位于 `src/shared/configuration.ts`。适配器组合连接、模型预设和共通草稿，生成原生字段并读回校验。JSON/TOML 按叶子合并，未知字段保留；TOML 会重新排版并丢弃注释，原文留在写前备份中。

字段写入不代表模型、账号或网关实际可用，不调用付费 API 探测。

Claude 模型仅使用模型名及 `[1m]` 开关；思考强度归共通配置，只写顶层 `effortLevel`，不生成 `modelSettings` 条目。Codex 的主思考强度同样归共通配置，只写顶层 `model_reasoning_effort`；计划模式思考强度和其他模型选项仍由各预设管理。

ClaudeCodeAdapter 和 CodexAdapter 分别接受本机或 WSL 的工具标识；字段格式与映射共用，路径由服务层解析。共享字段策略按基础工具选择，供应商、共通模板、接管状态和备份仍使用完整工具标识隔离。
