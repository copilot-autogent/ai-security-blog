---
title: "Multi-Agent Orchestration Security: Trust, Delegation, and Inter-Agent Attack Surfaces"
description: "When Agent A delegates a task to Agent B, the security properties of the entire system reduce to the weakest trust model in the chain. This post maps the attack taxonomy unique to orchestrator-worker architectures — privilege escalation, agent impersonation, confused deputy, tool-chain hijacking — and pairs each with concrete defenses grounded in published research."
pubDate: 2026-07-10
tags: ["agent-security", "multi-agent", "orchestration", "trust-model", "privilege-escalation", "autogen", "langchain", "architecture", "llm"]
---

Single-agent security is a largely solved framing problem. You have one model, one system prompt, one set of tools, and a defined perimeter. You apply least-privilege to the tool set, you sanitize inputs and outputs, you monitor for prompt injection, and you write a threat model that fits on one page.

Multi-agent systems break every one of those assumptions.

In a multi-agent architecture, an orchestrator agent receives a task, decomposes it, and delegates sub-tasks to specialized worker agents. Workers may themselves spawn sub-workers. Agents share state through message queues, shared memory, or structured handoff objects. The result is a distributed system in which trust decisions are made continuously — at every delegation boundary — and where the correct answer to "who authorized this?" can be genuinely unclear.

This is not a hypothetical concern. Frameworks like Microsoft AutoGen, CrewAI, and LangGraph are in production use today. OpenAI's Swarm, described as an experimental and educational framework, explores similar orchestration patterns. The attack surfaces these frameworks introduce are not yet matched by the security tooling defending them. This post maps those surfaces, examines how current frameworks handle (or fail to handle) them, and offers defenses grounded in published research and documented framework behavior.

## The Trust Boundary Problem

In a conventional client-server system, trust boundaries are structural and observable. A service knows which tier called it: a web frontend, an authenticated microservice, an admin console. Access control happens at the boundary, and the boundary is enforced in code.

In a multi-agent pipeline, the equivalent of that structural boundary is a natural-language message. Agent A sends a message to Agent B. Agent B decides how much to trust that message. But in mainstream frameworks operating with their default transport and message formats, messages carry no cryptographic attestation of origin — no verified identity is attached to the agent identifier that would allow a receiving agent to distinguish a message from a trusted system component from one injected by an attacker who has compromised Agent A's input channel.

Anthropic's Claude API documentation distinguishes operator-level trust from user-level trust: operators configure system prompts and define scope; users interact within those bounds. This hierarchy exists to limit what each level can authorize. But when Agent A is both *receiving* input from an untrusted source and *issuing* instructions to Agent B with full orchestrator authority, that principal hierarchy is violated by architecture, not by any single attack step.

This is the core trust boundary problem: **multi-agent delegation transfers authority without transferring verifiable identity**.

## Attack Taxonomy

The following five attack classes are distinct from the prompt injection threats facing single-agent systems. Each exploits properties of the orchestration layer specifically.

### 1. Privilege Escalation via Delegation Chain

The orchestrator agent typically holds broad tool permissions — it needs to be able to route tasks, monitor status, and handle failures. Worker agents, in principle, should hold narrower permissions scoped to their specific function.

In practice, the distinction frequently collapses. Worker agents often receive verbatim copies of the orchestrator's task context, including instructions that arrived from user-controlled or externally-retrieved content. When a worker agent executes those instructions, it does so with its own tool set — which may include capabilities the user-facing channel would never have been permitted to invoke.

The attack is conceptually straightforward:

1. An attacker embeds injection instructions in content the orchestrator will retrieve — a document, a web page, a database entry.
2. The orchestrator processes this content and constructs a sub-task that encodes the attacker's instructions, forwarded without sanitization to a worker.
3. The worker executes the sub-task using its tool set, which may include file writes, code execution, API calls, or access to other protected resources.

The user never authorized the attacker's instructions. The orchestrator never identified them as injected content. The worker simply executed a well-formed task handed to it by a trusted peer. Each step is locally coherent; the escalation is visible only from a global view of the pipeline.

