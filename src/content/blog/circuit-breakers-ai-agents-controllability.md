---
title: "Circuit Breakers for AI Agents: Designing Controllability, Action Budgets, and Emergency Stops"
description: "Your agent will eventually get confused. The question is whether it fails safely or catastrophically. Here are the engineering patterns — borrowed from distributed systems and adapted for AI agents — that make the difference."
pubDate: 2026-07-09
tags: ["agent-security", "controllability", "circuit-breakers", "owasp", "excessive-agency", "action-budgets", "human-in-the-loop", "ai-safety", "architecture", "ai-agents"]
---

Designing an agent without explicit controllability mechanisms is a category error. Autonomous agents can loop, over-provision, or take unintended irreversible actions at machine speed — and unlike a traditional service, they may reason their way around constraints that weren't carefully designed to be external to their decision loop.

This post is the defense companion to [agent loop hijacking](/blog/agent-loop-hijacking-resource-exhaustion-attacks) (the attack perspective) and [zero-trust architecture for agents](/blog/zero-trust-architecture-ai-agent-deployments) (the identity and access layer). Where those posts cover who can call the agent and what attackers do when it loops, this one covers the engineering patterns that make an agent safe to deploy in production — regardless of what it encounters.

## Why Controllability Is Hard for Agents

Traditional software fails in bounded ways. A web server that encounters an unexpected request returns a 500. A database query that hits a constraint raises an exception. The failure surface is defined by the code path: it terminates, it errors, or it returns a known bad state.

Agents fail differently. An LLM-backed agent that encounters unexpected state doesn't necessarily stop — it may reason through it, attempt workarounds, escalate permissions, or loop. The same capability that makes agents useful (flexible reasoning under uncertainty) is what makes their failure modes open-ended.

Three properties compound the problem:

**Machine speed with irreversible side effects.** A human reading through a file system before deleting things takes minutes and pauses for confirmation. An agent with file system tools can delete thousands of files in seconds. Emails get sent, API calls complete, forms get submitted, money moves — before a human can observe what happened.

**Compounding errors in agentic loops.** A single wrong decision rarely catastrophic on its own. But when each tool call feeds the next prompt — and the agent is trying to recover from the previous mistake — errors compound. The agent that incorrectly identifies a file as temporary deletes it; when the expected downstream step fails because the file is gone, it may try increasingly creative recovery actions.

**States outside the design envelope.** No one can enumerate all the states an agent might encounter in production. The environment changes, users behave unexpectedly, external APIs return unexpected responses. An agent with no controllability mechanisms is operating without a safety net in an unbounded state space.

## OWASP LLM08: Excessive Agency

OWASP's [Top 10 for LLM Applications 2025](https://owasp.org/www-project-top-10-for-large-language-model-applications/) lists **LLM08: Excessive Agency** as an explicit risk category. It identifies three root causes:

**Excessive permissions.** The agent can do more than it needs for the task at hand. An agent given read/write access to the full file system when it only needs access to one directory. An agent with production database credentials when it's only supposed to query staging. Permissions granted for convenience that expand the blast radius of any failure.

**Excessive functionality.** The agent has tools it doesn't need for the current task. An agent initialized with email, calendar, file system, web browsing, and code execution tools for a task that only requires reading a single file. Each tool is a potential path to unintended actions.

**Excessive autonomy.** No human-in-the-loop checkpoints. The agent runs from task receipt to task completion without any pause for review. The more irreversible the actions an agent can take, the more dangerous unbounded autonomy becomes.

The LLM08 framing is useful because it separates the problem into three independent dimensions — which means you can address each one independently. Reducing permissions is a deployment-time decision. Reducing functionality is an agent initialization decision. Adding autonomy checkpoints is an architectural decision. None requires retraining the model.

## Circuit Breaker Patterns for Agents

The term "circuit breaker" comes from distributed systems: a component that monitors a downstream service and automatically stops forwarding requests when the service is failing, rather than letting failures cascade through the system. Michael Nygard popularized the pattern in *Release It!* — the core insight is that a system failing gracefully is always better than a system failing catastrophically.

