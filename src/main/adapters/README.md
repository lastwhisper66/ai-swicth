# 工具适配器

在此通过统一接口隔离 Claude Code 和 Codex 的配置发现、解析与字段映射。实现前核对官方配置文档，更新时保留无关配置。

`codex.ts` 的未管理供应商清理按 `ai-switch-<供应商 ID>` 保留应用内 Codex 供应商对应的表，删除其余未被引用的顶层 `model_providers` 表。当前选择、旧版内嵌 Profile、同目录新版 Profile 文件中的 `model_provider` 引用均受保护；不改写选择、模型、Profile 及其他配置。无删除项时返回原文，删除后重新解析并核对保留内容。实现核对了 OpenAI 官方[配置参考](https://developers.openai.com/codex/config-reference/)与[高级配置](https://developers.openai.com/codex/config-advanced/)：Codex 0.134 起通过同目录 `<profile>.config.toml` 文件配置 Profile，兼容检查旧版 `[profiles.<name>]` 引用。

`copilot.ts` 独立处理 VS Code `chatLanguageModels.json` 的 JSONC 数组，按 [Custom Endpoint 官方文档](https://code.visualstudio.com/docs/copilot/customization/language-models#_add-a-custom-endpoint-model)写入原生供应商分组。使用 `jsonc-parser` 局部修改，未变动的受管理分组按字段更新，外部同名分组或已被客户端修改的分组整体覆盖；保留其他分组及未变动处的注释，拒绝损坏文档及重复字段。应用直接写入，不再提供同步预览；清理预览通过通用清理脱敏逻辑隐藏敏感字段，不复用 CLI 字段映射。

`buildCopilotClientConfiguration` 将应用内凭据映射为客户端配置。VS Code 1.145 / Copilot 0.73 的顶层 `apiKey` 声明为 secret，主程序只通过 Secret Storage 解析该字段，明文值不会传给扩展。已有 `${input:...}` 引用原样保留；明文或空 Key 不写顶层字段，明文 Key 按模型实际协议生成 `x-api-key`、Azure `api-key` 或 Bearer 认证头。自定义认证头优先，明文 Key 在应用时展开 `${apiKey}`，空 Key 不生成默认认证头。应用内配置保持原样，客户端生成值由主进程写入，预览和列表继续脱敏。

已核对本机 VS Code 1.146.0：模型管理页以 `group.label.localeCompare` 排序自定义分组，配置服务按 `vendor:name` 比较分组，仅调整 JSON 数组顺序不会触发分组内容变化。`copilotClientName` 按完整供应商列表位置生成至少两位、宽度一致的数字前缀，`copilotProviderName` 优先通过写入记录还原原名，再兼容已知名称的单层前缀；已保存的数字开头原名不会被无条件截断。解析保留磁盘原始名称供并发校验与备份使用，只有身份匹配还原名称。`renameCopilotGroup` 仅编辑 JSONC 的分组 `name`，不会重写其他字段。模型 ID、模型名称及 `vendor` 不加前缀。

`configuration-policy.ts` 统一运行时合法值校验；模型能力、字段归属与表单定义位于 `src/shared/configuration.ts`。适配器组合连接、模型预设和共通草稿，生成原生字段并读回校验。JSON/TOML 按叶子合并，未知字段保留；TOML 会重新排版并丢弃注释，原文留在写前备份中。

字段写入不代表模型、账号或网关实际可用，不调用付费 API 探测。

Claude 模型仅使用模型名及 `[1m]` 开关；思考强度归共通配置，只写顶层 `effortLevel`，不生成 `modelSettings` 条目。Codex 的主思考强度、1M 与 Fast 均归共通配置：上下文窗口、压缩阈值、service_tier 和 features.fast_mode 直接从共通草稿合并，不由供应商模型覆盖；从本机提取时保留这些字段。旧模型接管记录释放这些共通字段的归属，保留合并后的值；其他已移除的计划思考、摘要与详细程度字段按原规则恢复。自有 provider 表的旧 `supports_websockets` 在重新应用时移除。

ClaudeCodeAdapter 和 CodexAdapter 分别接受本机或 WSL 的工具标识；字段格式与映射共用，路径由服务层解析。共享字段策略、供应商配置和共通模板按基础工具选择，目标文件、接管状态和工具备份使用完整工具标识隔离。模板仅保存于应用目录，应用供应商时才由适配器合并进所选环境的工具文件。
