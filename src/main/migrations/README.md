# 主进程数据迁移

入口在 Electron `app.whenReady()` 后、业务服务和窗口启动前执行。打开 `<userData>/ai-switch.db`，读取 `PRAGMA user_version`，按编号依次执行更高版本的步骤；不再使用 `migrations/completed.json` 判断进度。数据库版本高于程序支持范围或完整性校验失败时阻止业务启动。

- `index.ts`：静态导入并按顺序注册步骤，Electron Vite 将它们打包进主进程。
- `runner.ts`：校验编号和数据库，升级前使用 SQLite 在线备份接口生成恢复副本，协调准备过程和同步事务。
- `steps/001-create-schema.ts`：创建业务表、外键和索引。
- `steps/002-import-legacy-storage.ts`：校验旧 JSON、备份原文、事务导入数据并清理旧活动文件。
- `legacy-storage.ts`、`context.ts`：将旧版本、旧 WSL 及固定名称文件转换为内存中的当前业务数据，不先改写源文件。

## 提交与恢复

每一步先在异步 `prepare` 中完成文件读取、领域校验和必要备份，返回同步导入函数；在同一个 SQLite 事务中执行 `up`、导入函数和版本更新。失败回滚当前步骤，之前成功的步骤保留，下一次启动从未完成的步骤重试。事务内不得使用异步函数或等待网络。

旧 JSON 导入前的原文备份保存在 `backups/configurations/`，供应商及模型身份保持不变。无旧数据的新安装只初始化数据库，不创建空旧配置备份。已有数据库升级前的完整恢复副本在 `backups/database/`，使用 SQLite 在线备份接口，避免遗漏 WAL 中的已提交数据。

导入成功后才删除旧活动文件。清理按原文哈希核对；文件被占用、变成符号链接或被外部修改时保留，提示用户并在以后启动重试，应用只使用数据库，不再回退旧 JSON 或重复导入。旧完成清单也只作为原文保留后退出活动存储。

历史备份索引导入数据库，正文仍为文件，校验在实际恢复前执行；缺失或损坏正文不会被静默当作空配置。损坏的历史配置快照同样保留可见索引，恢复时说明错误。

启动完成迁移后，先通过 `database/configuration-targets.ts` 恢复未完成的工具写入，再初始化业务服务。发现用户后续修改的工具文件时不盲目覆盖，保留恢复资料并提示处理。

## 添加迁移

1. 在 `steps/` 添加递增编号文件，编号从当前最高版本加一，保持连续。
2. 实现 `DatabaseMigration`，用 `version` 标识数据库结构版本；`up` 只执行同步数据库操作。
3. 需要异步准备时在 `prepare` 中完成，返回用于事务提交的同步函数。
4. 静态导入并追加到 `index.ts`。已发布编号和行为保持稳定，后续变更新增步骤。
5. 通过代码审查、临时目录人工操作和构建验证，不添加测试代码、脚本或框架。

主题旧值来自浏览器 `localStorage`，通过独立受限 IPC 在数据库尚未设置主题时导入；成功后移除旧值，不参与启动 JSON 扫描。数据库版本仅用于本机结构升级，云端存档兼容由业务适配层负责，不把下载的版本号覆盖到本机数据库。

用户主动执行的“迁移归属字段”由 `services/configuration-fields.ts` 处理，与启动升级迁移无关。

参考：[SQLite user_version](https://www.sqlite.org/pragma.html#pragma_user_version)、[SQLite 在线备份](https://www.sqlite.org/backup.html)、[Electron 启动生命周期](https://www.electronjs.org/docs/latest/api/app#appwhenready)。
