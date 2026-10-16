# AI Switch

带中文界面的本地桌面应用，用于集中管理 AI 供应商信息，并为 Claude Code、Codex 分别切换供应商配置。

目前已完成开发环境初始化：Electron Vite + React + TypeScript、Tailwind CSS 4、shadcn/ui 基础组件、类型明确的 IPC 和中文启动页。供应商增删改、工具配置读写、备份恢复尚未实现，当前应用不会修改目标工具的配置文件。

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

安装、卸载、升级依赖和修改项目元数据必须使用 npm 命令，不直接编辑 `package.json` 或锁文件。首次安装需要网络；已有依赖和 Electron 后，初始化页运行不需要网络或 API Key。

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
│   ├── ipc.ts            # IPC 注册、来源与参数校验
│   ├── providers/        # 供应商模型、校验、本地存储（预留）
│   ├── adapters/         # Claude Code / Codex 配置适配器（预留）
│   └── services/         # 切换、备份、原子写入与恢复（预留）
├── preload/
│   ├── index.ts          # 最小化 contextBridge 桥接
│   └── index.d.ts        # Window.api 类型声明
├── renderer/
│   ├── index.html        # 中文页面入口与 CSP
│   └── src/
│       ├── App.tsx       # 中文初始化页
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

现有组件为 Button、Card、Badge、Input，采用 `radix-nova` 风格和 neutral CSS 变量主题。配置位于 `components.json`，主题位于 `src/renderer/src/assets/main.css`。已按官方已有项目安装方式配置，官方 CLI 作为开发依赖记录在锁文件中，新增组件使用：

```powershell
npm run ui:add -- label dialog
```

不要运行其他框架的脚手架覆盖当前 Electron Vite 项目。生成组件后，按模板规范补充 `React.JSX.Element` 返回类型，再执行格式化和检查。Tailwind CSS 4 使用 CSS 配置，不需要额外的 Tailwind 或 PostCSS 配置文件。

## 进程边界与后续开发

窗口显式启用 `contextIsolation`、`sandbox`，关闭 `nodeIntegration`，阻止页面跳转和新窗口。预加载仅暴露 `getAppInfo()`，主进程校验请求来自应用窗口的主框架、页面地址一致，且没有多余参数。启动页及“刷新连接”按钮通过该接口确认本地通信状态。

添加业务 IPC 时，在 `shared` 定义接口，在主进程校验来源和实际运行时参数，再通过预加载暴露具体方法。API Key 默认脱敏，不能出现在日志、错误、截图或示例中。

实现配置适配器前，核对目标工具对应版本的官方配置文档。切换时保留无关字段，校验后先备份、再原子替换，多文件操作设计失败恢复。开发时使用临时目录和占位密钥；仅在用户明确发起切换或恢复时修改真实配置。

## 官方参考

- [Electron Vite 项目结构与预加载](https://electron-vite.org/guide/dev)
- [Tailwind CSS 的 Vite 安装方式](https://tailwindcss.com/docs/installation/using-vite)
- [shadcn/ui 已有 Vite 项目安装](https://ui.shadcn.com/docs/installation/vite)
- [shadcn/ui 手动配置](https://ui.shadcn.com/docs/installation/manual)
- [shadcn/ui CLI](https://ui.shadcn.com/docs/cli)
- [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)

## 许可证

[MIT](LICENSE)，保留原有版权声明。