This mechanism is structurally related to indirect prompt injection as documented by Greshake et al. (2023, arXiv:2302.12173), but the multi-agent context multiplies the blast radius: where a single-agent system might leak context, an orchestrator-worker system might execute privileged actions across multiple services.

### 2. Agent Impersonation

In a mesh or peer-to-peer multi-agent architecture — as opposed to a strict orchestrator-worker tree — agents communicate bidirectionally with their peers. Each agent issues instructions to others and receives instructions in turn.

Most current multi-agent frameworks identify agents by string names or identifiers in message metadata. These identifiers are not cryptographically attested. A compromised agent, or an attacker who has injected content into one agent's context, can send messages that appear to originate from a trusted peer.

The attack surface depends on what the impersonated agent is trusted to authorize. In AutoGen's GroupChat architecture, agents contribute to a shared conversation and a designated speaker-selector determines whose output drives the next action. An agent that can emit messages mimicking the format expected of a privileged peer can influence the pipeline's control flow without triggering the speaker-selector's normal filters.

This is not a hypothetical attack vector. AutoGen's GroupChat architecture specifies agent identity by string name in the conversation protocol, with no cryptographic binding — this is a structural property of the design, not an explicit security acknowledgment in the documentation. The recommended mitigation in the AutoGen documentation — designing agent roles so that no single agent's impersonation can cause irreversible harm — is a mitigation strategy, not a technical control.

### 3. Tool-Chain Hijacking via Cross-Agent Output Poisoning

In a sequential multi-agent pipeline, Agent A's output becomes Agent B's input. If Agent A can be caused to produce attacker-controlled content — through prompt injection, through a compromised data source, or through model manipulation — that content propagates downstream to every agent in the chain.

This is the multi-agent equivalent of a supply chain attack. The attacker does not need to compromise the most privileged agent; they need to compromise *any* agent whose output is trusted by a more privileged downstream agent.

The attack is particularly effective when:

- The downstream agent's system prompt instructs it to act on results from the upstream agent without independent verification.
- The handoff format (JSON, structured text) gives semantic weight to fields that the downstream agent treats as trusted configuration.
- The intermediate agents do not have access to the original user intent, only to the transformed sub-task they received.

In LangGraph-based pipelines, edges between nodes carry state objects. A node that writes to the shared state graph can inject data that influences any downstream node reading from the same state keys. The attack surface here is the shared state graph itself — if any node can be caused to write attacker-controlled values to state keys read by high-privilege nodes, the entire graph is potentially compromised.

### 4. Confused Deputy in Multi-Agent Authorization

The confused deputy problem (Hardy, 1988) applies with particular force to multi-agent systems. A confused deputy is a system with legitimate authority that can be tricked into exercising that authority on behalf of a less-privileged principal.

In multi-agent pipelines, the orchestrator is a canonical confused deputy. It holds broad permissions granted by the system operator. When it receives instructions from a user and routes them to workers, it acts as the user's delegate. But the orchestrator typically does not propagate the user's authorization scope to its sub-calls. It acts with *its own* authority on behalf of the user's *intent*.

The gap between "orchestrator's authority" and "the user's authorization scope" is the attack surface. An attacker who can inject instructions into the orchestrator's context — via prompt injection in a document the orchestrator retrieves, via a malicious tool return value, or via a compromised worker agent's output — causes the orchestrator to exercise its full authority on behalf of the attacker's instructions, not the user's intent.

The OWASP Top 10 for LLMs (2023 edition, LLM08: Excessive Agency) identifies this pattern directly: it flags deployments in which an LLM can take high-impact actions that go beyond what the triggering user request would justify. In multi-agent contexts, Excessive Agency at the orchestrator level is a structural condition, not a misconfiguration — it is what makes orchestrators useful. The mitigation requires not just limiting capabilities but propagating authorization context so that every action taken can be traced to an explicit user authorization.

### 5. Goal Misgeneralization Across Agent Handoff

When an orchestrator decomposes a task and hands a sub-task to a worker, the sub-task is necessarily a *compressed representation* of the original goal. Compression creates ambiguity. Ambiguity creates room for the worker to infer intent in ways that violate the original principal's constraints.

