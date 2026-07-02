---
title: "Cross-Tenant Contamination in LLM APIs: When Other Users' Context Leaks Into Your Session"
description: "Multi-tenant LLM deployments — shared inference infrastructure, KV cache reuse, batched requests — create subtle cross-tenant data exposure risks that differ from classical API security vulnerabilities. This post maps the threat surface unique to shared AI inference."
pubDate: 2026-07-02
tags: ["prompt-caching", "timing-attacks", "kv-cache", "side-channel", "llm-security"]
---

Thousands of users share the same GPU. Literally. When you send a prompt to a commercial LLM API, it joins a queue of requests executing on shared inference hardware, sharing memory with concurrent requests, and in some configurations sharing cached computation with users who sent similar prompts minutes or hours before. What prevents your prompt from bleeding into the next request — and what happens when that isolation fails?

This post maps the threat surface specific to **multi-tenant LLM inference**. The vulnerabilities here are distinct from application-layer prompt injection (which exploits how models process text) and from data governance failures (which concern where training data came from). The risks discussed below arise from how modern inference infrastructure is *architected* to serve many users efficiently.

## How Multi-Tenant Inference Works

To understand where isolation can break, you need a mental model of what's being isolated.

When an LLM processes a prompt, the transformer generates **key-value (KV) pairs** at each attention layer for every token in the sequence. These activations represent the model's "understanding" of the prompt context. On subsequent requests, if the same prefix of tokens has already been processed, an inference engine can reuse those cached KV pairs rather than recomputing them — dramatically reducing latency and cost.

This mechanism — **KV cache sharing** — is one of the highest-impact optimizations in production LLM serving. The architecture is described in detail in Kwon et al.'s 2023 "Efficient Memory Management for Large Language Model Serving with PagedAttention" (SOSP 2023), which introduced a virtual memory-style management layer for KV caches. The paper's contribution was reducing memory fragmentation to improve GPU utilization; the security implications were not a focus.

Beyond caching, large inference deployments use **request batching**: multiple user prompts are processed together in a single forward pass. Speculative decoding adds another layer — a small draft model generates candidate tokens, which the main model verifies in parallel, often across multiple pending requests. Each of these efficiency mechanisms creates a surface where the boundary between one user's state and another's must be carefully maintained.

At the infrastructure layer, major providers document tenant isolation at the **account level**: cache entries for one account are keyed separately from another's, even for identical prompt prefixes. OpenAI's automatic prompt caching (triggered for prefixes ≥1,024 tokens) and Anthropic's explicit `cache_control` API are described by their respective providers as applying within per-account namespaces. This account-level separation is a stated isolation boundary, not an independently verified architectural guarantee — providers have not published storage-layer documentation describing how that separation is enforced at the key-value store level.

The actual namespace partition granularity is also provider-defined and not fully public. Some platforms partition further by project, workspace, region, or model version. When cross-deployment cache sharing does exist, it may be scoped narrower than the full account.

## KV Cache Timing Attacks: Extended to Multi-Tenant Scenarios

[Adversarial Prompt Caching](/blog/adversarial-prompt-caching-kv-timing-attacks) covered timing side-channel attacks in the context of single-account adversarial use. Here we extend that analysis to the multi-tenant scenario.

The core mechanism is unchanged: a cached prefix returns a measurable latency reduction compared to an uncached one. The inference question changes: in a multi-tenant deployment, *who else* might have warmed a given cache entry?

### The Intra-Account Case (Concern Contingent on Namespace Structure)

Within whatever namespace an API account shares, a cache timing oracle can probe whether a specific prefix was recently cached by another caller in the same namespace. An attacker with partial account access — a compromise of one API key in a multi-deployment organization — could potentially probe whether other deployments recently used a particular system prompt prefix. This would enable configuration mapping: inferring what system prompts are in use across the organization without direct access to those deployments' configuration.

The probe procedure:
1. Establish a cold-start baseline: measure time-to-first-token for a fresh prefix of the same length on first use.
2. Issue a query beginning with the target prefix. Measure time-to-first-token (T1).
3. If T1 is substantially below the cold-start baseline, the prefix was already in-cache before your probe — populated by another caller within the same namespace.
4. If T1 matches the cold-start baseline, the prefix was not in-cache, and you've now warmed it yourself.

