# agent-canvas

> [!WARNING]
> This project is in alpha phase. It may be vibecoded, untested, or out of date. [Learn more](https://github.com/OpenHands/incubator-program).

OpenHands is a platform for orchestrating coding agents across different environments. You can:

- ⌨️ prompt agents manually
- 🕐 run agents on a schedule
- ⚡ trigger agents automatically — e.g. from Slack, GitHub, or Datadog.

Agents can run anywhere:

- 🧑‍💻 on your laptop
- 🖥️ on a remote virtual machine
- ☁️ in our hosted cloud
- 🏢 or inside your company’s infrastructure

The same Agent Canvas frontend can swap between each of these environments, so you can see everything in one place.

OpenHands works with any agent harness (e.g. Claude Code, Codex)
or connect directly to an LLM (e.g. Anthropic, OpenAI, Gemini, Mistral, Minimax, Kimi).

If you have questions or feedback, please open a GitHub issue or join the [#proj-agent-canvas channel in Slack](https://openhands.dev/joinslack)

<img width="1509" height="826" alt="Screenshot 2026-05-11 at 10 13 19 AM" src="https://github.com/user-attachments/assets/71ef41ae-8f6d-4fbf-990f-d672175d93d1" />

## Quickstart

### Install with npm (recommended)

> [!WARNING]
> This runs the agent-server directly on your machine — the agent will have full access to your filesystem.

**Prerequisites**: [Node.js 22+](https://nodejs.org/) and [uv](https://docs.astral.sh/uv/getting-started/installation/)

```sh
npm install -g @openhands/agent-canvas
agent-canvas
```

Open [http://localhost:8000](http://localhost:8000). LLM settings and workspace folders are configured through the UI — no environment variables required.

### Install with Docker

```sh
docker run -p 8000:8000 ghcr.io/openhands/agent-canvas
```

Open [http://localhost:8000](http://localhost:8000).

### More options

You can run OpenHands on any machine: your laptop, a Mac Mini, or a cloud server.
Running on a remote server lets agents keep working when your laptop is off, and
makes it easier to trigger agents from Slack, GitHub, or Datadog.
See [SELF_HOSTING.md](SELF_HOSTING.md) for details on security hardening.

You can also connect the Agent Canvas frontend to _multiple_ Agent Servers and
switch between them from the UI — e.g. a shared server for code review plus a
personal one on your laptop.

Watch the video on how to run this on [Mac](https://www.youtube.com/watch?v=BenkkQmmFCg) or [Windows](https://www.youtube.com/watch?v=WAxf_RRIrB8).

# Architecture

Agent Canvas is powered by the [OpenHands Agent Server](https://github.com/OpenHands/software-agent-sdk/tree/main/openhands-agent-server/openhands/agent_server), a REST API for running multiple agents on a single machine. Each Agent Server runs on a single host/port; the Agent Canvas can connect to multiple Agent Servers and easily flip between them.

You can run an Agent Server anywhere:

- Directly on your laptop (be careful!)
- Inside a Docker container
- On a dedicated machine like a Mac Mini
- On a virtual machine in the cloud
- Inside a Kubernetes Pod
- Inside OpenHands Cloud (our commercial offering)

The Agent Server is often paired with an [Automation Server](https://github.com/OpenHands/automation), which lets you set up agents that run on a schedule or in response to events.

<img width="1456" height="1258" alt="image" src="https://github.com/user-attachments/assets/cb6de6f5-ac30-4d04-a76a-b5c259f0c163" />

## More documentation

For contributor and developer workflows, including frontend-only mode, mock mode, environment variables, and build/test commands, see [DEVELOPMENT.md](./DEVELOPMENT.md).
