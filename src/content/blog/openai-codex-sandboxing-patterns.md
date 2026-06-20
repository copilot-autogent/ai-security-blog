---
title: "Running Codex Safely at OpenAI — Sandboxing Patterns"
description: "OpenAI's Codex runs every model-generated command inside an OS-enforced sandbox before it touches your filesystem or network. This post breaks down the layered isolation model — platform mechanics, approval flows, auto-review, and cloud isolation — and what each layer actually prevents."
pubDate: 2026-06-20
tags: ["agent-security", "sandboxing", "defense-patterns", "openai", "tool-use"]
---

When an AI coding agent executes a shell command, the attack surface is not just the model's intent — it's every tool call the model emits, every subprocess those tools spawn, and every byte that crosses a network boundary. OpenAI's Codex addresses this with a layered sandbox model that enforces technical boundaries before approvals even come into play. Understanding each layer tells you what you're actually trusting when you let an agent run commands on your machine.

## The Separation of Controls

Codex's security model distinguishes between two separate concerns that are frequently conflated:

**Sandbox mode** defines what the agent can do *technically* — which paths it can write to, whether subprocesses can use the network, and how aggressively commands are isolated from the host. The sandbox applies not just to Codex's own file operations but to every subprocess it spawns: `git`, package managers, test runners, and build tools all inherit the same boundary.

**Approval policy** defines *when* Codex must stop and ask before acting. This is a softer control that sits on top of the technical boundary. The sandbox can block an action outright; the approval policy can allow the same action but require confirmation first.

The two interact predictably: a tight sandbox reduces the universe of actions that could happen without approval. A loose sandbox means approvals are doing more work. When you set `--dangerously-bypass-approvals-and-sandbox` (the `--yolo` flag), you're removing both controls simultaneously — the filesystem and network limits disappear along with the approval prompts.

## Platform-Specific Enforcement

Codex enforces the sandbox through OS-native mechanisms rather than a single cross-platform layer. The underlying primitives differ, but the behavioral contract is the same: commands run inside a constrained context that prevents them from reading or writing outside their allowed scope by default.

**macOS** uses Apple's Seatbelt framework. Commands run via `sandbox-exec` with a profile that corresponds to the active sandbox mode. When restricted read access is enabled, Codex appends a curated macOS platform policy to preserve compatibility with common developer tools rather than broadly allowing the entire `/System` directory.

**Linux** uses `bubblewrap` (`bwrap`) combined with `seccomp` BPF filtering. Bubblewrap creates an unprivileged user namespace containing the subprocess, and seccomp filters constrain which syscalls it can make. This combination means even a sandboxed command that tries to escalate via a kernel syscall not on the allowlist will be denied at the kernel level. The `bwrap` executable must be installed separately on Linux (`sudo apt install bubblewrap`); without it, Codex falls back to a bundled helper that has its own namespace requirements. Ubuntu 24.04 users may need to explicitly load an AppArmor profile to allow unprivileged user namespace creation.

**Windows** uses the native Windows Sandbox when running in PowerShell, and the Linux sandbox implementation when running inside WSL2. WSL1 support was dropped in Codex 0.115 when the Linux sandbox moved to `bwrap`.

All three platforms support a `codex sandbox <platform> [COMMAND]` debugging command that lets you run an arbitrary shell command inside the sandbox directly, making it straightforward to test whether a specific tool invocation would be blocked before wiring it into an agent workflow.

## Sandbox Modes

Three modes cover most operational patterns:

`read-only` limits Codex to file inspection only. It can read files and answer questions, but editing, command execution, and network access all require approval. This is Codex's recommended default for non-version-controlled directories.

`workspace-write` is the default for version-controlled projects. Codex can read files, make edits within the working directory, and run routine local commands automatically. Network access is off by default in this mode; enabling it requires explicit configuration (`sandbox_workspace_write.network_access = true`). This mode also enforces a set of protected paths that remain read-only even within the writable workspace.

