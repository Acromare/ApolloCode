# 2026-10-13 本地验收

本文记录 2026-10-13 的本地验收；该轮目录版使用 0.7.1，相关修改进入 0.7.2 发布。正式本地安装包为 `release-0.7.2/Apollo-Code-Setup-0.7.2-x64.exe`，便携版为 `release-0.7.2/Apollo-Code-Portable-0.7.2-x64.exe`。旧的已安装 0.7.1 不包含这些修改。

## 启动

退出旧 Apollo Code，下载安装 `Apollo-Code-Setup-0.7.2-x64.exe` 后从快捷方式启动，或直接运行 `Apollo-Code-Portable-0.7.2-x64.exe`。确认设置中的版本为 0.7.2，再按下列步骤验收。开发者也可在源码目录运行 `npm run dev`。

## 布局验收

1. 深浅与日月同辉主题各试一次：对话切换到设置后，对话应取消选中；设置固定左侧底部，与列表有分隔和留白。
2. 900×600、1440×860、最大化/全屏检查：设置标题远离顶部控件，内容可滚动；对话多时只滚动列表，设置入口不移动。原日夜背景保留；输入框、快捷卡片与顶部控件呈半透明玻璃质感。
3. 展开模型列表后切页：旧浮层关闭；返回聊天时原内容保留。
4. English / 简体中文切换：任务、记忆、技能修订控件同步切换。

## 能力验收

- **跨对话检索**：设置的记忆分类中开启允许 Agent 检索历史。同一项目聊天写“数据库选 SQLite”，新建聊天，用 Agent/计划模式要求检索。工作过程应出现 `search_history` 和来源片段；其他项目不能检索到。普通聊天模式不提供该工具。关闭并清除索引后不可检索，原聊天保留。
- **任务记录**：Agent 模式要求记录计划与下一步，检查 `update_task`；项目页查看计划、下一步、最近操作。停止/退出后重启，未完成任务标记中断；返回对话只打开聊天，不自动执行。继续前仍需验证文件现状。
- **技能学习**：要求保存经过验证的流程，检查 `learn_skill` 和审批；拒绝时不保存，YOLO 也需批准。批准后在技能页查看启用状态和修订记录，再修订一次应保留原文。模型是否调用工具需看实际工作过程。修订记录可选择旧版，批准后恢复。

历史召回默认关闭。索引和任务状态保存在本机，有数量上限和凭据脱敏，不是完整加密会话保险库。批准技能后会启用于后续请求。Claude CLI 不使用这些新增原生工具。

- **暂停与转向**：Agent 执行时点击暂停，等状态变为已暂停；在输入框追加要求不会自动恢复。点击继续后按新要求工作。暂停在模型/工具边界生效，已执行的动作不会撤销。
- **工作树**：在 Git 项目要求隔离可写子任务，批准后创建独立 worktree。项目页查看状态、目录和与基线差异；不会自动合并。工作树隔离文件，不能隔离操作系统权限。
- **定时任务**：自动化页创建单次/间隔/cron，初始关闭；启用与立即执行需批准。应用运行时触发；不补跑关闭期间的任务。结果保存在自动化页，完成提示在首页/对话显示。
- **执行后端**：设置的执行分类可选择本机、Docker、SSH、Singularity。外部后端需要自行配置基础设施，本轮没有连接真实远端或容器。

## 验证结果

