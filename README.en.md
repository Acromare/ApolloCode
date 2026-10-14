# Apollo Code

Current release **0.8.2** adds the bundled Hermes backend, concurrent chats, multiple file attachments, and streaming responses. Python and dependencies are included; existing settings and chat history are preserved. See the [release](https://github.com/Acromare/ApolloCode/releases/tag/v0.8.2) and [capability status](STATUS.md).

**Bring your own model. Build with reusable Skills and control over token usage.**

Apollo Code is a desktop agent workspace for coding and automation. Connect your provider and credentials; Apollo supplies Skills, project tools, and context management. The application does not bundle model weights or a shared model account. Local models can be connected through an Ollama service you deploy separately.

[Download for Windows](https://github.com/Acromare/ApolloCode/releases/latest) · [简体中文](README.md) · [Current capabilities](STATUS.md)

![Apollo Code eclipse theme](assets/screenshots/home-0.7.2.png)

*Interface preview. You configure the model yourself.*

## Start with a real task

Ask Apollo to explain a repository, diagnose a failing test, apply a focused patch, or turn a repeated procedure into a workflow. Conversations, projects, and settings have separate spaces. Activity stays compact until you expand it to inspect tool operations and results.

Skills supply reusable methods, tools connect the model to actual files, and context controls reduce repeated or irrelevant information. Your connected model performs the reasoning and generation.

## Quick start

1. Download the Windows x64 installer from [Releases](https://github.com/Acromare/ApolloCode/releases/latest).
2. Open **Settings → Models & providers**. Enter your API URL and key, choose a model, and test the connection.
3. Choose a project directory and start with a verifiable task: “Explain this project's entry point without changing files.”
4. Use Agent mode for approved edits and execution: “Find why this test fails, propose a fix, then apply it and run the relevant tests after approval.”

Supported connections include OpenAI-compatible Responses/Chat Completions, Anthropic, separately deployed Ollama services, and an installed Claude Code CLI. Responses reasoning effort is configurable when the provider supports it. Tool use and vision support depend on the actual model service.

| Mode | Purpose |
|---|---|
| Chat | Conversation without native execution tools |
| Plan | Read and analyze a project |
| Agent | Execute tasks with operation approvals |
| YOLO | Reduce routine confirmations; selected sensitive actions still require approval |

The composer supports multiline text and text-file drop/paste. Enter sends; Shift+Enter inserts a line break. During native Agent tasks, add instructions for a later model turn or pause and resume at model/tool boundaries. Pausing does not undo completed operations. Claude CLI currently provides a stop control only.

## Skills you can extend

Eleven built-in Skills cover planning, repository navigation, focused patches, code review, tests, Git, data analysis, path checks, token-saving habits, context compression, and context optimization.

Enable Skills in the Skills page or import a SKILL.md. In Agent and Plan modes, a compact catalog lets the model load relevant procedures when needed. Explicitly selecting a Skill includes its instructions in the request. Verified procedures can become new Skills after approval, with revision history and approved restoration.

See the [Skill catalog](README.md#内置-skills) and [third-party notices](THIRD-PARTY-NOTICES.md).

## Spend context on useful information

- Load relevant Skills rather than repeatedly including every procedure.
- Filter repeated tool output and progress logs; send bounded diagnostic excerpts.
- Set context and output budgets, summarize older history, and reuse cached summaries.
- Optionally retrieve matching project-history excerpts instead of bulk history.
- Inspect reported input/output/cached tokens, estimated output reductions, and cost estimates based on your configured prices.

Summaries, memory extraction, and parallel tasks also make model requests. Savings depend on the task and configuration; estimates can differ from provider billing.

## Tools and continuity

Apollo supports file tools, patches, approved Shell commands, project tests, Git operations, GitHub draft PRs, TS/JS language tools, and MCP. Authorized browser and Windows actions support screenshots, clicks, input, scrolling, and dragging.

Task progress persists across restarts. Project-scoped history search is optional and disabled by default. Skills and long-term memory require approval before saving.

Up to three read-only subtasks can investigate in parallel. Approved writable subtasks use separate Git worktrees retained for review, with status, folder, and diff controls. Changes are not automatically merged.

Editable workflows combine model, Shell, and test steps. One-time, interval, and cron schedules run while the application is open; missed runs are not replayed. Terminal settings offer local, Docker, SSH, and Singularity adapters that require your own infrastructure.

## Themes and updates

Day, night, and eclipse themes use translucent controls and a refined composer. Simplified Chinese and English preferences persist.

Stable releases trigger a version-and-notes dialog. Download opens the GitHub release page for manual installation; Apollo does not automatically upgrade. Manual checks are available in Settings, and automatic dialogs wait for active tasks to finish.

## What's new in 0.7.2

- Refined navigation, settings spacing, glass surfaces, and eclipse artwork.
- Native pause/resume, queued instructions, and Windows CRLF patch preservation.
- SQLite FTS5 project-history search, durable task progress, and Skill revision restoration.
- Approved writable worktree subtasks, scheduling, and external terminal settings.
- Expanded documentation around user-connected models, Skills, and token efficiency.

## Practical tips and troubleshooting

Give the agent a goal, a scope, and a way to verify the result. For example: “Fix the login page's endless loading state. Inspect the relevant files, preserve the current styling, run the related tests, and describe a manual acceptance check.” Start with Plan to understand a new repository, then use Agent for implementation.

If the model cannot edit files, check that a project is selected and Agent mode is active. Chat does not expose native execution tools. Your provider must support tool calls for the chosen protocol, and an operation may be waiting for approval.

A successful connection check does not verify every streaming, tool, or image request. For upstream access or HTTP/2 failures, check the protocol, provider restrictions, and server logs. Summary generation also costs tokens; use it where shorter subsequent requests justify the extra call.

If no update dialog appears, check manually in Settings or visit the download page. Active tasks and a recent “Remind me later” choice can delay automatic notifications. For issue reports, include the application and Windows versions, protocol, reproduction steps, and redacted errors. Never include API keys or private credential files.

## Scope and validation

Windows x64 is the primary release target. Local commands and MCP run with the current user's permissions; worktrees isolate directories rather than operating-system access. External Docker/SSH/Singularity adapters have configuration and argument checks but have not all been exercised against real infrastructure. Messaging/voice gateways, vector memory, and further cloud adapters remain future work.

The build passes 64 automated tests and Electron UI checks. Packaged checks cover dependencies, Skills, FTS5, LSP, Shell, and credential reopening. Not every real provider workflow is verified; test against your own provider and environment. Current Windows packages are unsigned.

[Acceptance record](ACCEPTANCE-2026-10-13.md) · [Release guide](RELEASING.md) · [Signing](SIGNING.md) · [Issues](https://github.com/Acromare/ApolloCode/issues)

## Build from source

```powershell
npm install
npm test
npm run build
npm run dev
```

Use `npm run make` for an installer and `npm run make:portable` for a portable launcher. Portable mode also stores local configuration and history; it does not keep all data beside the EXE.

Contributions with reproducible tasks, protocol feedback, and verified Skills are welcome. [MIT License](LICENSE).