`danger-full-access` removes sandbox restrictions entirely. No filesystem limits, no network restrictions. OpenAI's own documentation marks this as elevated risk and does not recommend it for most workflows.

## Protected Paths

In `workspace-write` mode, three path categories remain read-only regardless of the writable roots configuration:

- `.git` (or the resolved Git directory for worktrees) — prevents the agent from modifying repository history, hooks, or remotes
- `.agents` — reserved for agent coordination artifacts
- `.codex` — Codex's own configuration and session state

These protections are recursive: everything under these directories is read-only. The intent is that even a fully autonomous agent working inside a workspace cannot accidentally or deliberately corrupt version control state or override its own safety configuration.

## Network Isolation

Network access is off by default in `workspace-write` mode. When you do enable it, Codex provides a domain-level policy layer through the `network_proxy` feature:

```toml
[features.network_proxy]
enabled = true
domains = { "api.openai.com" = "allow", "example.com" = "deny" }
```

The policy uses an allowlist-first model with several precision levels: exact hostnames match only themselves; `*.example.com` matches subdomains but not the apex; `**.example.com` matches both. A global `*` allow rule grants broad network access — effectively the same as unrestricted outbound — and should be treated accordingly. Deny rules always take precedence over allow rules.

By default, loopback, link-local, and private addresses are blocked (`allow_local_binding = false`). Hostnames that resolve to non-public IP addresses remain blocked even if they match an allow rule. Before allowing a connection, Codex performs a DNS and IP classification check to reduce DNS rebinding risk, though this doesn't eliminate it entirely: if hostile DNS is in scope for your environment, egress controls at the OS or network layer are the appropriate complement.

The `network_proxy` feature does not grant network access by itself. You must also enable `sandbox_workspace_write.network_access = true`. The proxy layer only constrains traffic after network access is on.

Two settings explicitly widen the trust boundary and are intended for tightly controlled environments only: `dangerously_allow_non_loopback_proxy` (which can expose proxy listeners beyond loopback) and `dangerously_allow_all_unix_sockets` (which bypasses the Unix socket allowlist).

## Approval Flows

The approval policy governs when Codex pauses execution:

`untrusted` — Codex asks before any command that isn't in its trusted set. This catches destructive Git operations, commands that override configuration, and anything that can mutate state or trigger external execution paths.

`on-request` — Codex works autonomously inside the sandbox. It asks when it needs to cross the boundary: editing outside the workspace, accessing the network, or running commands outside the policy.

`never` — No approval prompts. Useful for CI workflows where all interactions are non-interactive. You still control the sandbox mode separately; this setting removes the user-confirmation layer but not the technical boundary.

A granular approval policy is also available: `approval_policy = { granular = { sandbox_approval = true, rules = true, mcp_elicitations = true, request_permissions = false } }`. This lets you keep specific approval categories interactive while auto-rejecting others.

## Auto-Review: A Second Agent at the Boundary

For long-running agentic work where manual approval interruptions are impractical, Codex offers Auto-review: a separate reviewer agent that handles approval requests instead of surfacing them to the user. It's activated by setting `approvals_reviewer = "auto_review"`.

The reviewer sees a compact transcript of the session, the exact approval request, and can perform limited read-only checks. It does not see the main agent's private chain-of-thought — only retained conversation items and tool evidence. Its job is narrow: decide whether a specific boundary-crossing action should run.

Auto-review evaluates four categories:
- Sending private data, credentials, or secrets to untrusted destinations
- Probing for credentials, tokens, cookies, or session material
- Broad or persistent security weakening (such as modifying sudoers or firewall rules)
- Destructive actions with significant risk of irreversible damage

The default reviewer policy is open-source in the Codex repository at `codex-rs/core/src/guardian/policy.md`. Enterprises can replace the tenant-specific section of this policy via `guardian_policy_config` in managed requirements files. Individual users can set a local policy in `config.toml` under `[auto_review].policy`, though managed requirements take precedence.