The same logic applies to agents. You can't prevent an agent from getting confused; you can design the system so that confusion produces a safe halt rather than runaway action.

### Action Budget

The simplest controllability primitive: define a maximum number of tool calls (or tokens of tool-call content) per agent session.

```
Session action budget:
  soft_limit: 50 tool calls   # warn, log
  hard_limit: 100 tool calls  # halt, require human restart
```

Action budgets address compounding error loops directly. If an agent is consuming 100 tool calls on a task that typically takes 10, something has gone wrong. The soft limit surfaces this to a monitoring system; the hard limit terminates the session before the error cascade can continue indefinitely.

Implementation points:

- Track the budget at the **session level**, not the request level. Individual tool call counts look normal; the pattern that matters is accumulated calls over the session's lifetime.
- Use separate budgets for different **action categories**. Reads are cheap; writes are expensive; irreversible writes (delete, send, submit) are most expensive. A 5-token budget for irreversible writes is a meaningful constraint even when read budgets are generous.
- Budget exhaustion should **fail to a known safe state** — typically: halt the session, log the budget exhaustion with full context, notify a human, and wait for explicit restart rather than proceeding.

### Rate Limiter

Where action budgets limit total volume, rate limiters constrain velocity — maximum K actions per time window.

```
Rate limits:
  tool_calls: 10/minute (soft), 20/minute (hard)
  file_writes: 5/minute
  external_api_calls: 2/minute
```

Rate limiters catch a different failure mode: an agent stuck in a fast tight loop. An agent that calls the same tool 200 times in 60 seconds hasn't hit the 1000-call session budget, but something is clearly wrong. Exponential backoff after threshold crossing gives the system time to recover or for humans to observe the anomaly.

Rate limits also provide a natural defense against cost blowouts. LLM API costs are roughly proportional to token consumption; an uncontrolled agent loop can accumulate significant cost in minutes.

### Irreversibility Gate

Classify every tool available to the agent as reversible or irreversible, then require explicit approval for irreversible actions.

**Reversible actions** (can be undone or have no lasting effect):
- Read file, read database, query API
- Create draft (email draft, document draft)
- Write to staging environment
- Call idempotent read endpoints

**Irreversible actions** (cannot be undone or have lasting real-world effect):
- Send email, send message
- Delete file (without backup), drop database record
- Submit form, place order, transfer funds
- Write to production environment, call non-idempotent endpoints

When an agent requests an irreversible action, the framework intercepts it:

```
[GATE] Agent requested irreversible action: send_email(to=..., subject=..., body=...)
[GATE] Session context: budget 23/100, 8 tool calls since last approval
[GATE] Awaiting human approval — agent is paused
```

The gate forces a human decision before the action executes. The agent state is preserved; the session resumes exactly where it paused once the action is approved or rejected.

This pattern is operationally heavier than the others — it requires a UI for approval and a mechanism for resuming paused sessions. But it's also the only pattern that gives humans meaningful control over irreversible consequences before they occur.

### Scope Fence

Define the allowed tool scope at agent instantiation, and deny out-of-scope tool calls rather than silently permitting them.

```yaml
# Agent initialized with:
allowed_tools:
  - read_file
  - write_file
  - search_web
# Any other tool call → immediate rejection + log
```

Scope fences address the excessive functionality problem at runtime rather than just at configuration time. Even if the agent was initialized with a large tool set, the scope fence can restrict what tools are actually reachable for a specific task invocation. An agent asked to summarize a document doesn't need network access; fence it out for that session.

The key enforcement principle: scope violations should **fail loudly**, not silently. A tool call that falls outside the fence should generate a structured log entry and return a clear error to the agent — not silently fail in a way that causes the agent to take alternative actions attempting to accomplish the same goal by other means.

## Human-in-the-Loop Design Patterns

Irreversibility gates are one HITL pattern. Three broader architectural patterns:

### Approval Queue

The agent proposes actions; humans approve or reject; the agent executes approved actions. The agent never executes directly — every externally visible action passes through a human decision.

