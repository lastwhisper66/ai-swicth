# 配置功能实现与验收记录

日期：2026-10-25。对应 [执行计划](tool-configuration-options.md) 的全部功能已接通；下文区分实现范围、已实测行为和验证边界。

## 实现与数据边界

- 每个工具独立保存供应商连接、模型预设、默认模型和选项；稳定预设 ID 允许相同 API 模型保存不同选项。Claude 另外保存四类路由，Codex 保存 WebSocket 能力声明。
- 主进程校验预设、默认引用、Header 名称、大小写重复、控制字符与鉴权冲突。Header 返回摘要，更新以 keep / replace 表达；移除记录即删除，脱敏占位值不能写回。
- 共通表单与高级原文共用草稿；Claude Code 仅展示思考强度、工具搜索、网络搜索、网络拉取、隐藏 AI 署名，Codex 仅展示网络搜索、启动时检查更新、历史文件大小。Claude 模型仅填写模型名，1M 使用复选框添加或移除 `[1m]`；不提供 Fast 和自动压缩控件。署名使用一个开关；保存隐藏前值，关闭恢复三个字段并保留其他子字段。权限只修改 WebSearch / WebFetch 精确规则，对已有范围规则或通配符提示冲突。其他原有字段保留在高级原文中。
- 首页与供应商设置使用横向行，每行一个供应商；首页不提供完整配置入口，编辑供应商页直接展开当前模型的草稿合并配置，使用页面全部可用宽度，没有预览模型选择和展开按钮。正在使用的供应商优先使用生效模型，其他供应商使用默认模型，移除当前模型时回退默认模型。
- API Key 在列表和完整配置中复用前后缀脱敏规则；其他令牌、密码和 Header 值完全隐藏。输入框默认隐藏内容，点击眼睛通过校验来源和供应商 ID 的专用 IPC 按需读取完整密钥，在同一输入框显示。读取值与修改草稿分开，只查看不会替换已保存值，编辑后才使用 replace，留空仍使用 keep。
- 共通、连接与模型按叶子合并。未知字段和外部新增规则保留。Codex 使用 TOML 语义解析和序列化，写入会重排版并丢弃注释；写前备份保留原文。
- 接管记录包含 before / applied，切换默认时恢复未被外部改动的旧覆盖。当前状态结合预设 ID 和原生连接/模型/Header 签名识别，不只比较模型字符串。
- 原生文件、共通模板、接管记录按组备份；写前校验、检测并发修改、逐文件原子替换、读回校验，失败回滚。恢复旧备份时清除缺失的较新接管记录，不回退整个供应商库。
- 供应商正文版本 2，文件名继续使用 `providers.v1.json`；旧单模型读取时转为确定性 ID 默认预设，下次保存升级，不在读取时写文件。旧共通归属冲突须显式选定供应商及预设迁移，只修改所选记录和模板。
- 云文档版本 2 包含全部模型、Header、模板及署名/模型接管状态，使用原 scrypt + AES-256-GCM 加密。兼容 v1 单模型备份；恢复前完整校验，失败回滚，恢复后手动应用。接管记录含原目标路径，配置目录设置不迁移，路径不符不套用原记录。
- 没有新增依赖、测试代码或测试脚本；没有调用付费 API，也没有修改真实工具配置。

## 官方配置依据与保守门槛

本机人工验收版本：Claude Code **2.1.310**，Codex CLI **0.154.0**。以下基线用于避免向未核对版本写入字段，不声称它们是最早支持版本。