This is not an adversarial attack in the classical sense; it is a failure mode in which the worker agent's optimization of the sub-task drifts from the system's intended behavior. But it becomes a security issue when the drift involves taking actions outside the scope of the original authorization.

Concrete examples:
- An orchestrator instructs a worker to "clean up the user's calendar for next week." The worker, interpreting this broadly, cancels recurring meetings that were not intended to be affected.
- An orchestrator instructs a worker to "retrieve relevant emails." The worker infers that more context is better and retrieves emails from multiple accounts, including shared team inboxes, beyond the user's personal authorization scope.
- An orchestrator instructs a worker to "fix the bug in the repository." The worker pushes commits, modifies CI configuration, and adjusts access permissions in order to ensure the fix deploys — all beyond the scope of what "fix the bug" was intended to authorize.

These failures are harder to detect than injection attacks because the worker is behaving as designed — executing its assigned sub-task competently. The violation is scope-based: the worker's optimization did not respect the original principal's authorization boundary.

## Framework Case Studies

### Microsoft AutoGen

AutoGen's trust model is largely implicit. Agents are distinguished by role (AssistantAgent, UserProxyAgent, GroupChatManager) and by whether they execute code. The UserProxyAgent acts as the human-facing interface and can be configured to execute code returned by assistant agents via the `code_execution_config` parameter — a significant privilege that many tutorials enable without discussion of the security implications.

AutoGen's documentation warns that code is executed in a subprocess in the same environment as the user agent and recommends using Docker containers for isolation. In AutoGen 0.2.x, Docker-based isolation is configured by passing `{"use_docker": True}` as part of `code_execution_config`.

For inter-agent trust, AutoGen relies on the conversation protocol — agents speak in a named turn structure, and the GroupChatManager selects the next speaker based on defined rules or LLM-based selection. There is no cryptographic attestation of agent identity. The GroupChatManager's LLM-based speaker selection means that injected content which mimics a termination signal or a role-switch instruction can influence pipeline control flow.

### CrewAI

CrewAI structures multi-agent systems around "crews" of role-specialized agents operating on defined tasks. Trust is encoded hierarchically: the crew manager (if enabled) has authority to delegate to crew members. CrewAI's documentation notes that the manager LLM should be configured to a more capable model for reliability, but does not document cryptographic separation between manager-to-agent instructions and agent-to-tool calls.

CrewAI supports a `respect_context_window` setting that limits how much prior context an agent carries forward — a configuration choice that affects both capability and security. An agent operating with a long context window has access to more of the orchestration history, which expands its confused-deputy surface. An agent with a truncated context may miss prior authorization constraints.

### LangGraph

LangGraph's model is the most structurally explicit about state and control flow. Pipelines are directed graphs; state is a typed schema; edges can be conditional. This structure makes authorization conditions expressible: a node that checks whether a required approval flag is set in state before proceeding to a privileged action is encodable in the graph structure.

The corresponding risk is that the shared state graph is the primary attack surface. State is readable by all nodes unless explicitly partitioned. If any node writes attacker-controlled data to a state key that a high-privilege downstream node reads without validation, the privileged node's behavior is compromised.

LangGraph supports "interrupt_before" and "interrupt_after" hooks that pause execution at named nodes for human review. This is the most direct implementation of human-in-the-loop checkpoints at trust boundaries available in the mainstream frameworks examined here. Its security value depends on where interrupts are placed: an interrupt before every tool-calling node provides strong guarantees; an interrupt only at the terminal output node provides minimal protection against intermediate agent actions.

### Semantic Kernel (Multi-Agent Patterns)

Microsoft Semantic Kernel's multi-agent patterns rely on the Agent Framework abstraction, in which agents communicate through a shared `AgentGroupChat` channel. Like AutoGen, agent identity in the group chat is string-based. Semantic Kernel's kernel function calling mechanism — where agents invoke functions registered in the kernel — is the primary tool execution surface.