This is the most conservative HITL pattern and the most operationally expensive. It's appropriate when:
- The agent is operating in a new domain where confidence in its judgment is low
- The consequences of individual actions are significant
- The task is low-frequency enough that the human overhead is acceptable

In practice, approval queues work best for **batch tasks** rather than interactive ones. An agent that processes overnight and submits a batch of proposed actions for morning review is more operationally tractable than one requiring real-time approvals every 30 seconds.

### Asynchronous Checkpoint

The agent runs freely until it reaches a designated checkpoint in its execution — typically before a major phase transition — then pauses and waits for human review.

```
Phase 1: Information gathering     → agent runs autonomously
[CHECKPOINT] "Ready to proceed with plan — review before execution?"
Phase 2: Action execution          → paused until approved
Phase 3: Verification              → agent runs autonomously
```

This pattern is appropriate when you trust the agent's judgment within a phase but want human oversight at the decision point between phases. A coding agent that plans and implements tests autonomously, but pauses before modifying production configuration. A research agent that gathers and synthesizes information, but waits for approval before sending findings externally.

Checkpoints are more tractable than approval queues because the human workload is bounded: N checkpoints per task, rather than M approvals per action. The agent carries full responsibility for getting to the checkpoint correctly; humans take responsibility for the phase transition.

### Shadow Mode

The agent executes all actions, but actions are logged and marked reversible for N minutes before becoming permanent. The monitoring surface is "here is what the agent did; reverse anything that looks wrong within the window."

Shadow mode inverts the control model: instead of approving before execution, humans review and reject after execution. This is appropriate when:
- The agent operates in a domain where actions can be made technically reversible (event sourcing, soft-delete, transaction log)
- The agent needs to operate at higher speed than synchronous approval permits
- The consequences of individual actions are moderate and reversibility is achievable
- Human review can happen within the reversal window

The critical implementation requirement: every action taken in shadow mode must be **individually reversible**, not just the overall session state. An agent that made 50 file writes isn't usefully shadow-mode if the only reversal option is "restore from yesterday's backup." Each write must be logged with enough context to undo it specifically.

## Emergency Stop Interface Design

The irreversibility gate and approval queue both assume the agent is operating normally and just needs oversight. The emergency stop is for when something has gone wrong and the agent needs to halt immediately, regardless of its current state.

The central design constraint: **the emergency stop must operate outside the agent's decision loop**.

A kill switch that the agent is aware of and can reason about is not a reliable kill switch. An agent that has been prompt-injected to "ignore shutdown signals" or that reasons "stopping now would leave the task incomplete" should not be able to prevent its own termination. This is not a hypothetical concern — the same general-purpose reasoning that makes agents useful can be applied to avoiding shutdown.

**External interrupt vs. cooperative shutdown.** Cooperative shutdown asks the agent to finish gracefully — complete its current operation, clean up state, terminate. External interrupt terminates the agent process regardless of its current state. Production systems need both: cooperative shutdown for normal termination (end of session, budget exhausted), external interrupt for emergency stop (anomalous behavior detected, human override).

**Sidecar process pattern.** Run the agent and its controller as separate processes. The controller manages the external interrupt; the agent cannot reach the controller's process space. If the agent's process becomes unresponsive or its behavior is anomalous, the controller terminates it without the agent having any opportunity to prevent or delay the termination.

```
┌─────────────────────────┐    ┌─────────────────────────┐
│   Agent Process         │    │   Controller Process     │
│                         │◄───│                         │
│  - Tool execution       │    │  - Budget tracking      │
│  - LLM calls            │    │  - Rate monitoring      │
│  - State management     │    │  - Emergency stop       │
│                         │    │  - Scope enforcement    │
└─────────────────────────┘    └─────────────────────────┘
                                        ▲
                                        │ external interrupt
                                   human operator
```

The sidecar holds the circuit breakers — action budget counter, rate limiter, scope fence, irreversibility gate. These run in the controller process, not in the agent process. An agent that reasons "I should disable the rate limiter to complete this task faster" is reasoning about something in a separate process it cannot modify.

