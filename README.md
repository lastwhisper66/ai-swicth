# AI Switch

带中文界面的本地桌面应用，用于集中管理 AI 供应商信息，并为 Claude Code、Codex 分别切换供应商配置。

首版已实现供应商增删改、Claude Code 与 Codex 独立切换、配置目录与共通配置管理、完整配置预览、写前备份和恢复。文件读写、密钥解密与配置适配均在 Electron 主进程完成，界面只通过类型明确且经过运行时校验的 IPC 调用这些能力。

## 功能范围

- 在设置页中按 Claude Code、Codex 分开管理供应商名称、API 地址、API Key 与模型；两个工具可使用同名的独立供应商。
- 工具首页的“添加供应商”会进入设置页中对应工具的添加表单，无需勾选适用工具；保存与应用配置是两个独立操作。
- 添加和编辑使用页内表单，标签、输入框、说明与错误提示分别留出间距；输入框高度为 44px，聚焦外框不遮挡文字。
- 兼容此前同时用于两个工具的共用供应商，编辑时保留另一工具的模型并提示共用字段，不自动拆分历史记录。
- 分别识别 Claude Code 和 Codex 当前配置，未知配置显示为“外部配置”。
- 在工具首页直接点击供应商卡片的“应用”按钮（播放图标）切换配置，无需单独勾选；切换一个工具不会修改另一个工具。
- 首页与供应商设置使用统一卡片，分区展示 Base URL、模型和脱敏 API Key，当前使用的供应商以绿色标签标记。常规 Key 展示前 6 位和后 6 位，中间省略；较短 Key 减少显示位数，极短 Key 完全隐藏。编辑页同时显示已保存 Key 的脱敏标识。
- 展示默认、环境变量或自定义配置目录，支持目录选择和移除自定义路径；旧版文件路径自动取父目录，之后固定管理该目录中的标准配置文件。
- 目录选择器从对应工具当前生效的配置目录打开；目录不存在时从最近存在的上级目录打开。配置路径页每个工具只展示一处目录和一处文件路径，可点击打开、使用“更换目录”，或展开“手动输入”编辑路径。
- 在设置的“共通配置”中分别编辑 Claude Code 的 JSON、Codex 的 TOML 完整模板，也可从当前工具文件重新提取。保存立即应用，删除字段同步生效，切换供应商时复用模板。
- 配置路径和当前文件预览集中在设置 → 配置路径；点击路径或“打开目录”进入配置目录，点击文件路径或“打开文件”通过系统默认程序打开 JSON/TOML 文件。文件不存在时提示先应用供应商，打开失败时提示检查权限或设置默认编辑器；不自动创建文件。
- 首页摘要展示当前供应商、模型和 Base URL，首页与供应商页面不再展示配置路径或完整配置预览。配置路径页的只读预览由主进程脱敏；Codex 的地址、模型和 API Key 均在 `config.toml` 中管理。
- 每次应用和恢复前创建加密备份，每个工具保留最近 20 份；恢复前状态也可再次找回。
- 对路径缺失、格式损坏、权限不足、外部并发修改及回滚失败提供中文反馈。
- 刷新、保存、应用和恢复等操作结果通过右下角 Toast 提示，不占用页面布局；关闭按钮位于 Toast 右上角，成功提示 4 秒后收起，错误和警告保留 8 秒，也可手动关闭。

## 环境要求

- 推荐 Node.js 24 LTS，仓库中的 `.node-version` 固定主版本为 24。
- npm 11 或更高版本；本次使用 Node.js 24.18.0、npm 12.0.2。仅使用 npm 和 `package-lock.json`。
- 推荐 VS Code，安装仓库建议的 ESLint、Prettier 和 Tailwind CSS IntelliSense 扩展。

Tailwind CSS 使用 `@tailwindcss/vite`，只注册在 Electron Vite 的 renderer 配置中。当前 Tailwind CSS 4.3 支持 Vite 8，shadcn/ui 使用兼容 React 19 的 Radix 组件。