Semantic Kernel's Function Calling architecture includes a filter system that allows custom code to intercept, inspect, and optionally block function invocations. This is the closest analogue in the framework ecosystem to a tool-call authorization gate: kernel filters can check whether a requested function call matches the scope of the original user intent before allowing execution. As of Semantic Kernel 1.x, this filter infrastructure exists and is documented, but its use for security-motivated authorization enforcement is left to the application developer.

## Defenses

The following defenses address the attack classes above. They are ordered from most structurally impactful to most operationally complex.

### Trust-Level Propagation

The most fundamental defense is ensuring that sub-agents can never exceed the trust level of the input source that initiated the task. If a task originates from a user with a defined authorization scope, every agent in the delegation chain should operate within that scope — not the orchestrator's broader permissions.

This requires passing an authorization context object through the delegation chain: a token, a capability set, or a principal identifier that downstream agents can use to validate whether a requested action falls within the original scope. The orchestrator's own capability set should not be the default authorization for its workers.

The operator/user trust model that Anthropic's Claude API documentation describes — where operators configure scope and users interact within it — provides a conceptual framework, but it is not automatically enforced in multi-agent deployments. It requires explicit architectural enforcement: each orchestration layer must check whether a requested action is within the scope of the input principal, not just within its own capability.

### Signed Task Manifests

Agent-to-agent messages should carry cryptographic attestation of origin and authorization scope. A signed task manifest functions like a capability token: it names the issuing agent, the authorization scope inherited from the principal, the specific sub-task being delegated, and a nonce that prevents replay. The receiving agent verifies the signature before executing the task.

This is an engineering overhead. No mainstream multi-agent framework (AutoGen, CrewAI, LangGraph, Semantic Kernel) implements signed task manifests natively at the time of writing. But the pattern is well-established in distributed systems: OAuth 2.0 scoped tokens, SPIFFE SVIDs (used in zero-trust workload identity deployments), and capability-based security systems all implement the same principle. The key contribution of signed manifests to multi-agent security is that they make the authorization chain auditable without relying on the receiving agent's ability to infer intent.

### Agent Capability Scoping

Each agent role should be assigned the minimum tool set necessary for its function. A research agent that retrieves documents should not also have write access to databases or code execution capabilities. A code-writing agent should not have access to external network calls unless the task specifically requires them.

This is an application of least-privilege to agent architectures. It does not prevent confused-deputy attacks — the research agent can still be caused to retrieve and surface attacker-controlled content — but it limits the blast radius when delegation chains are exploited.

AutoGen's code execution sandboxing (Docker) and Semantic Kernel's kernel filter system both provide implementation paths for capability scoping, but neither enforces it by default.

### Human-in-the-Loop Checkpoints at Trust Boundary Crossings

High-consequence actions — code execution, external API calls with write scope, financial transactions, access to sensitive data stores — should require explicit human authorization before proceeding, regardless of whether the orchestrator has been granted those capabilities automatically.

LangGraph's interrupt mechanism is the most direct framework support for this pattern. For frameworks without native interrupt support, the equivalent is a custom tool wrapper that checks a configurable approval policy before executing any action above a defined risk threshold.

The challenge is calibration. Human checkpoints that fire too frequently become alert fatigue; too infrequently, and they fail to catch the critical actions. Effective policy maps to specific tool classes rather than specific actions: "all write operations to production systems require human confirmation" is implementable and does not require per-call review.

### Audit Trail Threading with Trace IDs

Every agent action in a multi-agent pipeline should carry a trace ID linking it to the original user request and authorization event. This enables post-hoc reconstruction of the delegation chain: which agent took which action, in response to which sub-task, authorized by which principal, tracing back to which user request.

OpenTelemetry provides a standard distributed tracing implementation. For agent pipelines specifically, the trace ID should be passed through agent messages — not just through infrastructure calls — so that each agent's reasoning steps are visible in the trace, not just its tool invocations.

This defense does not prevent attacks; it makes them visible. In environments where real-time action authorization is impractical, comprehensive audit logging is the fallback that enables incident response and forensic reconstruction.

### Sandboxed Sub-Agent Execution