| 能力                           | 本版行为 / 门槛                                                                                                                                                   | 官方依据                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude 连接、路径、JSON 内 env | 基础连接独立于高级选项                                                                                                                                            | [设置](https://code.claude.com/docs/en/settings)、[env 参考](https://code.claude.com/docs/en/env-vars)                                                                                                                                                                                                                                                                                                                               |
| Claude 共通表单                | 保守基线 2.1.310；版本未知或更旧时表单不可编辑                                                                                                                    | [设置字段](https://code.claude.com/docs/en/settings-reference)                                                                                                                                                                                                                                                                                                                                                                       |
| Claude 持久化强度              | 共通选择 low / medium / high / xhigh，写顶层及当前模型的 modelSettings 强度（2.1.251 起支持）；保留其他模型及子字段                                               | [modelSettings](https://code.claude.com/docs/en/settings-reference#modelsettings)、[effortLevel](https://code.claude.com/docs/en/settings-reference#effortlevel)                                                                                                                                                                                                                                                                     |
| Claude 模型与 1M               | 勾选添加一次 `[1m]`、取消移除，允许自定义别名；取消不强制降低模型原生容量，实际支持由工具和网关决定                                                               | [模型与上下文](https://code.claude.com/docs/en/model-config)                                                                                                                                                                                                                                                                                                                                                                         |
| Claude 统一署名                | 基线 2.1.281；同时写 commit/pr 空串及 sessionUrl=false                                                                                                            | [attribution](https://code.claude.com/docs/en/settings-reference#attribution)                                                                                                                                                                                                                                                                                                                                                        |
| Claude 搜索权限                | 维护精确规则，保留其他规则并提示优先级影响                                                                                                                        | [权限](https://code.claude.com/docs/en/permissions)、[Tool Search](https://code.claude.com/docs/en/mcp#configure-tool-search)                                                                                                                                                                                                                                                                                                        |
| Codex 全部新选项               | 保守基线 0.154.0；1M 固定 1000000；Fast 同步 service_tier 与 features.fast_mode；Responses provider 使用 http_headers / supports_websockets                       | [配置参考](https://learn.chatgpt.com/codex/config-file/config-reference)、[JSON Schema](https://developers.openai.com/codex/config-schema.json)、[高级配置](https://learn.chatgpt.com/codex/config-file/config-advanced)、[Fast](https://learn.chatgpt.com/codex/agent-configuration/speed)                                                                                                                                          |
| Codex 按型号强度               | gpt-5.4: none/low/medium/high/xhigh；gpt-6-luna 加 max；gpt-6-sol 加 max/ultra；gpt-6.1-sol 与 gpt-6-astra: low/medium/high/xhigh/max/ultra；其他型号暂只提供默认 | [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4)、[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)、[GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol)、[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)、[GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)、[Codex 型号及 ultra](https://developers.openai.com/codex/models) |

Claude 共通强度固定提供 low / medium / high / xhigh，不按模型名禁用；工具会根据模型支持情况降级。保存共通配置和切换模型时同步当前模型级强度，防止已有模型设置覆盖共通选择；不再从模型预设应用强度、Fast 或自动压缩。官方文档只能建立字段和型号兼容依据，无法保证第三方网关实现、账号权限或服务可用性。

## 已完成的人工检查

以下为精简表单、横向列表及 Claude 模型表单调整前的验收记录；其中已移除控件的检查不代表当前界面仍提供这些选项。本轮调整通过代码审查、静态检查及构建验证，尚未重新完成 Electron 界面逐项点击验收。

使用隔离的临时 userData、Claude/Codex 配置目录、占位 Key/Header，通过真实 Electron UI 操作并核对磁盘内容。

| 检查                     | 结果                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 旧 v1 单模型和共用供应商 | 读取迁移、保存 v2；编辑一工具时另一工具的模型数据保留                                                                                                          |
| Claude 1M 与强度         | Sonnet 4.6 写入一次 `[1m]`，模型级 high 正确；重启后识别所选预设                                                                                               |
| Claude 共通全部控件      | Tool Search=auto、stable、禁后台更新、自动记忆=false、中文、禁遥测/错误/非必要流量、7天、WebSearch=ask、WebFetch=deny 均正确；保留 Read 和指定域 WebFetch 规则 |
| 统一署名                 | 自定义/部分状态正确；启用隐藏生成三字段；关闭恢复原 commit/pr，原无 sessionUrl 时清除，custom 子字段保留                                                       |
| Codex 共通全部控件       | cached、启动检查=false、save-all、8MiB→8388608、analytics=false；未知 features/history 保留                                                                    |
| Codex 同一模型两个预设   | gpt-5.4 的快速大上下文与默认行为可独立保存、设默认、选择及应用；保存不写目标文件                                                                               |
| Codex 模型与连接选项     | 1M、high、计划 medium、摘要 detailed、详细 high、Fast、WebSocket=false 与任意命名 Header 正确写入                                                              |
| 切回默认                 | 上一预设 1M/强度/计划/摘要/详细/Fast 覆盖清除；共通/未知字段及 Header 保留                                                                                     |
| 备份恢复与识别           | 恢复切换前备份后原生字段和接管记录同时还原，首页识别快速预设                                                                                                   |
| 脱敏预览                 | 所选连接＋预设＋共通完整组合可预览，Key 与任意命名 Header 值遮蔽                                                                                               |
| 工具隔离                 | Claude 操作保留 Codex，Codex 操作保留 Claude                                                                                                                   |
| 外部修改                 | 手动改 effort 后刷新显示外部配置及重新应用提示                                                                                                                 |
| 损坏格式                 | 无效 TOML 显示格式错误，应用被拒绝，损坏原文不被覆盖                                                                                                           |
| 只读文件 / 目录缺失      | 明确提示检查权限 / 创建目录或选择路径，没有部分写入                                                                                                            |

补充实测：

- Claude 四类路由、Fast=true、自动压缩=false 正确写入；Opus 4.8 原生 1M 未追加后缀，原共通与未知字段保留。
- 删除默认模型后，默认引用自动调整到剩余预设，保存后有效。
- 已保存 Header 以隐藏占位显示，留空保存保留原值；替换后保存新值，删除后供应商库移除记录，再次应用时原生 Header 覆盖也正确清除。
- 从临时旧模板迁入 Fast 和 Header，仅指定记录更新，模板移除对应字段，目标工具文件不变。

静态检查与构建：`npm run check`（Prettier、ESLint、两套 TypeScript 检查）、`npm run build` 及 `git diff --check` 均通过。npm 输出仓库已有 Electron 镜像配置项提示，不影响命令成功；本次未修改依赖清单或锁文件。

## 验证边界

- 没有专用 S3/R2 凭据，本轮未做真实云端 v1/v2 往返、保留清理或网络失败验收；已完成相关代码审查，不能将静态检查视为云端实测。
- 本轮未在 macOS/Linux、旧 CLI 或真实第三方网关上运行；版本门槛与级别列表来自官方文档，仍需对应环境的人工确认。
- 写前检测和失败回滚已实现；尚未通过断电、进程强杀或精确并发时序故障注入验证，不声称跨文件具备数据库事务语义。