**How exposed you are depends on namespace structure.** If a provider partitions cache entries by project or workspace rather than by account, then different deployments in the same account may not share a namespace at all — the intra-account oracle disappears without any security failure. The threat is real in configurations where multiple deployments share a single cache namespace, which some providers support and some users actively configure for shared cache warming.

**What's the operational significance?** System prompts increasingly carry sensitive configuration: persona definitions, business rules, topic restrictions, and occasionally (and against advice) authentication tokens or API credentials. A timing oracle over a shared cache namespace can reveal which system prompts a deployment is using, potentially exposing configuration that operators expect to be opaque.

### The Cross-Account Case (Structural Risk, Not Confirmed)

Cross-account timing inference would require isolation to be weaker than providers document. Under the stated per-account isolation model, an attacker's API calls touch only their own cache namespace, regardless of what other accounts' prompts contain. No cross-account timing signal exists within that model.

That the documented model *prohibits* this attack class is meaningful — but it's a claim that hasn't been independently verified. Providers haven't published storage-layer architecture documentation to confirm that isolation is enforced at the key-value store level rather than only at the routing/application layer. Transient misconfigurations during failover, cache migration, or maintenance windows represent a realistic (if unpublished) exposure window.

> **⚠️ Empirical status.** Timing oracle attacks against production LLM KV caches have not been peer-reviewed or independently confirmed as of this writing. The architecture is analogous to the well-demonstrated [Flush+Reload](https://eprint.iacr.org/2013/448.pdf) class of CPU cache side-channels; the practical signal-to-noise ratio under real-world network jitter and provider-side normalization is unconfirmed.

## Prefix Probing: Inferring Other Tenants' System Prompts

A more targeted attack uses timing observations to test specific hypotheses about another caller's cached content — not merely whether cache activity occurred, but whether a particular known prefix is cached.

The method is an **iterative candidate validation** approach. An attacker who suspects a competitor uses a specific system prompt template can craft queries with specific candidate prefixes and measure cache-hit status for each. Because cache keys derive from the full prefix content (hashed), a hit on candidate P₁ but a miss on candidate P₂ narrows down which prefix variant the target deployment is using. Note that this is not a general-purpose search: the prefix space is not ordered, hashed keys carry no structural information about their content, and the oracle cannot enumerate unknown content from scratch. It can only confirm or deny specific candidate guesses.

Under per-account namespacing, this attack cannot cross account boundaries: the attacker's measurements only observe their own cache namespace. The threat requires the attacker and target to share a cache namespace, either because:

- They are different deployments within the same account sharing a namespace, **or**
- Provider isolation is weaker than documented (cross-account namespace collision)

For **multi-tenant platforms that expose shared LLM backends** — enterprise orchestration tools, API aggregators, shared-workspace applications where multiple users or teams hit the same underlying inference endpoint — the intra-account scenario may apply, *if* that platform multiplexes its users under a single provider account with a shared cache namespace rather than issuing per-tenant provider accounts or adding cache-busting per-tenant prefixes. Many vendors do the latter, specifically to prevent this exposure. The risk exists in platforms that don't.

**What can actually be inferred?** The oracle can validate guesses from a constrained candidate set, not freely reconstruct arbitrary text. The practical attack combines prefix probing with:

- Known-template reasoning (common LLM system prompt patterns are publicly documented)
- Business intelligence about the target organization's LLM deployment
- Prior partial exposures that seed the guessing space

Against a target whose system prompt is drawn from a known template with limited customization, an attacker with a good candidate set can confirm or rule out specific variants. The attack's efficacy is bounded by the quality of the candidate hypotheses — it is not a reconstruction attack against unknown content.

## Speculative Decoding and Token Leakage: Theoretical Limits

Speculative decoding accelerates inference by using a smaller **draft model** to generate candidate tokens, which the main model then verifies in parallel. In a batched multi-tenant serving setup, the interaction between speculative decoding and tenant isolation introduces an additional theoretical concern.

During speculative decoding, the main model must verify draft tokens against the actual distribution conditioned on the full context. In a batched verification pass, if request boundaries are not perfectly maintained, draft token distributions from one request could influence verification of another request's candidates.

**The practical risk here is extremely low under correctly implemented architectures.** Speculative decoding implementations maintain independent attention masks per request in a batch; the key-value cache for draft model and main model are kept separate. Published implementations (e.g., the open-source vLLM project's speculative decoding support) apply strict per-request isolation at the attention mask level.

What remains undocumented is whether all production deployments of speculative decoding at scale apply these controls uniformly, and whether efficiency optimizations ever compress batch boundaries in ways that weren't designed with cross-tenant isolation in mind.

> **⚠️ Theoretical classification.** Token leakage via speculative decoding has not been demonstrated in practice and would require specific architectural failures. This is a speculative analysis of a structural risk, not a reported vulnerability.

## Serverless and Shared-Context Deployments: Real Production Failure Modes

While the KV cache timing attacks above are largely theoretical in cross-tenant scenarios, a more concrete class of contamination occurs at the **application layer of serverless and shared LLM wrappers**.

Many production LLM deployments use function-as-a-service (FaaS) infrastructure or connection pooling to manage inference requests. When session state is not properly isolated between function invocations, context from one user's session can bleed into another user's request. This is not a theoretical attack — it's a category of implementation bugs that has appeared in production.

### The Session Bleed Pattern

The mechanism: an LLM wrapper maintains a conversation history object in memory or in a shared data store. When the wrapper handles a new request, it's supposed to initialize a fresh history. Instead, due to a scoping bug, it reuses or appends to the previous session's history. The result: the new user's session begins with context from a prior user's conversation.

This has occurred with LangChain's `ConversationBufferMemory` when a memory instance is shared across request handlers rather than instantiated per-request — a straightforward mistake that's easy to make in serverless or multithreaded environments where the module-level object persists across invocations. The LangChain documentation has evolved to more prominently warn about this pattern, but the underlying risk exists in any framework where memory objects can be unintentionally shared.

**What gets leaked in session bleed?** Whatever the prior user included in their conversation history:

- Personally identifiable information (names, contact details) shared during a conversation
- Business logic or configuration if the prior session was an automated workflow
- Authentication tokens or credentials if the application instructs users to share them with the AI (a bad practice that nonetheless occurs)
- Sensitive queries about health, legal, or financial matters

The severity is compounded in multi-turn applications where conversation history accumulates across many exchanges.

### FaaS Warm-Start Contamination

Serverless functions maintain **warm start pools**: after a function instance handles a request, it remains alive briefly to service subsequent requests without cold-start overhead. Any in-process state that isn't explicitly cleared between invocations persists across those requests.

For LLM wrappers that maintain prompt context or conversation history as process-level state, warm-start reuse means the next request inherits the previous invocation's context. Unlike a typical stateless HTTP handler bug, the failure mode here is invisible: the new user's session appears to start fresh from their perspective, but the model is receiving their prompt against a context window that already contains another user's history.

The core mitigation is ensuring conversation state is **scoped to the individual conversation** rather than to the process or module. In-process options include per-request object instantiation (creating a new history object within each invocation). Out-of-process options include keyed storage (e.g., Redis) scoped to a per-conversation or per-session identifier, as long as that key is unique to the user's conversation and not shared across different users' sessions. What's unsafe is any architecture where a mutable session object is created once and reused across invocations, or where a reset-at-start approach races with concurrent requests sharing the same object.

## Defense Landscape: What's Provably Safe vs. Best-Effort

### Provably Safe: Application-Layer Session Isolation

Session bleed vulnerabilities are fully preventable through correct implementation:

**Conversation-scoped session state.** Keep conversation history, memory buffers, and context objects scoped to the individual conversation — either by instantiating them fresh per invocation, or by keying them to a unique conversation/session identifier in external storage. Never share a single mutable session object across concurrent or sequential requests from different users.

**Scoped dependency injection.** In frameworks that support it, use request-scoped dependency injection for any component that holds conversation state. This makes session boundary management explicit in the code structure rather than relying on convention.

**Stateless wrapper verification.** For functions handling LLM requests, write a test that sends two sequential requests with distinguishable user content and verifies that the second response shows no knowledge of the first. In concurrent environments, extend this to overlapping requests — session isolation is only confirmed if interleaved calls from separate users also stay clean. This test should be part of the standard suite for any FaaS-deployed LLM application.

### Best-Effort: Infrastructure Timing Mitigation

**Deployment-specific prefix differentiation.** Including a short, stable, deployment-unique identifier at the start of every system prompt ensures your deployments don't share cache entries with other deployments in the same namespace. This prevents intra-namespace timing probes from revealing which system prompt your service uses. The identifier doesn't need to be secret; it needs to be unique and consistent. The cost: you lose the ability to share cache across *different* services or deployments; replicas of the same service using the same deployment identifier will still share cache with each other, which is usually desirable.

**Latency normalization.** Some providers apply artificial normalization to reduce the observable timing differential between cached and uncached responses. When available, this degrades the oracle's signal-to-noise ratio. Operators have limited control over this; it's a provider-side mitigation.

**Short system prompts.** Most caching implementations only activate above a token threshold (1,024–2,048 tokens depending on the provider). System prompts below the threshold don't generate cacheable entries, eliminating the timing attack surface at the cost of losing caching benefits.

### Verification Gaps: What Providers Haven't Documented

The most important defense — provider-level storage-layer isolation — cannot be verified by operators. The information needed to confirm it is:

- Which component enforces cache namespace isolation (routing layer, storage layer, or both)
- What the actual namespace partition granularity is (account, project, workspace, region)
- How isolation is maintained during infrastructure events (failover, cache migration, maintenance)
- Whether cache hit status is available in audit logs, and at what granularity

None of the major commercial providers have published this information as of this writing. Requesting it in enterprise agreements — as a documented architectural commitment rather than a general "we take security seriously" statement — is appropriate for high-sensitivity deployments.

## Risk Summary

| Scenario | Requires | Confidence Level |
|---|---|---|
| Session bleed via shared conversation history (FaaS) | Application-layer bug (no provider weakness needed) | **Confirmed real pattern** — preventable |
| Intra-namespace cache timing oracle (known prefix test) | Shared cache namespace between deployments | **Plausible/theoretical** — analogous attacks well-demonstrated; LLM-specific not peer-reviewed; depends on namespace partitioning |
| Prefix candidate validation against another deployment's system prompt | Shared namespace + strong prior candidate set | **Plausible/theoretical** — requires candidate hypotheses; not a reconstruction attack |
| Cross-account cache timing inference | Provider isolation weaker than documented | **Not supported** under documented isolation model |
| Speculative decoding token leakage across tenant boundary | Implementation failure in draft/verify separation | **Speculative** — no production reports |
| Cache namespace injection via second-preimage collision | Breaking provider's cache key hash scheme | **Speculative** — hard under well-designed schemes |

## Conclusion

Multi-tenant LLM inference introduces a layered security surface that most application-layer threat models don't reach. The risks span a spectrum from concretely confirmed (session bleed in FaaS-deployed wrappers) to theoretically plausible (timing oracles against known prefix targets within shared namespaces) to speculative (cross-account leakage via speculative decoding).

The immediate action for operators:

1. **Audit session state scoping** in every LLM wrapper you deploy to FaaS or shared infrastructure. This is the highest-probability failure mode and fully preventable.
2. **Add deployment-specific prefix differentiation** to system prompts to limit intra-namespace cache timing exposure.
3. **Request storage-layer isolation documentation** from your LLM provider if you're operating in a regulated environment. The absence of documentation is an audit finding in its own right.

The broader pattern here is familiar: efficiency and isolation are competing pressures at the infrastructure layer, and the security community's attention has lagged behind deployment practice. KV cache sharing, batching, and speculative decoding are production realities with limited published security analysis. That gap will close — the incentive to probe it is growing as LLMs handle increasingly sensitive workloads.

---

*Related: [Adversarial Prompt Caching: Timing Attacks and Injection via Shared KV Caches](/blog/adversarial-prompt-caching-kv-timing-attacks) — single-account adversarial KV cache attacks; [Exfiltration via Agent Side Channels](/blog/agent-side-channel-exfiltration) — indirect data leakage paths in agent deployments.*

*Sources: Kwon et al., "Efficient Memory Management for Large Language Model Serving with PagedAttention," SOSP 2023 (KV cache architecture). [OpenAI Prompt Caching](https://platform.openai.com/docs/guides/prompt-caching). [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching). Yarom and Falkner, "FLUSH+RELOAD: A High Resolution, Low Noise, L3 Cache Side-Channel Attack," USENIX Security 2014 (cache timing side-channels).*