Claude Code 和 Codex 的品牌图标来自 [Lobe Icons](https://github.com/lobehub/lobe-icons/tree/7d7d0379f18b114a4009dc5cb85a7c375284f31b/packages/static-svg/icons)，分别使用 `claudecode-color.svg` 和 `codex.svg`，随应用本地打包，无需联网加载。原项目的 MIT 许可保留在 [图标许可](resources/lobe-icons-LICENSE.txt)，并随安装包分发。

## 安装与启动

```powershell
# 按锁文件安装依赖；首次安装会下载 Electron 并准备原生依赖。
npm ci

# 启动 Electron 桌面开发环境，渲染进程支持热更新。
npm run dev
```

安装、卸载、升级依赖和修改项目元数据必须使用 npm 命令，不直接编辑 `package.json` 或锁文件。首次安装需要网络；应用本身不会请求供应商 API，也不会验证 Key 或产生付费调用。

遇到网络问题时，可以在当前 PowerShell 会话中设置代理后重试：

```powershell
$env:HTTP_PROXY = 'http://127.0.0.1:7890'
$env:HTTPS_PROXY = 'http://127.0.0.1:7890'
$env:ALL_PROXY = 'http://127.0.0.1:7890'
```

`.npmrc` 保留脚手架的 Electron 下载镜像。npm 12 会提示这两个自定义镜像键为未知配置，该提示不影响已验证的安装与构建。

## 日常命令

| 命令                     | 用途                              |
| ------------------------ | --------------------------------- |
| `npm run dev`            | 启动桌面开发环境                  |
| `npm run format`         | 使用 Prettier 格式化              |
| `npm run format:check`   | 只检查格式                        |
| `npm run lint`           | 使用 ESLint 检查代码              |
| `npm run typecheck`      | 检查主进程、预加载和 React 的类型 |
| `npm run check`          | 依次执行格式、lint 和类型检查     |
| `npm run build`          | 类型检查并构建到 `out/`           |
| `npm start`              | 构建并预览桌面应用                |
| `npm run build:unpack`   | 构建未安装的应用目录到 `dist/`    |
| `npm run build:win`      | 构建 Windows 安装包               |
| `npm run build:mac`      | 构建 macOS 安装包                 |
| `npm run build:linux`    | 构建 Linux 安装包                 |
| `npm run ui:add -- 名称` | 使用官方 shadcn CLI 添加组件      |

安装包建议在对应操作系统构建。当前保留脚手架的应用图标；发布前需替换品牌资源并配置签名。首版为本地应用，已移除示例自动更新地址和未使用的更新器。

遵循 `AGENTS.md`，不添加测试代码、测试脚本或测试框架。功能实现后通过代码审查和临时配置目录中的人工操作验证，不调用付费 API。

## 目录与职责

```text
src/
├── main/
│   ├── index.ts          # 窗口生命周期与安全配置
│   ├── ipc.ts            # IPC 注册、来源与参数运行时校验
│   ├── providers/        # 供应商校验、加密存储与脱敏
│   ├── adapters/         # Claude Code JSON / Codex TOML 字段映射
│   └── services/         # 路径、状态、切换、备份与恢复
├── preload/
│   ├── index.ts          # 最小化 contextBridge 桥接
│   └── index.d.ts        # Window.api 类型声明
├── renderer/
│   ├── index.html        # 中文页面入口与 CSP
│   └── src/
│       ├── App.tsx       # Claude Code、Codex 与设置页面状态
│       ├── components/features/ # 工具配置页、供应商和设置页面
│       ├── assets/       # Tailwind 入口与主题变量
│       ├── components/ui/ # shadcn/ui CLI 生成的基础组件
│       └── lib/utils.ts  # cn 工具导出
└── shared/
    └── ipc.ts            # 主进程、预加载、界面共用的 IPC 契约
```

- `@renderer/*` 指向 `src/renderer/src/*`，供界面和 shadcn CLI 使用。
- `@shared/*` 指向 `src/shared/*`，已同时配置 Vite 和 TypeScript 的解析。
- `shared` 只放跨进程的类型、常量和纯逻辑，不能引入 Node.js 或 Electron 模块到界面。
- 文件读写、密钥处理和工具配置操作都放在主进程。界面只调用 `window.api`，不暴露通用 `ipcRenderer`、文件系统或进程环境变量。

## 添加 UI 组件

界面尽可能使用 shadcn/ui 官方组件，新增通用控件前先检查现有组件与官方组件目录；业务页面负责组合组件，布局和尺寸通过 Tailwind CSS 调整。

| 用途                       | 使用的 shadcn/ui 组件                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| 供应商与配置路径表单       | Field、FieldSet、FieldGroup、FieldLabel、FieldDescription、FieldError、Input |
| 密钥输入与显示切换         | Input Group、Input Group Input、Input Group Addon、Input Group Button        |
| 配置路径与备份列表         | Item、Item Group、Item Content、Item Actions                                 |
| 错误与配置说明             | Alert、Alert Description                                                     |
| 无供应商、无备份           | Empty、Empty Header、Empty Media、Empty Title、Empty Description             |
| 加载与保存中状态           | Spinner                                                                      |
| 操作通知                   | Sonner                                                                       |
| 按钮、卡片、页签与确认弹窗 | Button、Card、Tabs、Badge、Tooltip、Alert Dialog                             |

界面组件采用 `radix-nova` 风格和 neutral CSS 变量主题。配置位于 `components.json`，主题位于 `src/renderer/src/assets/main.css`。已按官方已有项目安装方式配置，官方 CLI 作为开发依赖记录在锁文件中，新增组件使用：

```powershell
npm run ui:add -- label dialog
```

不要运行其他框架的脚手架覆盖当前 Electron Vite 项目。生成组件后，按模板规范补充 `React.JSX.Element` 返回类型，再执行格式化和检查。Tailwind CSS 4 使用 CSS 配置，不需要额外的 Tailwind 或 PostCSS 配置文件。

## 进程边界与后续开发

窗口显式启用 `contextIsolation`、`sandbox`，关闭 `nodeIntegration`，阻止页面跳转和新窗口。预加载只暴露固定业务方法，不暴露通用 `ipcRenderer`、文件系统或环境变量。主进程校验请求来自应用窗口主框架、页面地址一致，并再次校验每个参数的实际运行时形状。应用使用单实例锁，主进程内所有写操作串行执行。

已保存的供应商 API Key 在主进程解密后仅将脱敏标识回传 renderer，完整密钥不会出现在列表、日志或错误中；完整预览在主进程脱敏 API Key、令牌、密码等字段。编辑器中本次输入的 Key 可手动显示。供应商库、共通模板和备份正文使用 Electron `safeStorage` 加密；Linux 上检测到不安全的 `basic_text` 后端时拒绝保存，而不是降级成可逆明文。

打开配置位置也通过校验来源与参数的专用 IPC 完成：界面只传工具和“目录 / 配置文件”目标，主进程从已生效的路径设置解析实际位置、检查存在性，再调用系统默认打开方式；不会接受界面传来的任意文件路径。

仅在用户明确点击“应用”“保存并应用”或“恢复”时写入目标文件。写入流程为解析、生成、回读校验、加密备份、外部修改检测和原子替换；验证失败会恢复原内容。敏感配置文件以仅当前用户可读写的权限创建，并拒绝替换符号链接。Codex 只操作所选目录中的 `config.toml`，自定义目录优先于 `CODEX_HOME`。共通模板也纳入同一组备份，恢复时同步还原。

## 共通配置与预览

设置 → 共通配置按工具管理完整模板；Claude Code 排除顶层 `model` 和 `env` 中 Anthropic 地址、Key、认证令牌与模型变量，Codex 排除顶层 `model`、`model_provider`、`model_providers`，其中包含的供应商 API Key 不会进入共通模板。首次打开从当前文件提取，之后读取应用数据目录中各工具独立的 `.common.enc` 加密模板。通用环境变量中的其他密钥可以在编辑器中编辑，模板本身也应视为敏感配置。

点击“保存并应用”立即替换工具文件的通用部分，保留当前供应商字段；从模板删除的通用字段会从工具文件删除。以后应用任一供应商时，先使用该工具的模板，再生成供应商字段。没有保存模板时，延续原行为，保留当前文件中的通用内容。两个工具的模板互不影响。

共通配置编辑期间，如果工具文件、目录或模板被修改，保存会拒绝覆盖并提示重新读取。需要保留工具外部修改时，可先“从当前文件重新提取”再编辑。恢复历史备份时，只恢复那份备份记录的工具配置原路径及应用当前管理的共通模板，不会访问旧版记录中其他关联文件的实际路径。

设置 → 配置路径中的“查看完整配置”仅读取当前文件，不会写入文件。内容按 JSON/TOML 重新排版后展示，密钥脱敏；TOML 注释不会显示。“打开文件”则交给系统默认程序，查看磁盘文件的原始内容；外部修改保存后，点击应用顶部刷新按钮重新识别供应商。Codex 从当前文件提取共通配置和保存时会重新排版供应商字段；正常切换时仍保留模板中的通用 TOML 文本。

## 配置兼容性

### Claude Code

- 默认目录：`~/.claude`，管理其中的 `settings.json`；Windows 中 `~` 表示 `%USERPROFILE%`。
- 若设置 `CLAUDE_CONFIG_DIR`，使用该目录下的 `settings.json`。
- 应用字段：顶层 `model`，以及 `env.ANTHROPIC_BASE_URL`、`env.ANTHROPIC_AUTH_TOKEN`。
- 适用于暴露 Anthropic Messages 格式的代理或网关；不管理 Bedrock、Vertex 或 Foundry 专用字段。

### Codex

- 默认目录：`~/.codex`，管理其中的 `config.toml`。
- 若设置 `CODEX_HOME`，使用该目录下的 `config.toml`。
- 地址、模型和 API Key 统一写入 `config.toml`；状态识别、配置校验和预览也仅读取这个工具文件。
- 应用字段：顶层 `model`、`model_provider`，以及 AI Switch 自有的 `model_providers` 表，其中 `base_url` 保存地址，`experimental_bearer_token` 保存 API Key。
- 自有 provider 显式设置 `requires_openai_auth = false`，使用该表中的直接令牌；不会生成 `env_key` 或命令认证配置。
- 自有 provider 固定使用 `wire_api = "responses"`，适用于 OpenAI Responses 兼容端点。
- 使用 `smol-toml` 校验完整 TOML 语法，切换时定向修改 AI Switch 所有字段；已保存共通模板时，通用部分以模板为准。若配置格式损坏或目标字段无法安全识别，会拒绝写入并保留原文件。

从旧版升级后，在 Codex 页面重新应用已保存的供应商，即会把供应商库中保存的 Key 连同地址、模型一起写入 TOML。应用不会自动访问、删除或修改旧认证文件。旧版备份仍可恢复工具配置与共通模板；如果恢复的 TOML 未保存 Key，操作结果会提示重新应用已保存的供应商。

两个工具都可能在新会话启动时读取模型或凭据，因此应用或恢复后界面会提示新建或重启对应会话。更高优先级的命令行参数、项目配置、托管策略或进程环境变量仍可能覆盖用户配置文件。

## 密钥与备份

AI Switch 自身的供应商库和备份使用系统安全存储加密，但目标工具需要直接读取凭据，因此应用后 API Key 会以明文出现在 Claude Code 或 Codex 的本地配置文件中。确认对话框会在写入前提示这一点。

备份索引只记录工具、时间、目标路径、关联供应商和校验和，不记录明文 Key。备份正文单独加密保存，包含工具配置和对应共通模板；Codex 的 Key 随 `config.toml` 一起备份与恢复。恢复“原文件不存在”的备份会删除当前配置文件，界面会使用破坏性确认明确说明。

## 人工验证

仓库禁止添加任何测试代码、测试脚本或测试框架。开发调试应先把 `CLAUDE_CONFIG_DIR` 和 `CODEX_HOME` 指向临时目录，并使用占位 Key：

开发模式还支持用 `AI_SWITCH_USER_DATA_DIR` 把供应商库、路径设置和备份隔离到临时目录；生产构建会忽略这个覆盖。

1. 从两个工具首页分别点击“添加供应商”，确认进入设置中对应的独立表单；检查输入框聚焦、错误提示和小窗口滚动无重叠。
2. 在供应商设置中切换两个工具页签，新增同名的独立供应商，编辑、取消和删除后确认归属正确；重启应用确认持久化和脱敏。
3. 分别应用到 Claude Code、Codex，确认另一工具文件完全不变。
4. 检查原配置中的无关 JSON/TOML 内容仍然存在，并确认写入前生成备份。
5. 恢复备份，核对文件内容和当前供应商状态；再次恢复“恢复前”备份验证可撤销。
6. 人工制造路径不存在、损坏格式、只读文件和外部修改，确认应用不产生部分写入。
7. 全程不调用供应商 API，不在日志、截图或提交中使用真实 Key。
8. 配置目录选择 `.claude` / `.codex`；为 Codex 指定不同于 `CODEX_HOME` 的目录，确认只更新所选目录的 `config.toml`。旧版自定义文件路径应显示为父目录。
9. 从已有配置提取共通字段，修改权限、保留天数或历史设置；保存立即生效且供应商字段保留。删除通用字段后保存、再切换供应商，确认该字段不会重新出现。
10. 检查首页与供应商设置卡片的 Base URL、模型、Key 首尾标识和当前使用标签；确认无选择圆圈，应用按钮为播放图标，且只有正在应用的卡片显示加载状态。首页与供应商编辑页均不显示配置文件条目。
11. 恢复共通配置修改前的备份，检查工具文件与模板一起还原；对原文件及模板均不存在的情况，确认恢复后新文件全部删除。
12. 编辑期间从外部修改文件或切换目录，确认保存拒绝覆盖并可重新提取；输入损坏的 JSON/TOML 或供应商字段时确认有明确反馈。
13. 从旧版升级后重新应用供应商，确认 TOML 自有表包含 `experimental_bearer_token` 和 `requires_openai_auth = false`；保存共通配置后密钥仍保留，预览中密钥始终脱敏。
14. 恢复旧版多文件备份，确认只恢复工具配置与共通模板，其他历史关联文件没有被访问或修改；恢复不含 TOML 密钥的备份时有重新应用供应商的提示。
15. 在配置路径页分别点击两工具的目录路径、文件路径及打开按钮，确认使用当前已保存目录和系统默认程序；目录和文件路径各显示一次，手动输入可保存或取消。点击“更换目录”从对应工具的当前目录打开，目录不存在时定位最近存在的上级目录；取消选择不改变路径。检查路径不存在、无权限及未设置默认程序的反馈；打开和预览均不创建文件或备份。

## 官方参考

- [Electron Vite 项目结构与预加载](https://electron-vite.org/guide/dev)
- [Tailwind CSS 的 Vite 安装方式](https://tailwindcss.com/docs/installation/using-vite)
- [shadcn/ui 已有 Vite 项目安装](https://ui.shadcn.com/docs/installation/vite)
- [shadcn/ui 手动配置](https://ui.shadcn.com/docs/installation/manual)
- [shadcn/ui CLI](https://ui.shadcn.com/docs/cli)
- [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)
- [Claude Code 设置文件](https://code.claude.com/docs/en/settings)
- [Claude Code 环境变量](https://code.claude.com/docs/en/env-vars)
- [Codex 配置参考](https://developers.openai.com/codex/config-reference)
- [Codex 认证方式](https://developers.openai.com/codex/auth/)

## 许可证

[MIT](LICENSE)，保留原有版权声明。