- `npm test`：64 项通过，包括本机 Shell/Git/LSP、检索隔离、重启状态、技能审批/修订/脱敏和流错误脱敏。
- `npm run build`：生产构建与 TypeScript 检查通过。
- 本轮 `test:ui`、`test:theme`、`test:activity` 通过，覆盖双语、模型设置、三主题与工作过程。
- `test:advanced-ui`：真实 Electron IPC 的暂停/继续、转向顺序、Windows CRLF 补丁、FTS5、定时任务审批与结果、执行设置、工作树入口通过。截图在 `work/glass-home-acceptance.png`、`work/glass-paused-acceptance.png`。
- `test:layout`：六种尺寸/主题组合、两次真实全屏及真实 IPC 检查通过。证据在 `work/layout-journal-report.json`、`work/acceptance-settings-*.png`。
- 本轮毛玻璃目录版 EXE 已通过打包后隔离自检：依赖、11 个内置技能、cron 解析、真实 SQLite FTS5 检索、真实 TS LSP 诊断、审批 Shell、Windows 凭证加密与重新读取；报告在 `work/acceptance-glass-packaged-qa/report.json`。
- 正式 0.7.2 的打包程序已重新通过以上全部自检，且包内 7 个生产界面文件与构建输出一致。Release 附带 `Apollo-Code-0.7.2-package-test.json` 供核查。
- **本次真实模型未通过**：保存的 `www.kldai.cc / gpt-5.5` 首轮返回 `Upstream HTTP/2 stream failed`，未执行工具。记录在 `work/live-agent-last-attempt.json`。已补来源提示，具体服务故障原因未证实；未更改模型/协议或绕过 TLS。这不能算完整模型任务验收。

## 项目评估

主要依据 README 与元数据，未逐一运行第三方代码，未自动安装技能。快照及 README SHA/许可证信息在 `work/agent-references/`；tack 另有前次源码审阅快照。

| 项目 | 实际帮助与本次取舍 |
|---|---|
| [Hermes](https://github.com/NousResearch/hermes-agent) | 历史召回、学习与长期任务；本次补历史检索、持久任务、审批技能修订、协作式暂停、调度和工作树基础能力，完整差距见 `HERMES-PARITY.md` |
| [tack-harness](https://github.com/frcoder-lh/tack-harness) | 状态持久化、纠错沉淀、按需加载；原生实现任务记录与技能修订，未嵌入 Bash 安装脚本；README MIT 与未找到 LICENSE 的差异待核查 |
| [MachineGPT/agent](https://github.com/MachineGPT/agent) | 显式状态机和恢复边界；参考中断状态与避免重放设计，未替换 Electron 运行时 |
| [AI-agent-book](https://github.com/Bojieli/AI-agent-book) | 工具循环、上下文、评估实验；用于后续成功率/延迟测评，不是直接安装的运行时 |
| [agency-agents](https://github.com/msitarzewski/agency-agents) | 可选角色与交付模板；角色提示词不能证明执行能力变强 |
| [noobnooc/agent](https://github.com/noobnooc/agent) | 编码可靠性、发布审查技能；适合后续逐个审查后导入，未安装 |
| [Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM) | 视觉动作循环参考；手机 ADB/HDC 路线，不能直接作为 Windows 插件 |
| [AI-Coding-Guide-zh](https://github.com/KimYx0207/AI-Coding-Guide-zh)、[Codefather](https://github.com/Liyupi/Codefather) | 教程资料，不并入核心 |
| [AgentGPT](https://github.com/reworkd/AgentGPT) | 自主任务循环/界面参考；GPL-3.0 代码未复制到 MIT 产品 |
| [TradingAgents](https://github.com/TauricResearch/TradingAgents) | 金融领域任务，不匹配当前编码/桌面用途 |
| [Freysa](https://github.com/0xfreysa/agent) | 区块链资金池和提示攻击游戏，不接入 |
| [Kerberos](https://github.com/Kerberos-io/agent)、[Open-Falcon](https://github.com/Open-Falcon-Archive/agent)、[DWService](https://github.com/DWService/agent) | 视频监控、系统监控、远程支持，名称含 agent，但不是通用 LLM 执行框架 |

截图里部分提示词集合/基础设施资料未确认准确地址，未声称已审查源码。不会把别的产品提示词集合全部注入模型。

Hermes 仍缺更广供应商/OAuth、消息与语音网关、云执行适配、Honcho/向量记忆和自动技能质量学习。本次改善工具和连续任务支持，没有更换或训练底层模型。
