# Claude Code 与 Codex 官方配置字段索引

核对日期：2026-10-25。本文是官方参考页字段索引的快照，便于检索和规划，不表示 AI Switch 已实现这些表单，也不表示所有字段都适用于本机安装版本。本次实施范围、开发顺序和限制见 [配置功能执行计划](tool-configuration-options.md)，不再沿用此前的推荐优先级划分。

本次实际选定的字段见 [简版字段清单](tool-configuration-fields.md)；从产品方案移除的选项仍可能出现在下方官方参考索引中，不代表计划提供对应表单。

本方案只管理配置文件；不再收录独立的环境变量名称清单。Claude Code settings.json 内的 env 字段仍在范围内，其候选子字段和页面归属见方案正文。Codex 的 env_key、env_http_headers 等外部环境引用只保留为官方配置文件字段参考，不提供可视化编辑，也不读取引用值。

统计以参考页列出的字段条目为单位，父对象与子字段分别计数，不展开任意名称的占位字段。Claude Code 包含 Managed 和 Global config；Codex 仅收录 config.toml 参考表，不混入 requirements.toml。命令行参数、MCP 自有配置文件和未文档化内部字段不在本索引范围内。

## Claude Code 设置字段（247 项）

来源：[All settings](https://code.claude.com/docs/en/settings-reference)。分类和范围保留官方原文；Any file、User、Project、Local、Managed 的定义见 [设置层级](https://code.claude.com/docs/en/settings#settings-files-and-who-they-affect)。Global config 写入 ~/.claude.json，不属于 settings.json。Managed 字段属于组织管理策略。

| 字段（链接到官方条目）                                                                                                                                  | 官方分类                           | 生效范围                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------- |
| [`advisorModel`](https://code.claude.com/docs/en/settings-reference#advisormodel)                                                                       | Model and responses                | Any file                |
| [`agent`](https://code.claude.com/docs/en/settings-reference#agent)                                                                                     | Agents, sessions, and worktrees    | Any file                |
| [`agentPushNotifEnabled`](https://code.claude.com/docs/en/settings-reference#agentpushnotifenabled)                                                     | Remote, desktop, and notifications | Any file                |
| [`allowAllClaudeAiMcps`](https://code.claude.com/docs/en/settings-reference#allowallclaudeaimcps)                                                       | MCP                                | Managed                 |
| [`allowClaudeInChromeWithManagedMcp`](https://code.claude.com/docs/en/settings-reference#allowclaudeinchromewithmanagedmcp)                             | MCP                                | Managed                 |
| [`allowedChannelPlugins`](https://code.claude.com/docs/en/settings-reference#allowedchannelplugins)                                                     | Plugins and skills                 | Managed                 |
| [`allowedHttpHookUrls`](https://code.claude.com/docs/en/settings-reference#allowedhttphookurls)                                                         | Hooks and automation               | Any file                |
| [`allowedMcpServers`](https://code.claude.com/docs/en/settings-reference#allowedmcpservers)                                                             | MCP                                | Any file                |
| [`allowedProviders`](https://code.claude.com/docs/en/settings-reference#allowedproviders)                                                               | Authentication and providers       | Managed                 |
| [`allowManagedHooksOnly`](https://code.claude.com/docs/en/settings-reference#allowmanagedhooksonly)                                                     | Hooks and automation               | Managed                 |
| [`allowManagedMcpServersOnly`](https://code.claude.com/docs/en/settings-reference#allowmanagedmcpserversonly)                                           | MCP                                | Managed                 |
| [`allowManagedPermissionRulesOnly`](https://code.claude.com/docs/en/settings-reference#allowmanagedpermissionrulesonly)                                 | Permission settings                | Managed                 |
| [`alwaysThinkingEnabled`](https://code.claude.com/docs/en/settings-reference#alwaysthinkingenabled)                                                     | Model and responses                | Any file                |
| [`apiKeyHelper`](https://code.claude.com/docs/en/settings-reference#apikeyhelper)                                                                       | Authentication and providers       | Any file                |
| [`askUserQuestionTimeout`](https://code.claude.com/docs/en/settings-reference#askuserquestiontimeout)                                                   | Interface and terminal             | User or managed         |
| [`appendPlugins`](https://code.claude.com/docs/en/settings-reference#appendplugins)                                                                     | Plugins and skills                 | User or managed         |
| [`attribution`](https://code.claude.com/docs/en/settings-reference#attribution)                                                                         | Git and attribution                | Any file                |
| [`attribution.commit`](https://code.claude.com/docs/en/settings-reference#attribution-commit)                                                           | Git and attribution                | Any file                |
| [`attribution.pr`](https://code.claude.com/docs/en/settings-reference#attribution-pr)                                                                   | Git and attribution                | Any file                |
| [`attribution.sessionUrl`](https://code.claude.com/docs/en/settings-reference#attribution-sessionurl)                                                   | Git and attribution                | Any file                |
| [`autoCompactEnabled`](https://code.claude.com/docs/en/settings-reference#autocompactenabled)                                                           | Memory and context                 | Any file                |
| [`autoCompactWindow`](https://code.claude.com/docs/en/settings-reference#autocompactwindow)                                                             | Memory and context                 | Any file                |
| [`autoConnectIde`](https://code.claude.com/docs/en/settings-reference#autoconnectide)                                                                   | Global config settings             | Global config           |
| [`autoContinueAtUsageLimit`](https://code.claude.com/docs/en/settings-reference#autocontinueatusagelimit)                                               | Interface and terminal             | User or managed         |
| [`autoInstallIdeExtension`](https://code.claude.com/docs/en/settings-reference#autoinstallideextension)                                                 | Global config settings             | Global config           |
| [`autoMemoryDirectory`](https://code.claude.com/docs/en/settings-reference#automemorydirectory)                                                         | Memory and context                 | Any file                |
| [`autoMemoryEnabled`](https://code.claude.com/docs/en/settings-reference#automemoryenabled)                                                             | Memory and context                 | Any file                |
| [`autoMode`](https://code.claude.com/docs/en/settings-reference#automode)                                                                               | Permission settings                | User or managed         |
| [`autoMode.classifyAllShell`](https://code.claude.com/docs/en/settings-reference#automode-classifyallshell)                                             | Permission settings                | User or managed         |
| [`autoScrollEnabled`](https://code.claude.com/docs/en/settings-reference#autoscrollenabled)                                                             | Interface and terminal             | Any file                |
| [`autoUpdatesChannel`](https://code.claude.com/docs/en/settings-reference#autoupdateschannel)                                                           | Updates and versioning             | Any file                |
| [`availableModels`](https://code.claude.com/docs/en/settings-reference#availablemodels)                                                                 | Model and responses                | Any file                |
| [`availableModelsMatch`](https://code.claude.com/docs/en/settings-reference#availablemodelsmatch)                                                       | Model and responses                | Managed                 |
| [`awaySummaryEnabled`](https://code.claude.com/docs/en/settings-reference#awaysummaryenabled)                                                           | Remote, desktop, and notifications | Any file                |
| [`awsAuthRefresh`](https://code.claude.com/docs/en/settings-reference#awsauthrefresh)                                                                   | Authentication and providers       | Any file                |
| [`awsCredentialExport`](https://code.claude.com/docs/en/settings-reference#awscredentialexport)                                                         | Authentication and providers       | Any file                |
| [`axScreenReader`](https://code.claude.com/docs/en/settings-reference#axscreenreader)                                                                   | Interface and terminal             | User or managed         |
| [`bashEditDiffEnabled`](https://code.claude.com/docs/en/settings-reference#basheditdiffenabled)                                                         | Interface and terminal             | User or managed         |
| [`bashOutputMaxChars`](https://code.claude.com/docs/en/settings-reference#bashoutputmaxchars)                                                           | Memory and context                 | Any file                |
| [`blockedMarketplaces`](https://code.claude.com/docs/en/settings-reference#blockedmarketplaces)                                                         | Plugins and skills                 | Managed                 |
| [`browserExternalPageTools`](https://code.claude.com/docs/en/settings-reference#browserexternalpagetools)                                               | Tools                              | Managed                 |
| [`channelsEnabled`](https://code.claude.com/docs/en/settings-reference#channelsenabled)                                                                 | Plugins and skills                 | Managed                 |
| [`claudeInChromeDefaultEnabled`](https://code.claude.com/docs/en/settings-reference#claudeinchromedefaultenabled)                                       | Global config settings             | Global config           |
| [`claudeMd`](https://code.claude.com/docs/en/settings-reference#claudemd)                                                                               | Memory and context                 | Managed                 |
| [`claudeMdExcludes`](https://code.claude.com/docs/en/settings-reference#claudemdexcludes)                                                               | Memory and context                 | Any file                |
| [`cleanupPeriodDays`](https://code.claude.com/docs/en/settings-reference#cleanupperioddays)                                                             | Privacy and telemetry              | Any file                |
| [`companyAnnouncements`](https://code.claude.com/docs/en/settings-reference#companyannouncements)                                                       | Interface and terminal             | Any file                |
| [`copyFullResponse`](https://code.claude.com/docs/en/settings-reference#copyfullresponse)                                                               | Global config settings             | Global config           |
| [`copyOnSelect`](https://code.claude.com/docs/en/settings-reference#copyonselect)                                                                       | Global config settings             | Global config           |
| [`crossSessionInbound`](https://code.claude.com/docs/en/settings-reference#crosssessioninbound)                                                         | Agents, sessions, and worktrees    | Any file                |
| [`defaultShell`](https://code.claude.com/docs/en/settings-reference#defaultshell)                                                                       | Interface and terminal             | Any file                |
| [`defaultToAgentsView`](https://code.claude.com/docs/en/settings-reference#defaulttoagentsview)                                                         | Global config settings             | Global config           |
| [`deniedMcpServers`](https://code.claude.com/docs/en/settings-reference#deniedmcpservers)                                                               | MCP                                | Any file                |
| [`deniedModels`](https://code.claude.com/docs/en/settings-reference#deniedmodels)                                                                       | Model and responses                | Managed                 |
| [`desktopSessionCleanupPeriodDays`](https://code.claude.com/docs/en/settings-reference#desktopsessioncleanupperioddays)                                 | Privacy and telemetry              | User or managed         |
| [`dialogExpiry`](https://code.claude.com/docs/en/settings-reference#dialogexpiry)                                                                       | Interface and terminal             | User or managed         |
| [`diffTool`](https://code.claude.com/docs/en/settings-reference#difftool)                                                                               | Global config settings             | Global config           |
| [`disableAgentView`](https://code.claude.com/docs/en/settings-reference#disableagentview)                                                               | Agents, sessions, and worktrees    | Any file                |
| [`disableAllHooks`](https://code.claude.com/docs/en/settings-reference#disableallhooks)                                                                 | Hooks and automation               | Any file                |
| [`disableArtifact`](https://code.claude.com/docs/en/settings-reference#disableartifact)                                                                 | Remote, desktop, and notifications | Any file                |
| [`disableAutoMode`](https://code.claude.com/docs/en/settings-reference#disableautomode)                                                                 | Permission settings                | Any file                |
| [`disableBrowserExternalNavigation`](https://code.claude.com/docs/en/settings-reference#disablebrowserexternalnavigation)                               | Tools                              | Managed                 |
| [`disableBundledSkills`](https://code.claude.com/docs/en/settings-reference#disablebundledskills)                                                       | Plugins and skills                 | Any file                |
| [`disableClaudeAiConnectors`](https://code.claude.com/docs/en/settings-reference#disableclaudeaiconnectors)                                             | MCP                                | Any file                |
| [`disableCommandPluginSources`](https://code.claude.com/docs/en/settings-reference#disablecommandpluginsources)                                         | Plugins and skills                 | Managed                 |
| [`disableDeepLinkRegistration`](https://code.claude.com/docs/en/settings-reference#disabledeeplinkregistration)                                         | Remote, desktop, and notifications | Any file                |
| [`disableDesktopLocalSessions`](https://code.claude.com/docs/en/settings-reference#disabledesktoplocalsessions)                                         | Remote, desktop, and notifications | Managed                 |
| [`disabledMcpjsonServers`](https://code.claude.com/docs/en/settings-reference#disabledmcpjsonservers)                                                   | MCP                                | Any file                |
| [`disableMobileSimulatorTools`](https://code.claude.com/docs/en/settings-reference#disablemobilesimulatortools)                                         | Tools                              | Managed                 |
| [`disableRemoteControl`](https://code.claude.com/docs/en/settings-reference#disableremotecontrol)                                                       | Remote, desktop, and notifications | Any file                |
| [`disableSideloadFlags`](https://code.claude.com/docs/en/settings-reference#disablesideloadflags)                                                       | Enterprise and managed settings    | Managed                 |
| [`disableSkillShellExecution`](https://code.claude.com/docs/en/settings-reference#disableskillshellexecution)                                           | Plugins and skills                 | Any file                |
| [`disableWorkflows`](https://code.claude.com/docs/en/settings-reference#disableworkflows)                                                               | Hooks and automation               | Any file                |
| [`editorMode`](https://code.claude.com/docs/en/settings-reference#editormode)                                                                           | Interface and terminal             | Any file                |
| [`effortLevel`](https://code.claude.com/docs/en/settings-reference#effortlevel)                                                                         | Model and responses                | Any file                |
| [`emojiCompletionEnabled`](https://code.claude.com/docs/en/settings-reference#emojicompletionenabled)                                                   | Interface and terminal             | Any file                |
| [`enableAllProjectMcpServers`](https://code.claude.com/docs/en/settings-reference#enableallprojectmcpservers)                                           | MCP                                | Any file                |
| [`enableArtifact`](https://code.claude.com/docs/en/settings-reference#enableartifact)                                                                   | Remote, desktop, and notifications | Any file                |
| [`enabledMcpjsonServers`](https://code.claude.com/docs/en/settings-reference#enabledmcpjsonservers)                                                     | MCP                                | Any file                |
| [`enabledPlugins`](https://code.claude.com/docs/en/settings-reference#enabledplugins)                                                                   | Plugins and skills                 | Any file                |
| [`enableWorkflows`](https://code.claude.com/docs/en/settings-reference#enableworkflows)                                                                 | Hooks and automation               | Any file                |
| [`enforceAvailableModels`](https://code.claude.com/docs/en/settings-reference#enforceavailablemodels)                                                   | Model and responses                | Any file                |
| [`env`](https://code.claude.com/docs/en/settings-reference#env)                                                                                         | Memory and context                 | Any file                |
| [`externalEditorContext`](https://code.claude.com/docs/en/settings-reference#externaleditorcontext)                                                     | Global config settings             | Global config           |
| [`extraKnownMarketplaces`](https://code.claude.com/docs/en/settings-reference#extraknownmarketplaces)                                                   | Plugins and skills                 | Any file                |
| [`fallbackModel`](https://code.claude.com/docs/en/settings-reference#fallbackmodel)                                                                     | Model and responses                | Any file                |
| [`fastMode`](https://code.claude.com/docs/en/settings-reference#fastmode)                                                                               | Model and responses                | Any file                |
| [`fastModePerSessionOptIn`](https://code.claude.com/docs/en/settings-reference#fastmodepersessionoptin)                                                 | Model and responses                | Any file                |
| [`feedbackDrafts`](https://code.claude.com/docs/en/settings-reference#feedbackdrafts)                                                                   | Privacy and telemetry              | User or managed         |
| [`feedbackSurveyRate`](https://code.claude.com/docs/en/settings-reference#feedbacksurveyrate)                                                           | Privacy and telemetry              | Any file                |
| [`fileCheckpointingEnabled`](https://code.claude.com/docs/en/settings-reference#filecheckpointingenabled)                                               | Memory and context                 | Any file                |
| [`fileSuggestion`](https://code.claude.com/docs/en/settings-reference#filesuggestion)                                                                   | Interface and terminal             | Any file                |
| [`footerLinksRegexes`](https://code.claude.com/docs/en/settings-reference#footerlinksregexes)                                                           | Interface and terminal             | User or managed         |
| [`forceLoginGatewayUrl`](https://code.claude.com/docs/en/settings-reference#forcelogingatewayurl)                                                       | Authentication and providers       | User or managed         |
| [`forceLoginMethod`](https://code.claude.com/docs/en/settings-reference#forceloginmethod)                                                               | Authentication and providers       | Any file                |
| [`forceLoginOrgUUID`](https://code.claude.com/docs/en/settings-reference#forceloginorguuid)                                                             | Authentication and providers       | Any file                |
| [`forceRemoteSettingsRefresh`](https://code.claude.com/docs/en/settings-reference#forceremotesettingsrefresh)                                           | Enterprise and managed settings    | Managed                 |
| [`gatewayInternalNetworks`](https://code.claude.com/docs/en/settings-reference#gatewayinternalnetworks)                                                 | Authentication and providers       | Managed                 |
| [`gcpAuthRefresh`](https://code.claude.com/docs/en/settings-reference#gcpauthrefresh)                                                                   | Authentication and providers       | Any file                |
| [`hooks`](https://code.claude.com/docs/en/settings-reference#hooks)                                                                                     | Hooks and automation               | Any file                |
| [`httpHookAllowedEnvVars`](https://code.claude.com/docs/en/settings-reference#httphookallowedenvvars)                                                   | Hooks and automation               | Any file                |
| [`idleCompaction`](https://code.claude.com/docs/en/settings-reference#idlecompaction)                                                                   | Memory and context                 | Any file                |
| [`includeCoAuthoredBy`](https://code.claude.com/docs/en/settings-reference#includecoauthoredby)                                                         | Git and attribution                | Any file                |
| [`includeGitInstructions`](https://code.claude.com/docs/en/settings-reference#includegitinstructions)                                                   | Git and attribution                | Any file                |
| [`inputNeededNotifEnabled`](https://code.claude.com/docs/en/settings-reference#inputneedednotifenabled)                                                 | Remote, desktop, and notifications | Any file                |
| [`isolatePeerMachines`](https://code.claude.com/docs/en/settings-reference#isolatepeermachines)                                                         | Agents, sessions, and worktrees    | Any file                |
| [`keybindingFlavor`](https://code.claude.com/docs/en/settings-reference#keybindingflavor)                                                               | Interface and terminal             | Any file                |
| [`language`](https://code.claude.com/docs/en/settings-reference#language)                                                                               | Model and responses                | Any file                |
| [`leftArrowOpensAgents`](https://code.claude.com/docs/en/settings-reference#leftarrowopensagents)                                                       | Global config settings             | Global config           |
| [`managedMcpServers`](https://code.claude.com/docs/en/settings-reference#managedmcpservers)                                                             | MCP                                | Managed                 |
| [`managedSourcesBehavior`](https://code.claude.com/docs/en/settings-reference#managedsourcesbehavior)                                                   | Enterprise and managed settings    | Managed                 |
| [`maxEffortLevel`](https://code.claude.com/docs/en/settings-reference#maxeffortlevel)                                                                   | Model and responses                | Any file                |
| [`maxProseWidth`](https://code.claude.com/docs/en/settings-reference#maxprosewidth)                                                                     | Interface and terminal             | Any file                |
| [`minimumVersion`](https://code.claude.com/docs/en/settings-reference#minimumversion)                                                                   | Updates and versioning             | Any file                |
| [`model`](https://code.claude.com/docs/en/settings-reference#model)                                                                                     | Model and responses                | Any file                |
| [`modelOverrides`](https://code.claude.com/docs/en/settings-reference#modeloverrides)                                                                   | Model and responses                | Any file                |
| [`modelPicker`](https://code.claude.com/docs/en/settings-reference#modelpicker)                                                                         | Model and responses                | User or managed         |
| [`modelPricing`](https://code.claude.com/docs/en/settings-reference#modelpricing)                                                                       | Model and responses                | Managed                 |
| [`modelSettings`](https://code.claude.com/docs/en/settings-reference#modelsettings)                                                                     | Model and responses                | Any file                |
| [`otelHeadersHelper`](https://code.claude.com/docs/en/settings-reference#otelheadershelper)                                                             | Authentication and providers       | Any file                |
| [`outputStyle`](https://code.claude.com/docs/en/settings-reference#outputstyle)                                                                         | Model and responses                | Any file                |
| [`parentSettingsBehavior`](https://code.claude.com/docs/en/settings-reference#parentsettingsbehavior)                                                   | Enterprise and managed settings    | Managed                 |
| [`permissionExplainerEnabled`](https://code.claude.com/docs/en/settings-reference#permissionexplainerenabled)                                           | Global config settings             | Global config           |
| [`permissions`](https://code.claude.com/docs/en/settings-reference#permissions)                                                                         | Permission settings                | Any file                |
| [`permissions.additionalDirectories`](https://code.claude.com/docs/en/settings-reference#permissions-additionaldirectories)                             | Permission settings                | Any file                |
| [`permissions.allow`](https://code.claude.com/docs/en/settings-reference#permissions-allow)                                                             | Permission settings                | Any file                |
| [`permissions.ask`](https://code.claude.com/docs/en/settings-reference#permissions-ask)                                                                 | Permission settings                | Any file                |
| [`permissions.blockReadsOutsideWorkingDirectories`](https://code.claude.com/docs/en/settings-reference#permissions-blockreadsoutsideworkingdirectories) | Permission settings                | Any file                |
| [`permissions.defaultMode`](https://code.claude.com/docs/en/settings-reference#permissions-defaultmode)                                                 | Permission settings                | Any file                |
| [`permissions.deny`](https://code.claude.com/docs/en/settings-reference#permissions-deny)                                                               | Permission settings                | Any file                |
| [`permissions.disableBypassPermissionsMode`](https://code.claude.com/docs/en/settings-reference#permissions-disablebypasspermissionsmode)               | Permission settings                | Any file                |
| [`plansDirectory`](https://code.claude.com/docs/en/settings-reference#plansdirectory)                                                                   | Memory and context                 | Any file                |
| [`pluginConfigs`](https://code.claude.com/docs/en/settings-reference#pluginconfigs)                                                                     | Plugins and skills                 | User or managed         |
| [`pluginSuggestionMarketplaces`](https://code.claude.com/docs/en/settings-reference#pluginsuggestionmarketplaces)                                       | Plugins and skills                 | Managed                 |
| [`pluginTrustMessage`](https://code.claude.com/docs/en/settings-reference#plugintrustmessage)                                                           | Plugins and skills                 | Managed                 |
| [`policyHelper`](https://code.claude.com/docs/en/settings-reference#policyhelper)                                                                       | Enterprise and managed settings    | Managed                 |
| [`policyHelper.path`](https://code.claude.com/docs/en/settings-reference#policyhelper-path)                                                             | Enterprise and managed settings    | Managed                 |
| [`policyHelper.refreshIntervalMs`](https://code.claude.com/docs/en/settings-reference#policyhelper-refreshintervalms)                                   | Enterprise and managed settings    | Managed                 |
| [`policyHelper.timeoutMs`](https://code.claude.com/docs/en/settings-reference#policyhelper-timeoutms)                                                   | Enterprise and managed settings    | Managed                 |
| [`preferredNotifChannel`](https://code.claude.com/docs/en/settings-reference#preferrednotifchannel)                                                     | Remote, desktop, and notifications | Any file                |
| [`prefersReducedMotion`](https://code.claude.com/docs/en/settings-reference#prefersreducedmotion)                                                       | Interface and terminal             | Any file                |
| [`prependPlugins`](https://code.claude.com/docs/en/settings-reference#prependplugins)                                                                   | Plugins and skills                 | User or managed         |
| [`processWrapper`](https://code.claude.com/docs/en/settings-reference#processwrapper)                                                                   | Agents, sessions, and worktrees    | User or managed         |
| [`promptCacheTtl`](https://code.claude.com/docs/en/settings-reference#promptcachettl)                                                                   | Model and responses                | Any file                |
| [`promptSuggestionEnabled`](https://code.claude.com/docs/en/settings-reference#promptsuggestionenabled)                                                 | Interface and terminal             | Any file                |
| [`prStatusFooterEnabled`](https://code.claude.com/docs/en/settings-reference#prstatusfooterenabled)                                                     | Global config settings             | Global config           |
| [`prUrlTemplate`](https://code.claude.com/docs/en/settings-reference#prurltemplate)                                                                     | Git and attribution                | Any file                |
| [`remote.defaultEnvironmentId`](https://code.claude.com/docs/en/settings-reference#remote-defaultenvironmentid)                                         | Remote, desktop, and notifications | Any file                |
| [`remoteControlAtStartup`](https://code.claude.com/docs/en/settings-reference#remotecontrolatstartup)                                                   | Remote, desktop, and notifications | Any file                |
| [`requiredMaximumVersion`](https://code.claude.com/docs/en/settings-reference#requiredmaximumversion)                                                   | Updates and versioning             | Managed                 |
| [`requiredMinimumVersion`](https://code.claude.com/docs/en/settings-reference#requiredminimumversion)                                                   | Updates and versioning             | Managed                 |
| [`respectGitignore`](https://code.claude.com/docs/en/settings-reference#respectgitignore)                                                               | Interface and terminal             | Any file                |
| [`respondToBashCommands`](https://code.claude.com/docs/en/settings-reference#respondtobashcommands)                                                     | Interface and terminal             | Any file                |
| [`sandbox`](https://code.claude.com/docs/en/settings-reference#sandbox)                                                                                 | Sandbox settings                   | Any file                |
| [`sandbox.allowAppleEvents`](https://code.claude.com/docs/en/settings-reference#sandbox-allowappleevents)                                               | Sandbox settings                   | User or managed         |
| [`sandbox.allowNestedUserNamespaces`](https://code.claude.com/docs/en/settings-reference#sandbox-allownestedusernamespaces)                             | Sandbox settings                   | User or managed         |
| [`sandbox.allowUnsandboxedCommands`](https://code.claude.com/docs/en/settings-reference#sandbox-allowunsandboxedcommands)                               | Sandbox settings                   | Any file                |
| [`sandbox.autoAllowBashIfSandboxed`](https://code.claude.com/docs/en/settings-reference#sandbox-autoallowbashifsandboxed)                               | Sandbox settings                   | Any file                |
| [`sandbox.bwrapPath`](https://code.claude.com/docs/en/settings-reference#sandbox-bwrappath)                                                             | Sandbox settings                   | Managed                 |
| [`sandbox.credentials`](https://code.claude.com/docs/en/settings-reference#sandbox-credentials)                                                         | Sandbox settings                   | Any file                |
| [`sandbox.credentials.allowPlaintextInject`](https://code.claude.com/docs/en/settings-reference#sandbox-credentials-allowplaintextinject)               | Sandbox settings                   | User or managed         |
| [`sandbox.credentials.awsPairs`](https://code.claude.com/docs/en/settings-reference#sandbox-credentials-awspairs)                                       | Sandbox settings                   | User or managed         |
| [`sandbox.credentials.envVars`](https://code.claude.com/docs/en/settings-reference#sandbox-credentials-envvars)                                         | Sandbox settings                   | Any file                |
| [`sandbox.credentials.files`](https://code.claude.com/docs/en/settings-reference#sandbox-credentials-files)                                             | Sandbox settings                   | Any file                |
| [`sandbox.credentials.sigv4`](https://code.claude.com/docs/en/settings-reference#sandbox-credentials-sigv4)                                             | Sandbox settings                   | User or managed         |
| [`sandbox.enabled`](https://code.claude.com/docs/en/settings-reference#sandbox-enabled)                                                                 | Sandbox settings                   | Any file                |
| [`sandbox.enableWeakerNestedSandbox`](https://code.claude.com/docs/en/settings-reference#sandbox-enableweakernestedsandbox)                             | Sandbox settings                   | Any file                |
| [`sandbox.enableWeakerNetworkIsolation`](https://code.claude.com/docs/en/settings-reference#sandbox-enableweakernetworkisolation)                       | Sandbox settings                   | Any file                |
| [`sandbox.excludedCommands`](https://code.claude.com/docs/en/settings-reference#sandbox-excludedcommands)                                               | Sandbox settings                   | Any file                |
| [`sandbox.failIfUnavailable`](https://code.claude.com/docs/en/settings-reference#sandbox-failifunavailable)                                             | Sandbox settings                   | Any file                |
| [`sandbox.filesystem`](https://code.claude.com/docs/en/settings-reference#sandbox-filesystem)                                                           | Sandbox settings                   | Any file                |
| [`sandbox.filesystem.allowManagedReadPathsOnly`](https://code.claude.com/docs/en/settings-reference#sandbox-filesystem-allowmanagedreadpathsonly)       | Sandbox settings                   | Managed                 |
| [`sandbox.filesystem.allowRead`](https://code.claude.com/docs/en/settings-reference#sandbox-filesystem-allowread)                                       | Sandbox settings                   | Any file                |
| [`sandbox.filesystem.allowWrite`](https://code.claude.com/docs/en/settings-reference#sandbox-filesystem-allowwrite)                                     | Sandbox settings                   | Any file                |
| [`sandbox.filesystem.denyRead`](https://code.claude.com/docs/en/settings-reference#sandbox-filesystem-denyread)                                         | Sandbox settings                   | Any file                |
| [`sandbox.filesystem.denyWrite`](https://code.claude.com/docs/en/settings-reference#sandbox-filesystem-denywrite)                                       | Sandbox settings                   | Any file                |
| [`sandbox.filesystem.disabled`](https://code.claude.com/docs/en/settings-reference#sandbox-filesystem-disabled)                                         | Sandbox settings                   | User or managed         |
| [`sandbox.ignoreViolations`](https://code.claude.com/docs/en/settings-reference#sandbox-ignoreviolations)                                               | Sandbox settings                   | Any file                |
| [`sandbox.network`](https://code.claude.com/docs/en/settings-reference#sandbox-network)                                                                 | Sandbox settings                   | Any file                |
| [`sandbox.network.allowAllUnixSockets`](https://code.claude.com/docs/en/settings-reference#sandbox-network-allowallunixsockets)                         | Sandbox settings                   | Any file                |
| [`sandbox.network.allowedDomains`](https://code.claude.com/docs/en/settings-reference#sandbox-network-alloweddomains)                                   | Sandbox settings                   | Any file                |
| [`sandbox.network.allowLocalBinding`](https://code.claude.com/docs/en/settings-reference#sandbox-network-allowlocalbinding)                             | Sandbox settings                   | Any file                |
| [`sandbox.network.allowMachLookup`](https://code.claude.com/docs/en/settings-reference#sandbox-network-allowmachlookup)                                 | Sandbox settings                   | Any file                |
| [`sandbox.network.allowManagedDomainsOnly`](https://code.claude.com/docs/en/settings-reference#sandbox-network-allowmanageddomainsonly)                 | Sandbox settings                   | Managed                 |
| [`sandbox.network.allowUnixSockets`](https://code.claude.com/docs/en/settings-reference#sandbox-network-allowunixsockets)                               | Sandbox settings                   | Any file                |
| [`sandbox.network.deniedDomains`](https://code.claude.com/docs/en/settings-reference#sandbox-network-denieddomains)                                     | Sandbox settings                   | Any file                |
| [`sandbox.network.httpProxyPort`](https://code.claude.com/docs/en/settings-reference#sandbox-network-httpproxyport)                                     | Sandbox settings                   | Any file                |
| [`sandbox.network.socksProxyPort`](https://code.claude.com/docs/en/settings-reference#sandbox-network-socksproxyport)                                   | Sandbox settings                   | Any file                |
| [`sandbox.network.strictAllowlist`](https://code.claude.com/docs/en/settings-reference#sandbox-network-strictallowlist)                                 | Sandbox settings                   | User or managed         |
| [`sandbox.network.tlsTerminate`](https://code.claude.com/docs/en/settings-reference#sandbox-network-tlsterminate)                                       | Sandbox settings                   | User or managed         |
| [`sandbox.ripgrep`](https://code.claude.com/docs/en/settings-reference#sandbox-ripgrep)                                                                 | Sandbox settings                   | User or managed         |
| [`sandbox.socatPath`](https://code.claude.com/docs/en/settings-reference#sandbox-socatpath)                                                             | Sandbox settings                   | Managed                 |
| [`showClearContextOnPlanAccept`](https://code.claude.com/docs/en/settings-reference#showclearcontextonplanaccept)                                       | Interface and terminal             | Any file                |
| [`showThinkingSummaries`](https://code.claude.com/docs/en/settings-reference#showthinkingsummaries)                                                     | Model and responses                | Any file                |
| [`showTurnDuration`](https://code.claude.com/docs/en/settings-reference#showturnduration)                                                               | Interface and terminal             | Any file                |
| [`skillListingBudgetFraction`](https://code.claude.com/docs/en/settings-reference#skilllistingbudgetfraction)                                           | Memory and context                 | Any file                |
| [`skillListingMaxDescChars`](https://code.claude.com/docs/en/settings-reference#skilllistingmaxdescchars)                                               | Memory and context                 | Any file                |
| [`skillOverrides`](https://code.claude.com/docs/en/settings-reference#skilloverrides)                                                                   | Plugins and skills                 | Any file                |
| [`skipAutoPermissionPrompt`](https://code.claude.com/docs/en/settings-reference#skipautopermissionprompt)                                               | Permission settings                | User or managed         |
| [`skipDangerousModePermissionPrompt`](https://code.claude.com/docs/en/settings-reference#skipdangerousmodepermissionprompt)                             | Permission settings                | User, local, or managed |
| [`skipWebFetchPreflight`](https://code.claude.com/docs/en/settings-reference#skipwebfetchpreflight)                                                     | Privacy and telemetry              | Any file                |
| [`spellcheck`](https://code.claude.com/docs/en/settings-reference#spellcheck)                                                                           | Interface and terminal             | User or managed         |
| [`spinnerTipsEnabled`](https://code.claude.com/docs/en/settings-reference#spinnertipsenabled)                                                           | Interface and terminal             | Any file                |
| [`spinnerTipsOverride`](https://code.claude.com/docs/en/settings-reference#spinnertipsoverride)                                                         | Interface and terminal             | Any file                |
| [`spinnerVerbs`](https://code.claude.com/docs/en/settings-reference#spinnerverbs)                                                                       | Interface and terminal             | Any file                |
| [`sshConfigs`](https://code.claude.com/docs/en/settings-reference#sshconfigs)                                                                           | Remote, desktop, and notifications | User or managed         |
| [`sshHostAllowlist`](https://code.claude.com/docs/en/settings-reference#sshhostallowlist)                                                               | Remote, desktop, and notifications | Managed                 |
| [`sshHostCommands`](https://code.claude.com/docs/en/settings-reference#sshhostcommands)                                                                 | Remote, desktop, and notifications | User or managed         |
| [`statusLine`](https://code.claude.com/docs/en/settings-reference#statusline)                                                                           | Interface and terminal             | Any file                |
| [`strictKnownMarketplaces`](https://code.claude.com/docs/en/settings-reference#strictknownmarketplaces)                                                 | Plugins and skills                 | Managed                 |
| [`strictPluginOnlyCustomization`](https://code.claude.com/docs/en/settings-reference#strictpluginonlycustomization)                                     | Plugins and skills                 | Managed                 |
| [`strictPluginOnlyCustomization.agents`](https://code.claude.com/docs/en/settings-reference#strictpluginonlycustomization-agents)                       | Plugins and skills                 | Managed                 |
| [`strictPluginOnlyCustomization.hooks`](https://code.claude.com/docs/en/settings-reference#strictpluginonlycustomization-hooks)                         | Plugins and skills                 | Managed                 |
| [`strictPluginOnlyCustomization.mcp`](https://code.claude.com/docs/en/settings-reference#strictpluginonlycustomization-mcp)                             | Plugins and skills                 | Managed                 |
| [`strictPluginOnlyCustomization.skills`](https://code.claude.com/docs/en/settings-reference#strictpluginonlycustomization-skills)                       | Plugins and skills                 | Managed                 |
| [`subagentPromptCacheTtl`](https://code.claude.com/docs/en/settings-reference#subagentpromptcachettl)                                                   | Model and responses                | Any file                |
| [`subagentStatusLine`](https://code.claude.com/docs/en/settings-reference#subagentstatusline)                                                           | Interface and terminal             | Any file                |
| [`switchModelsOnFlag`](https://code.claude.com/docs/en/settings-reference#switchmodelsonflag)                                                           | Model and responses                | Any file                |
| [`syncClaudeAiPlugins`](https://code.claude.com/docs/en/settings-reference#syncclaudeaiplugins)                                                         | Plugins and skills                 | User, local, or managed |
| [`syncClaudeAiSkills`](https://code.claude.com/docs/en/settings-reference#syncclaudeaiskills)                                                           | Plugins and skills                 | User, local, or managed |
| [`syntaxHighlightingDisabled`](https://code.claude.com/docs/en/settings-reference#syntaxhighlightingdisabled)                                           | Interface and terminal             | Any file                |
| [`taskOutputMaxChars`](https://code.claude.com/docs/en/settings-reference#taskoutputmaxchars)                                                           | Memory and context                 | Any file                |
| [`teammateDefaultModel`](https://code.claude.com/docs/en/settings-reference#teammatedefaultmodel)                                                       | Global config settings             | Global config           |
| [`teammateMode`](https://code.claude.com/docs/en/settings-reference#teammatemode)                                                                       | Agents, sessions, and worktrees    | Any file                |
| [`terminalProgressBarEnabled`](https://code.claude.com/docs/en/settings-reference#terminalprogressbarenabled)                                           | Interface and terminal             | Any file                |
| [`terminalTitleFromRename`](https://code.claude.com/docs/en/settings-reference#terminaltitlefromrename)                                                 | Interface and terminal             | Any file                |
| [`theme`](https://code.claude.com/docs/en/settings-reference#theme)                                                                                     | Interface and terminal             | Any file                |
| [`timeFormat`](https://code.claude.com/docs/en/settings-reference#timeformat)                                                                           | Interface and terminal             | Any file                |
| [`timeZone`](https://code.claude.com/docs/en/settings-reference#timezone)                                                                               | Interface and terminal             | Any file                |
| [`tui`](https://code.claude.com/docs/en/settings-reference#tui)                                                                                         | Interface and terminal             | Any file                |
| [`ultracode`](https://code.claude.com/docs/en/settings-reference#ultracode)                                                                             | Model and responses                | Any file                |
| [`useAutoModeDuringPlan`](https://code.claude.com/docs/en/settings-reference#useautomodeduringplan)                                                     | Permission settings                | User, local, or managed |
| [`verbose`](https://code.claude.com/docs/en/settings-reference#verbose)                                                                                 | Interface and terminal             | Any file                |
| [`viewMode`](https://code.claude.com/docs/en/settings-reference#viewmode)                                                                               | Interface and terminal             | Any file                |
| [`vimInsertModeRemaps`](https://code.claude.com/docs/en/settings-reference#viminsertmoderemaps)                                                         | Interface and terminal             | User or managed         |
| [`voice`](https://code.claude.com/docs/en/settings-reference#voice)                                                                                     | Interface and terminal             | Any file                |
| [`voiceEnabled`](https://code.claude.com/docs/en/settings-reference#voiceenabled)                                                                       | Interface and terminal             | Any file                |
| [`wheelScrollAccelerationEnabled`](https://code.claude.com/docs/en/settings-reference#wheelscrollaccelerationenabled)                                   | Interface and terminal             | Any file                |
| [`workflowKeywordTriggerEnabled`](https://code.claude.com/docs/en/settings-reference#workflowkeywordtriggerenabled)                                     | Hooks and automation               | Any file                |
| [`workflowSizeGuideline`](https://code.claude.com/docs/en/settings-reference#workflowsizeguideline)                                                     | Hooks and automation               | Any file                |
| [`worktree`](https://code.claude.com/docs/en/settings-reference#worktree)                                                                               | Agents, sessions, and worktrees    | Any file                |
| [`worktree.baseRef`](https://code.claude.com/docs/en/settings-reference#worktree-baseref)                                                               | Agents, sessions, and worktrees    | Any file                |
| [`worktree.bgIsolation`](https://code.claude.com/docs/en/settings-reference#worktree-bgisolation)                                                       | Agents, sessions, and worktrees    | Any file                |
| [`worktree.location`](https://code.claude.com/docs/en/settings-reference#worktree-location)                                                             | Agents, sessions, and worktrees    | User                    |
| [`worktree.sparsePaths`](https://code.claude.com/docs/en/settings-reference#worktree-sparsepaths)                                                       | Agents, sessions, and worktrees    | Any file                |
| [`worktree.symlinkDirectories`](https://code.claude.com/docs/en/settings-reference#worktree-symlinkdirectories)                                         | Agents, sessions, and worktrees    | Any file                |
| [`wslInheritsWindowsSettings`](https://code.claude.com/docs/en/settings-reference#wslinheritswindowssettings)                                           | Enterprise and managed settings    | Managed                 |

## Codex config.toml 字段（305 项）

来源：[Configuration Reference](https://learn.chatgpt.com/codex/config-file/config-reference#configtoml)。名称中的 <id>、<name> 等表示动态键；父表、实验字段、兼容字段与弃用字段均保留，以便查阅。字段含义、类型、默认值、客户端和 Work Cloud 限制以官方参考为准。

- `model`
- `review_model`
- `model_provider`
- `openai_base_url`
- `model_context_window`
- `model_auto_compact_token_limit`
- `model_auto_compact_token_limit_scope`
- `model_catalog_json`
- `oss_provider`
- `approval_policy`
- `approval_policy.granular.sandbox_approval`
- `approval_policy.granular.rules`
- `approval_policy.granular.mcp_elicitations`
- `approval_policy.granular.request_permissions`
- `approval_policy.granular.skill_approval`
- `approvals_reviewer`
- `auto_review.policy`
- `auto_review.extra_policy`
- `allow_login_shell`
- `sandbox_mode`
- `sandbox_workspace_write.writable_roots`
- `sandbox_workspace_write.network_access`
- `sandbox_workspace_write.exclude_tmpdir_env_var`
- `sandbox_workspace_write.exclude_slash_tmp`
- `windows.sandbox`
- `browser_use.allow_history_access`
- `browser_use.default_origin_policy`
- `browser_use.origins.<origin>`
- `computer_use.default_app_access`
- `computer_use.macos.bundle_ids`
- `computer_use.windows.aumids`
- `computer_use.windows.exes`
- `computer_use.windows.always_allowed_app_ids`
- `notify`
- `check_for_update_on_startup`
- `feedback.enabled`
- `analytics.enabled`
- `instructions`
- `developer_instructions`
- `log_dir`
- `sqlite_home`
- `compact_prompt`
- `model_instructions_file`
- `personality`
- `service_tier`
- `experimental_compact_prompt_file`
- `skills.max_context_tokens`
- `skills.config`
- `skills.config.<index>.path`
- `skills.config.<index>.enabled`
- `apps.<id>.enabled`
- `apps._default.enabled`
- `apps._default.destructive_enabled`
- `apps._default.open_world_enabled`
- `apps._default.approvals_reviewer`
- `apps._default.default_tools_approval_mode`
- `apps.<id>.destructive_enabled`
- `apps.<id>.open_world_enabled`
- `apps.<id>.default_tools_enabled`
- `apps.<id>.approvals_reviewer`
- `apps.<id>.default_tools_approval_mode`
- `apps.<id>.tools.<tool>.enabled`
- `apps.<id>.tools.<tool>.approval_mode`
- `tool_suggest.discoverables`
- `tool_suggest.disabled_tools`
- `features.apps`
- `features.hooks`
- `features.code_mode.enabled`
- `features.code_mode.excluded_tool_namespaces`
- `features.code_mode.direct_only_tool_namespaces`
- `features.context_management.experimental_mode`
- `features.rollout_budget.enabled`
- `features.rollout_budget.limit_tokens`
- `features.rollout_budget.reminder_interval_tokens`
- `features.rollout_budget.sampling_token_weight`
- `features.rollout_budget.prefill_token_weight`
- `hooks`
- `hooks.<Event>`
- `hooks.<Event>[].hooks`
- `hooks.<Event>[].hooks[].async`
- `hooks.<Event>[].hooks[].additionalContextLimit`
- `hooks.<Event>[].hooks[].commandWindows`
- `features.memories`
- `mcp_optional_startup_grace_ms`
- `mcp_servers.<id>.command`
- `mcp_servers.<id>.args`
- `mcp_servers.<id>.env`
- `mcp_servers.<id>.env_vars`
- `mcp_servers.<id>.cwd`
- `mcp_servers.<id>.url`
- `mcp_servers.<id>.auth`
- `mcp_servers.<id>.oauth.client_id`
- `mcp_servers.<id>.oauth.client_secret`
- `mcp_servers.<id>.oauth.callback_url`
- `mcp_servers.<id>.oauth.callback_port`
- `mcp_servers.<id>.bearer_token_env_var`
- `mcp_servers.<id>.http_headers`
- `mcp_servers.<id>.http_headers_helper`
- `mcp_servers.<id>.env_http_headers`
- `mcp_servers.<id>.enabled`
- `mcp_servers.<id>.required`
- `mcp_servers.<id>.startup_timeout_sec`
- `mcp_servers.<id>.startup_timeout_ms`
- `mcp_servers.<id>.tool_timeout_sec`
- `mcp_servers.<id>.enabled_tools`
- `mcp_servers.<id>.disabled_tools`
- `mcp_servers.<id>.default_tools_approval_mode`
- `mcp_servers.<id>.tools.<tool>.approval_mode`
- `mcp_servers.<id>.tools.<tool>.output_token_limit`
- `mcp_servers.<id>.scopes`
- `mcp_servers.<id>.oauth_resource`
- `mcp_servers.<id>.experimental_environment`
- `agents`
- `agents.enabled`
- `agents.max_concurrent_threads_per_session`
- `agents.max_threads`
- `agents.default_subagent_model`
- `agents.default_subagent_reasoning_effort`
- `agents.interrupt_message`
- `agents.<name>.description`
- `agents.<name>.config_file`
- `memories.generate_memories`
- `memories.use_memories`
- `memories.disable_on_external_context`
- `memories.max_raw_memories_for_consolidation`
- `memories.max_unused_days`
- `memories.max_rollout_age_days`
- `memories.max_rollouts_per_startup`
- `memories.min_rollout_idle_hours`
- `memories.min_rate_limit_remaining_percent`
- `memories.extract_model`
- `memories.consolidation_model`
- `features.prefer_mxc`
- `features.unified_exec`
- `features.shell_snapshot`
- `features.multi_agent`
- `features.goals`
- `features.remote_plugin`
- `features.personality`
- `features.network_proxy`
- `features.network_proxy.enabled`
- `features.network_proxy.domains`
- `features.network_proxy.unix_sockets`
- `features.network_proxy.allow_local_binding`
- `features.network_proxy.enable_socks5`
- `features.network_proxy.enable_socks5_udp`
- `features.network_proxy.allow_upstream_proxy`
- `features.network_proxy.dangerously_allow_non_loopback_proxy`
- `features.network_proxy.dangerously_allow_all_unix_sockets`
- `features.network_proxy.proxy_url`
- `features.network_proxy.socks_url`
- `features.web_search`
- `features.web_search_cached`
- `features.web_search_request`
- `features.shell_tool`
- `features.enable_request_compression`
- `features.skill_mcp_dependency_install`
- `features.fast_mode`
- `features.ultrafast_mode`
- `features.prevent_idle_sleep`
- `suppress_unstable_features_warning`
- `model_providers.<id>`
- `model_providers.<id>.name`
- `model_providers.<id>.base_url`
- `model_providers.<id>.model_catalog_url`
- `model_providers.<id>.capabilities.external_web_access`
- `model_providers.<id>.capabilities.remote_compaction`
- `model_providers.<id>.env_key`
- `model_providers.<id>.env_key_instructions`
- `model_providers.<id>.experimental_bearer_token`
- `model_providers.<id>.requires_openai_auth`
- `model_providers.<id>.wire_api`
- `model_providers.<id>.query_params`
- `model_providers.<id>.http_headers`
- `model_providers.<id>.env_http_headers`
- `model_providers.<id>.request_max_retries`
- `model_providers.<id>.stream_max_retries`
- `model_providers.<id>.stream_idle_timeout_ms`
- `model_providers.<id>.supports_websockets`
- `model_providers.<id>.supports_standalone_web_search`
- `model_providers.<id>.auth`
- `model_providers.<id>.auth.command`
- `model_providers.<id>.auth.args`
- `model_providers.<id>.auth.timeout_ms`
- `model_providers.<id>.auth.refresh_interval_ms`
- `model_providers.<id>.auth.cwd`
- `model_providers.amazon-bedrock.aws.profile`
- `model_providers.amazon-bedrock.aws.region`
- `model_reasoning_effort`
- `plan_mode_reasoning_effort`
- `model_reasoning_summary`
- `model_verbosity`
- `model_supports_reasoning_summaries`
- `shell_environment_policy.inherit`
- `shell_environment_policy.ignore_default_excludes`
- `shell_environment_policy.filters`
- `shell_environment_policy.exclude`
- `shell_environment_policy.include_only`
- `shell_environment_policy.set`
- `shell_environment_policy.experimental_use_profile`
- `project_root_markers`
- `project_doc_max_bytes`
- `project_doc_fallback_filenames`
- `history.persistence`
- `tool_output_token_limit`
- `background_terminal_max_timeout`
- `history.max_bytes`
- `file_opener`
- `otel.environment`
- `otel.exporter`
- `otel.trace_exporter`
- `otel.metrics_exporter`
- `otel.log_user_prompt`
- `otel.exporter.<id>.endpoint`
- `otel.exporter.<id>.protocol`
- `otel.exporter.<id>.headers`
- `otel.trace_exporter.<id>.endpoint`
- `otel.trace_exporter.<id>.protocol`
- `otel.trace_exporter.<id>.headers`
- `otel.exporter.<id>.tls.ca-certificate`
- `otel.exporter.<id>.tls.client-certificate`
- `otel.exporter.<id>.tls.client-private-key`
- `otel.trace_exporter.<id>.tls.ca-certificate`
- `otel.trace_exporter.<id>.tls.client-certificate`
- `otel.trace_exporter.<id>.tls.client-private-key`
- `desktop.custom_file_handlers.<id>`
- `desktop.custom_file_handlers.<id>.label`
- `desktop.custom_file_handlers.<id>.icon`
- `desktop.custom_file_handlers.<id>.command`
- `desktop.custom_file_handlers.<id>.args`
- `desktop.custom_file_handlers.<id>.input`
- `desktop.custom_file_handlers.<id>.supports_ssh`
- `tui`
- `tui.notifications`
- `tui.notification_method`
- `tui.notification_condition`
- `tui.animations`
- `tui.disable_paste_burst`
- `tui.alternate_screen`
- `tui.resume_cwd`
- `tui.vim_mode_default`
- `tui.raw_output_mode`
- `tui.show_tooltips`
- `tui.auto_recap`
- `tui.show_server_version_notice`
- `tui.status_line`
- `tui.terminal_title`
- `tui.theme`
- `tui.keymap.<context>.<action>`
- `tui.keymap.<context>.<action> = []`
- `marketplaces.<name>.source_type`
- `marketplaces.<name>.source`
- `marketplaces.<name>.ref`
- `marketplaces.<name>.sparse_paths`
- `plugins.<plugin>.enabled`
- `plugins.<plugin>.mcp_servers.<server>.enabled`
- `plugins.<plugin>.mcp_servers.<server>.default_tools_approval_mode`
- `plugins.<plugin>.mcp_servers.<server>.enabled_tools`
- `plugins.<plugin>.mcp_servers.<server>.disabled_tools`
- `plugins.<plugin>.mcp_servers.<server>.tools.<tool>.approval_mode`
- `tui.model_availability_nux.<model>`
- `hide_agent_reasoning`
- `show_raw_agent_reasoning`
- `disable_paste_burst`
- `windows_wsl_setup_acknowledged`
- `chatgpt_base_url`
- `cli_auth_credentials_store`
- `mcp_oauth_credentials_store`
- `mcp_oauth_callback_port`
- `mcp_oauth_callback_url`
- `experimental_use_unified_exec_tool`
- `tools.web_search`
- `tools.view_image`
- `web_search`
- `default_permissions`
- `permissions.<name>.description`
- `permissions.<name>.extends`
- `permissions.<name>.workspace_roots`
- `permissions.<name>.workspace_roots.<path>`
- `permissions.<name>.filesystem`
- `permissions.<name>.filesystem.glob_scan_max_depth`
- `permissions.<name>.filesystem.<path-or-glob>`
- `permissions.<name>.network.enabled`
- `permissions.<name>.network.proxy_url`
- `permissions.<name>.network.enable_socks5`
- `permissions.<name>.network.socks_url`
- `permissions.<name>.network.enable_socks5_udp`
- `permissions.<name>.network.allow_upstream_proxy`
- `permissions.<name>.network.dangerously_allow_non_loopback_proxy`
- `permissions.<name>.network.dangerously_allow_all_unix_sockets`
- `permissions.<name>.network.mode`
- `permissions.<name>.network.domains`
- `permissions.<name>.network.domains.<pattern>`
- `permissions.<name>.network.unix_sockets`
- `permissions.<name>.network.unix_sockets.<path>`
- `permissions.<name>.network.allow_local_binding`
- `projects.<path>.trust_level`
- `notice.hide_full_access_warning`
- `notice.hide_world_writable_warning`
- `notice.hide_rate_limit_model_nudge`
- `notice.hide_gpt5_1_migration_prompt`
- `notice.hide_gpt-5.1-codex-max_migration_prompt`
- `notice.model_migrations`
- `forced_login_method`
- `forced_chatgpt_workspace_id`

## 使用边界

- 全量索引用于发现字段；可视化界面应只开放已核对版本、写入位置和合并规则的选项。
- 不把组织托管策略、只读状态和宿主注入变量作为普通用户设置。
- 不把 Claude Code 的字段名称或可选值复制到 Codex，反之亦然。
- 这些条目的长期可用性不能由本快照保证；落地时按检测到的 CLI 版本核对官方资料。
