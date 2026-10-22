# AI Switch

带中文界面的本地桌面应用，用于集中管理 AI 供应商信息，并为 Claude Code、Codex 分别切换供应商配置。

首版已实现供应商增删改、Claude Code 与 Codex 独立切换、配置路径管理、写前备份和恢复。文件读写、密钥解密与配置适配均在 Electron 主进程完成，界面只通过类型明确且经过运行时校验的 IPC 调用这些能力。

## 功能范围

- 集中保存供应商名称、API 地址、API Key、适用工具及每个工具对应的模型。
- 分别识别 Claude Code 和 Codex 当前配置，未知配置显示为“外部配置”。
- 选择供应商后显式应用到单个工具；切换一个工具不会修改另一个工具。
- 展示默认、环境变量或自定义配置路径，支持文件选择和移除自定义路径。
- 每次应用和恢复前创建加密备份，每个工具保留最近 20 份；恢复前状态也可再次找回。
- 对路径缺失、格式损坏、权限不足、外部并发修改及回滚失败提供中文反馈。

## 环境要求

- 推荐 Node.js 24 LTS，仓库中的 `.node-version` 固定主版本为 24。
- npm 11 或更高版本；本次使用 Node.js 24.18.0、npm 12.0.2。仅使用 npm 和 `package-lock.json`。
- 推荐 VS Code，安装仓库建议的 ESLint、Prettier 和 Tailwind CSS IntelliSense 扩展。

Tailwind CSS 使用 `@tailwindcss/vite`，只注册在 Electron Vite 的 renderer 配置中。当前 Tailwind CSS 4.3 支持 Vite 8，shadcn/ui 使用兼容 React 19 的 Radix 组件。

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
│       ├── App.tsx       # 中文工作台与跨页面状态
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

界面组件采用 `radix-nova` 风格和 neutral CSS 变量主题。配置位于 `components.json`，主题位于 `src/renderer/src/assets/main.css`。已按官方已有项目安装方式配置，官方 CLI 作为开发依赖记录在锁文件中，新增组件使用：

```powershell
npm run ui:add -- label dialog
```

不要运行其他框架的脚手架覆盖当前 Electron Vite 项目。生成组件后，按模板规范补充 `React.JSX.Element` 返回类型，再执行格式化和检查。Tailwind CSS 4 使用 CSS 配置，不需要额外的 Tailwind 或 PostCSS 配置文件。

## 进程边界与后续开发

窗口显式启用 `contextIsolation`、`sandbox`，关闭 `nodeIntegration`，阻止页面跳转和新窗口。预加载只暴露固定业务方法，不暴露通用 `ipcRenderer`、文件系统或环境变量。主进程校验请求来自应用窗口主框架、页面地址一致，并再次校验每个参数的实际运行时形状。应用使用单实例锁，主进程内所有写操作串行执行。

API Key 在界面中始终脱敏，已保存 Key 不会回传 renderer，也不会出现在日志或错误中。供应商库和备份正文使用 Electron `safeStorage` 加密；Linux 上检测到不安全的 `basic_text` 后端时拒绝保存，而不是降级成可逆明文。

仅在用户明确点击“应用”或“恢复”时写入目标文件。写入流程为解析、生成、回读校验、加密备份、外部修改检测和原子替换；验证失败会恢复原内容。敏感配置文件以仅当前用户可读写的权限创建，并拒绝替换符号链接。

## 配置兼容性

### Claude Code

- 默认文件：`~/.claude/settings.json`；Windows 中 `~` 表示 `%USERPROFILE%`。
- 若设置 `CLAUDE_CONFIG_DIR`，使用该目录下的 `settings.json`。
- 应用字段：顶层 `model`，以及 `env.ANTHROPIC_BASE_URL`、`env.ANTHROPIC_AUTH_TOKEN`。
- 适用于暴露 Anthropic Messages 格式的代理或网关；不管理 Bedrock、Vertex 或 Foundry 专用字段。

### Codex

- 默认文件：`~/.codex/config.toml`。
- 若设置 `CODEX_HOME`，使用该目录下的 `config.toml`。
- 应用字段：顶层 `model`、`model_provider`，以及 AI Switch 自有的 `model_providers` 表。
- 自有 provider 固定使用 `wire_api = "responses"`，适用于 OpenAI Responses 兼容端点。
- 适配器只定向修改 AI Switch 所有字段并保留其他文本；若目标字段或多行字符串无法安全识别，会拒绝写入并保留原文件。

两个工具都可能在新会话启动时读取模型或凭据，因此应用或恢复后界面会提示新建或重启对应会话。更高优先级的命令行参数、项目配置、托管策略或进程环境变量仍可能覆盖用户配置文件。

## 密钥与备份

AI Switch 自身的供应商库和备份使用系统安全存储加密，但目标工具需要直接读取凭据，因此应用后 API Key 会以明文出现在 Claude Code 或 Codex 的本地配置文件中。确认对话框会在写入前提示这一点。

备份索引只记录工具、时间、目标路径、关联供应商和校验和，不记录明文 Key。备份正文单独加密保存。恢复“原文件不存在”的备份会删除当前配置文件，界面会使用破坏性确认明确说明。

## 人工验证

仓库禁止添加任何测试代码、测试脚本或测试框架。开发调试应先把 `CLAUDE_CONFIG_DIR` 和 `CODEX_HOME` 指向临时目录，并使用占位 Key：

开发模式还支持用 `AI_SWITCH_USER_DATA_DIR` 把供应商库、路径设置和备份隔离到临时目录；生产构建会忽略这个覆盖。

1. 新增、编辑、删除供应商，重启应用确认持久化和脱敏。
2. 分别应用到 Claude Code、Codex，确认另一工具文件完全不变。
3. 检查原配置中的无关 JSON/TOML 内容仍然存在，并确认写入前生成备份。
4. 恢复备份，核对文件内容和当前供应商状态；再次恢复“恢复前”备份验证可撤销。
5. 人工制造路径不存在、损坏格式、只读文件和外部修改，确认应用不产生部分写入。
6. 全程不调用供应商 API，不在日志、截图或提交中使用真实 Key。

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

## 许可证

[MIT](LICENSE)，保留原有版权声明。