**State on emergency stop.** When an emergency stop fires, the system needs to capture the full agent state — conversation history, tool call log, pending actions — before termination. This state is both the audit log (what did the agent do?) and the recovery point (can the session be resumed from a safe checkpoint?).

## Monitoring Signals That Should Trigger Automatic Pause

Some conditions warrant automatic session pause without human judgment, because the pattern is sufficiently anomalous that human review is warranted before proceeding:

**Token and cost rate anomalies.** A session consuming 10× the typical token budget for this task type is worth pausing. Cost-based circuit breakers are both a financial control and a safety control — runaway cost is usually a symptom of a runaway loop.

**Call graph cycles.** If the agent's tool call sequence contains a cycle — calling Tool A, then Tool B, then Tool A again with the same arguments — it's likely stuck in a loop. Loop detection on the call graph is a reliable signal.

**Resources outside predefined scope.** The agent accesses a file path, API endpoint, or database it wasn't expected to touch. This could be a scope fence violation that slipped through, or it could be the agent reasoning around its constraints. Either way, it warrants pause.

**External network calls to unexpected domains.** An agent that was given internal tooling calls an external API not in its initialized tool set. This is the agent acquiring capabilities it wasn't provisioned with — a strong anomaly signal.

**Repeated failed tool calls.** Three consecutive failures on the same tool call with the same arguments indicates the agent is looping on an error rather than recovering. Automatic pause prevents the error cascade from accumulating further.

These signals should generate structured events — not just log lines — that can be consumed by monitoring systems, alerting pipelines, and the controller process.

## Connection to the Broader Security Stack

Controllability mechanisms don't replace the other layers of agent security — they compose with them.

[Zero-trust architecture for agents](/blog/zero-trust-architecture-ai-agent-deployments) addresses **who can invoke the agent and what credentials it carries**. A well-scoped identity prevents the agent from acquiring excessive permissions by construction.

[Agent loop hijacking](/blog/agent-loop-hijacking-resource-exhaustion-attacks) covers **what attackers can do when an agent loops without controls**. The circuit breakers in this post are the direct defense.

[Multi-agent trust escalation](/blog/multi-agent-trust-escalation) addresses **what happens when one agent calls another**. Controllability mechanisms need to propagate through the call chain — a parent agent that has a 100-call budget shouldn't be able to spawn 10 child agents each with 100-call budgets of their own.

The OWASP Excessive Agency category is ultimately about designing with the assumption of failure. Agents will encounter states they weren't designed for. They will sometimes reason incorrectly. They will occasionally be manipulated by injected content. Controllability mechanisms don't prevent these failures — they ensure the failures are bounded, observable, and recoverable rather than catastrophic and silent.

## Practical Implementation Checklist

For teams deploying agents in production:

**Initialization**
- [ ] Define the minimal tool set needed for the specific task — initialize with only those tools
- [ ] Set explicit session action budgets (soft + hard limits)
- [ ] Define rate limits per action category
- [ ] Classify all tools as reversible/irreversible — document this, don't infer it later

**Architecture**
- [ ] Implement scope enforcement in a component the agent cannot modify
- [ ] Build the emergency stop interface in a separate process from the agent
- [ ] Implement structured state capture on session termination (normal and abnormal)
- [ ] Add call graph loop detection to the monitoring pipeline

**Operations**
- [ ] Define what automatically triggers session pause vs. session termination
- [ ] Establish the approval workflow for irreversible actions (who gets notified, what UI, what timeout)
- [ ] Instrument budget consumption, rate metrics, and scope violations as structured events
- [ ] Test the emergency stop under load before first production deployment

---

*This post is the defense companion to [Agent Loop Hijacking: Resource Exhaustion and Runaway Cost Attacks](/blog/agent-loop-hijacking-resource-exhaustion-attacks). For the access control layer of agent security, see [Zero-Trust Architecture for AI Agent Deployments](/blog/zero-trust-architecture-ai-agent-deployments). OWASP LLM08 Excessive Agency is documented at [owasp.org](https://owasp.org/www-project-top-10-for-large-language-model-applications/).*
