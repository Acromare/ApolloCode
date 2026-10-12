# Apollo Code

Windows 桌面 Agent，带专属图标、安装程序、桌面和开始菜单快捷方式。

## 日间与夜间主题

右上角太阳/月亮按钮切换主题。夜间使用星空，日间使用阿波罗雕像背景，主界面按两张参考图重新排版。
切换采用圆形展开动画，系统开启减少动画时立即切换。选择保存在本机，不进入模型上下文、不产生 API 请求。
所有管理页、聊天和弹窗同步换色。图标沿用用户指定的紫色星标。

## 模型与供应商

在模型入口填写一次供应商 URL 和 API Key，自动获取列表后选择模型，无需填写模型 ID。
支持 OpenAI 兼容、Anthropic 和 Ollama；Claude Code CLI 使用已安装并登录的本地 CLI。
模型列表依赖供应商提供 /models；列表出现不代表一定有额度。连接测试最多请求 8 输出 Token。

## Skills、MCP 与设置

Skills 页面启用、导入、创建、编辑和选用技能；外置技能位于 %USERPROFILE%\.apollocode\skills。
内置正文按需加载，不会每轮全部发送。MCP 页面配置 stdio 或 Streamable HTTP、
环境变量或鉴权请求头；连接后选择允许模型看到的工具。

输入区选择 Chat / Plan / Agent / YOLO。Plan 只读分析；Agent 修改补丁、执行测试和调用
MCP 前确认。Workspace 查看原始 diff、审批补丁、回滚最近变更。测试脚本和 MCP 进程不是 OS 沙箱。

设置提供 Token 预算、供应商切换、用户批准记忆和用量。默认上下文 8192、输出 768、
工具输出 1000 个估算 Token、最多 6 轮；历史按预算裁剪，不进行额外模型摘要请求。
实际 Token 以服务商 usage 为准；本地估算不保证与不同厂商完全一致。费用须填写价格，
不承诺固定节省比例。Claude Code CLI 使用自己的运行时，不适用 API 工具循环。

API Key 保存在 Electron 用户数据目录的 config.json 和 runtime/providers.json。
MCP 凭证也保存在本机配置中，未加密。聊天记录仅保存在本机；附件仅支持 100 KB 内文本。
过滤不能替代用户检查。完整功能和未完成项见 STATUS.md。

## 工作流与操作

Workflows 内置开发与桌面自动化两类流程。填写任务，可编辑步骤指令；创建后开始，查看规划结果，再批准继续。
各危险阶段分别停在审核处。失败或应用退出不会自动重试；检查实际结果后可手动重试。
工作流绑定创建时项目及模型，结果保存于 Electron 用户数据 runtime/workflows.json；补丁提供回滚按钮。

Automation 浏览器页打开独立受控窗口，读取控件，选择点击或填入文本；相机按钮仅本地预览，不自动发送截图。
Windows 页先读取窗口列表，再选择并授权目标窗口。Agent 使用操作工具还需勾选相应开关。
浏览器与 Windows 操作不因 YOLO 自动获批。审批日志在 runtime/approvals.log。
当前仅支持语义控件，不是任意屏幕视觉鼠标代理；密码、提权及不暴露控件的画布不支持。
外部网页/应用操作没有通用回滚，中断不能逆转已完成的操作。

## 构建

```powershell
npm install
npm run build
npm test
npm run test:ui
npm run test:theme
npm run test:automation
npm run test:native
npm run dev
npm run make
```

安装输出在 release，可选择目录并创建快捷方式；make:portable 生成便携版。
源码含 src、desktop、assets、scripts、test、bin；已提供图标。
npm run dev 启动桌面窗口，不需要浏览器开发服务器。
安装包不含用户密钥、聊天记录或 Hermes 私人配置。