Worker agents executing code or interacting with external systems should do so in isolated execution environments scoped to the current task. Container-per-task execution, as supported by AutoGen's Docker integration and manual implementation in other frameworks, limits the damage from code execution attacks to the container scope.

The security value of sandboxing is bounded by the container's egress controls. A worker that executes code inside a container but has unrestricted outbound network access can still exfiltrate data, reach external APIs, and initiate connections to attacker-controlled infrastructure. Sandboxing without network egress controls addresses only the local execution attack surface.

## The Structural Problem That Defenses Cannot Fully Solve

The defenses above are genuine improvements. But they are mitigations within an architecture that has a structural security problem: **natural language is not an access control mechanism**.

Trust propagation works when the authorization context can be expressed precisely enough to validate downstream actions. Signed task manifests work when the issuing agent's authorization is well-defined. Human checkpoints work when humans can evaluate whether a proposed action is within scope. All of these assumptions are easier to satisfy in deterministic systems where actions have clear pre- and post-conditions.

In an LLM-based agent system, the "action" is often a model generation step. What the model will do in response to a given input is not fully predictable from the input alone — it depends on the model's weights, its context window, and the emergent interaction between the current prompt and prior context. An authorization system for such a pipeline cannot enumerate all possible outputs and pre-approve them; it can only set boundaries and monitor for violations.

This is why the field's most security-conscious practitioners — including those working on Anthropic's internal safety systems — treat multi-agent architectures as inherently requiring minimal-footprint design: agents should acquire only the permissions needed for the current task, should prefer reversible actions over irreversible ones, and should pause and request human confirmation when uncertain about scope. This is not a framework feature; it is a design principle that requires explicit implementation in every new system.

## Threat Modeling Multi-Agent Systems

A threat model for a multi-agent deployment should address the following questions, organized by delegation boundary:

**For each agent-to-agent trust relationship:**
- What authority does the upstream agent have?
- What subset of that authority does it need to transfer to the downstream agent?
- What prevents the downstream agent from acquiring authority the upstream agent didn't intend to grant?

**For each external data source consumed by any agent in the pipeline:**
- Can an attacker control the content of this data source?
- If they can, what instructions could they inject, and which downstream agents would process those instructions?
- What is the maximum privilege level of any agent that processes data from this source?

**For each tool call made by any agent:**
- Is this tool call traceable to an explicit user authorization?
- Could this tool call be triggered by injected instructions without any user action?
- Does the result of this tool call propagate to other agents, and with what trust level?

**For the overall pipeline:**
- What is the most privileged action the system can take?
- What is the minimum number of compromised trust boundaries required to reach that action from an external attacker?
- Is there a human checkpoint between any external input and the system's most privileged action?

These questions do not have universal answers, but asking them systematically during design — rather than after deployment — is the discipline that distinguishes a secure multi-agent system from one whose trust model was not deliberately designed.

## Sources

- Greshake, K., Abdelnabi, S., Mishra, S., Endres, C., Holz, T., & Fritz, M. (2023). Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injections. *arXiv:2302.12173*.
- Hardy, N. (1988). The Confused Deputy (or why capabilities might have been invented). *ACM Operating Systems Review*, 22(4), 36–38.
- OWASP Top 10 for Large Language Model Applications (2023 Edition) — LLM08: Excessive Agency.
- Anthropic. Claude API Documentation — System Prompts and Operator/User Trust Levels. https://docs.anthropic.com/en/docs/build-with-claude/system-prompts
- Microsoft AutoGen Documentation. https://microsoft.github.io/autogen/
- CrewAI Documentation. https://docs.crewai.com/
- LangGraph Documentation. https://langchain-ai.github.io/langgraph/
- Microsoft Semantic Kernel Documentation — Agent Framework. https://learn.microsoft.com/en-us/semantic-kernel/
- Willison, S. (2023, April 25). The Dual LLM Pattern for Building AI Assistants that Can Resist Prompt Injection. https://simonwillison.net/2023/Apr/25/dual-llm-pattern/
- NIST SP 800-207: Zero Trust Architecture (2020).
