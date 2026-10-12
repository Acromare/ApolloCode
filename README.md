# Apollo Code ☀️

> Bring an idea. Open your workspace. Build something useful.

Apollo Code is a desktop AI workspace for the moments when a conversation needs to become working code. Ask a question, explore a project, fix a bug, or put a repeatable task into a workflow—all from one place.

**Talk it through. Make a plan. Let Apollo help you build.**

[📦 Download for Windows](https://github.com/Acromare/ApolloCode/releases/latest) · [🚀 Quick start](#quick-start) · [✨ What's new](#whats-new-in-060) · [📖 Documentation](#documentation)

## A workspace for your next idea

Start with the model you already use. Apollo connects to OpenAI-compatible services, Anthropic, and local Ollama models. You can also use an installed Claude Code CLI.

Pick a project and tell Apollo what you want to do. It can read the code, explain how it fits together, propose changes, apply a patch, and run your tests. Keep the conversation focused; open the work details whenever you want to see what happened.

For tasks beyond your editor, connect an MCP tool, add a skill, or authorize a browser or Windows application. Save a useful sequence as a workflow and come back to it next time.

## Quick start

### 1. Install Apollo

Download the Windows x64 installer from [Releases](https://github.com/Acromare/ApolloCode/releases/latest), run it, and open Apollo Code.

### 2. Connect your model

Open the model settings, choose your provider, and enter its API URL and key. Select a model from the available list or enter its ID, then test the connection.

OpenAI-compatible providers support both Responses and Chat Completions. Leave the protocol on automatic, or select the interface your provider recommends.

### 3. Choose a project and start a conversation

Try something small:

> Explain this project and show me where the application starts.

Then give Apollo a concrete task:

> Find why this test fails, propose a fix, and run the tests after I approve it.

Choose **Chat** to talk, **Plan** to explore without edits, or **Agent** to work through changes with approval. **YOLO** is available when you want fewer interruptions; browser and desktop actions still ask for approval.

## What's new in 0.6.1

- **A heads-up when there is something new.** Release notifications show the version and changes. Open the download page when you are ready, or ask Apollo to remind you later.
- **More ways to build.** Run Shell commands, commit selected files, push changes, and prepare a GitHub draft PR. TS/JS language tools help inspect diagnostics, definitions, and references.
- **A second pair of eyes.** Give the model browser or authorized Windows screenshots, then use clicks, typing, hotkeys, scrolling, and dragging to work with the page or application.
- **Workflows you can shape.** Add model, Shell, or test steps; connect dependencies and choose what happens after success or failure.
- **Context that lasts longer.** Summarize older conversation history and optionally suggest stable preferences for you to save as memory. Read-only subtasks can run in parallel.
- **Your connections, kept locally.** Saved Windows credentials use current-user encryption. Model configuration now includes an explicit API protocol choice.

## Make it yours

**Skills** hold instructions you want Apollo to reuse. Enable the built-in skills, import a SKILL.md, or write your own.

**MCP** connects tools you already have. Configure a local process or HTTP endpoint, then select which tools Apollo can use.

**Workflows** turn a recurring task into a sequence you can inspect and reuse. Each run keeps its results, so you can see where it stopped and decide how to continue.

**Day and night themes** give the workspace two moods. Switch with the sun or moon button; Apollo remembers your choice.

## Documentation

- [Capabilities and current scope](STATUS.md)
- [Releases and updates](RELEASING.md)
- [Windows signing setup](SIGNING.md)

## Build from source

```powershell
npm install
npm run build
npm test
npm run dev
```

To build a Windows installer:

```powershell
node scripts/build-release.cjs
```

## Contributing

Have a task Apollo could handle better? Open an [issue](https://github.com/Acromare/ApolloCode/issues) with a small example. Ideas, fixes, and focused pull requests are welcome.

---

Made for curious builders. Open a workspace. Follow an idea. **Enjoy! 💜**