An explicit denial isn't treated as an ordinary sandbox error. Codex returns the reviewer's rationale to the main agent and instructs it not to pursue the same outcome through workarounds or indirect execution — not to find a clever alternative path to the same blocked action. The main agent must either find a materially safer alternative or stop and ask the user.

To prevent an agent from looping endlessly on rejection, a circuit breaker applies: three consecutive denials, or ten denials within the last fifty reviews in the same turn, causes Codex to abort the turn entirely rather than continuing to escalate.

Users can explicitly override a single recent denial with `/approve` in the TUI, selecting from the last ten denied actions. That override applies to exactly one retry of the exact denied action and is recorded in the session context. The reviewer still evaluates the retry — it sees the explicit user override but can deny again if policy mandates it.

## Cloud Isolation: The Two-Phase Runtime

When Codex runs in cloud mode, the sandbox model changes significantly. The agent runs inside isolated, OpenAI-managed containers rather than using OS-native sandboxing on the user's machine.

Cloud mode uses a two-phase runtime:

1. **Setup phase**: runs before the agent phase and has network access. This is where dependencies can be installed, packages fetched, or environment state prepared. Secrets configured for the cloud environment are available during setup.

2. **Agent phase**: runs offline by default. Network access must be explicitly enabled for this phase. Critically, secrets are removed before the agent phase starts — the agent cannot exfiltrate credentials that were used during setup.

This design solves a practical problem: agent phases that can access both secrets and the network are a natural exfiltration path. By making setup and agent phases discrete and removing credential access before network-enabled agent work begins, the cloud model structurally limits what a compromised or manipulated agent can accomplish.

## What This Architecture Actually Prevents

The sandbox model addresses specific failure modes that approval policies alone can't close:

**Prompt injection payloads** that instruct the agent to exfiltrate data via network calls are blocked at the network layer before an approval prompt ever appears (assuming network is off, the default).

**Dependency confusion or supply-chain attacks** that try to write into `.git` hooks are blocked by the protected-path enforcement on `.git`.

**Agent-in-the-middle attacks** that try to modify the agent's own configuration or session state are blocked by the `.codex` protected path.

**Long-running autonomous agents** that accumulate approval fatigue — where a human approves increasingly risky actions just to keep the task moving — are addressed by the Auto-review circuit breaker and rejection propagation.

The architecture doesn't claim to be deterministic. Auto-review explicitly states it can make mistakes, especially in adversarial contexts. The sandbox is an enforcement layer, not an oracle. What it provides is defense-in-depth: the model's intent, the technical boundary, and the approval flow are three separate controls, each of which can catch failures the other two miss.

## Working With the Defaults

For most local development use, the defaults hold up without additional configuration:

- Launch in a version-controlled directory and accept the Auto preset (`workspace-write` + `on-request`)
- Network stays off unless you explicitly enable it
- `.git` state is protected
- Commands that need to go beyond the workspace will surface an approval prompt

The risk surface expands when you enable network access, add broad writable roots, or switch to `approval_policy = "never"`. Each of those changes is deliberate and documented — but they shift the trust model meaningfully, and the combination of all three is effectively `--yolo` by another path.

For teams deploying Codex at scale, the managed configuration layer (`requirements.toml`) allows administrators to set floors on sandbox mode and approval policy that individual users can't override downward. The network policy, Auto-review configuration, and writable roots can all be constrained at the organizational level, which is the appropriate control point for compliance-sensitive environments.

---

*Sources: OpenAI Codex Developer Documentation — [Sandboxing](https://developers.openai.com/codex/concepts/sandboxing), [Agent Approvals & Security](https://developers.openai.com/codex/agent-approvals-security), [Auto-review](https://developers.openai.com/codex/concepts/sandboxing/auto-review). The default Auto-review policy is published in the open-source Codex repository at [codex-rs/core/src/guardian/policy.md](https://github.com/openai/codex/blob/main/codex-rs/core/src/guardian/policy.md).*
