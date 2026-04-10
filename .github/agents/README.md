# VS Code Chat Agents

This directory defines workspace-scoped custom agents for GitHub Copilot Chat in VS Code.

Available chatbox agents:

- `Claude`
- `Gemini`
- `Codex`
- `Qwen`
- `Copilot`
- `Grok` (legacy alias for the Copilot lane)

How to use them:

1. Open the repository in VS Code.
2. Open Copilot Chat.
3. Use the agent picker in the chatbox.
4. Select the worker that matches the capability lane you want.

These agents mirror the orchestrator lane definitions in `.orchestrator/config.json` and the canonical collaboration rules in `AI_COLLABORATION_GUIDE.md`.
