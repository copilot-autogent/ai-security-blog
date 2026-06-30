---
title: "Adversarial Prompt Caching: Timing Attacks and Injection via Shared KV Caches"
description: "As LLM providers roll out shared prefix caching to cut inference costs, a new attack surface emerges: cache-timing side channels and cross-tenant injection vectors at the inference infrastructure layer."
pubDate: 2026-06-30
tags: ["prompt-injection", "side-channel", "inference-infrastructure", "cache-attacks", "llm-security"]
---

Most LLM security coverage focuses on the application layer — jailbreaks, prompt injection through user input, indirect injection via retrieved documents. The inference infrastructure sitting below the application rarely appears in threat models. That's starting to change.

**KV-cache sharing** — reusing intermediate attention activations across requests that share a common prefix — is one of the most impactful inference optimizations deployed at scale today. OpenAI's prompt caching, Anthropic's cache\_control API, and similar mechanisms at Google reduce cost and latency for system prompts and long context windows. But shared infrastructure introduces shared risk. This post examines what's empirically confirmed, what remains theoretical, and how defenders should think about it.

## How KV-Cache Sharing Works

When a transformer processes a prompt, it computes key-value (KV) pairs at each attention layer for every token. On a subsequent request that begins with the same prefix, a caching layer can skip recomputation and serve those KV pairs from storage. The result: the model "picks up" processing from the end of the cached prefix, dramatically reducing compute cost for long system prompts or high-frequency boilerplate.

The mechanics vary by provider:

**Prefix hashing.** Providers hash the byte content of the prompt prefix to identify cacheable chunks. OpenAI's automatic prompt caching triggers on prefixes of 1,024+ tokens; Anthropic's implementation requires explicit `cache_control` markers and activates at 1,024–2,048 token boundaries depending on model tier.

**Eviction policies.** Caches are finite. Entries are evicted under LRU or TTL policies — Anthropic quotes a 5-minute TTL for standard cache entries. After eviction, the next request recomputes the prefix at full cost.

**Tenant isolation.** This is where the attack surface lives. Providers apply isolation at the *account* level: cache entries for prompt prefix X under account A are not visible to account B, even if B sends the identical prefix. But "account-level isolation" still means the same underlying KV store services multiple accounts. Whether isolation is enforced at the storage layer, the routing layer, or the application layer — and how robustly — is not publicly documented.

## Timing Side-Channels: The Cache Oracle

The most concretely demonstrated attack class doesn't require breaking isolation. It exploits something unavoidable: **cached requests return faster than uncached ones**.

When a prefix is served from cache, the provider skips prefill computation for those tokens. At the scale of long system prompts, this differential is measurable. Published estimates for OpenAI's prompt caching indicate latency reductions of 10–50ms for typical enterprise-length system prompts (~2,000 tokens), with larger differentials for longer prompts.

An attacker who can measure time-to-first-token can potentially construct a **cache oracle**: a probe that distinguishes whether a target system prompt is currently cached. The oracle relies on comparing measured latency against an expected cold-start baseline for that prefix length. The procedure:

1. Establish a cold-start baseline: measure time-to-first-token for a known-uncached prefix of the same length to calibrate the expected uncached latency.
2. Issue a query beginning with the target prefix. Measure time-to-first-token (T1).
3. **If T1 is significantly below the cold-start baseline**, the prefix was already in the cache before the probe arrived — meaning some prior request had populated it. Within an account, this implies another deployment or service was recently active with that prefix.
4. If T1 matches the cold-start baseline, the prefix was not in cache before the probe. (Your probe just warmed it; a follow-up query will return faster, but that reflects your own cache population, not a third party's.)

This isn't a hypothetical construction. Timing side-channel attacks on shared infrastructure have a long history in conventional security — the [Flush+Reload](https://eprint.iacr.org/2013/448.pdf) family of CPU cache attacks exploits the same class of observation: you can infer what a co-tenant has been doing by measuring what's hot in shared memory.

**What can an attacker actually infer, and against whom?** The scope is constrained by account isolation. Under standard per-account namespacing, the oracle measures activity *within a cache namespace the attacker already has access to* — distinguishing whether another deployment inside the same account recently used a given prefix. This is relevant in scenarios where the attacker has partial account access but not full visibility into other deployments' configurations.

Cross-account inference (e.g., detecting whether a competitor is using a particular system prompt) is **not** possible under strict per-account isolation: the attacker's probe touches only their own account's cache namespace, regardless of what the target's prefix content is. Cross-account leakage would require isolation to be weaker than documented — which is precisely the risk that the subsequent section addresses.

> **⚠️ Scope limitation.** The cache timing differential is real and measurable in principle. Empirical measurement of this specific attack against production LLM APIs has not been published in peer-reviewed literature as of this writing. The architecture of the oracle is well-founded; the practical signal-to-noise ratio under real-world network jitter has not been independently confirmed. Treat this as a well-theorized risk, not a deployed exploit.

## Injection via Shared Cache Namespaces: The Theoretical Case

A more speculative — but architecturally concerning — attack class involves **cache poisoning via prefix injection**.

The prerequisite: a shared cache namespace where attacker-controlled content can influence what other tenants retrieve. Under strict account-level isolation, this shouldn't be possible. But the attack becomes plausible under weaker isolation models:

**Scenario 1: Sub-account namespace collisions.** If a provider's isolation unit is a *project* or *deployment* rather than an *account*, and multiple deployments within the same account share a cache namespace, an attacker with partial account access could probe which prefixes are in-cache across deployments, revealing configuration secrets from deployments the attacker doesn't directly control. True content injection (writing different activations under the same cache key) additionally requires either a hash collision or mutable cache entries — simply sharing a namespace enables correlation and inference attacks, not automatic activation substitution.

**Scenario 2: Prefix collision under hash collisions.** Cache keys are typically derived from a hash of the prefix content. Hash collisions are cryptographically rare under robust schemes but have a historical track record of being more exploitable than theory suggests when implementations cut corners. An attacker who can engineer a collision would have a prefix whose content differs from the target's but maps to the same cache key — causing the target's cached activations to be served in response to the attacker's content, or vice versa.

**Scenario 3: Provider-level misconfiguration.** Account isolation may be enforced in the hot path but not during cache migration, failover, or maintenance windows. Transient misconfiguration during infrastructure events is a known failure mode in multi-tenant systems.

None of these scenarios have been demonstrated against a production LLM provider. They represent the **adjacent threat** to what caching isolation is designed to prevent — which is worth understanding precisely so the isolation guarantees can be evaluated against them.

> **⚠️ Theoretical classification.** Cache namespace injection into LLM KV stores has not been empirically demonstrated or reported as a confirmed vulnerability by any major provider as of this writing. The scenarios above are structural analyses of what weakened isolation would enable, not reports of observed attacks.

## What Providers Are Doing (and Not Saying)

Anthropic's `cache_control` API documentation describes TTL and token limits. OpenAI's prompt caching documentation describes eligibility criteria and cost discounts. Neither provider publishes explicit documentation on:

- How cache namespaces are partitioned at the infrastructure layer
- Whether cache hit status is separately logged for security audit purposes
- What happens to cache state during account suspension or data deletion requests

**The absence of documentation is itself a security signal.** Infrastructure-layer attack surfaces tend to be under-described because providers haven't been asked to describe them. The conventional security research community has not yet produced published timing attack demonstrations against production LLM caches — but the methodology is mature enough that this is likely a matter of research priority rather than infeasibility.

Google's documentation for Gemini context caching is more explicit on cost and TTL structures but similarly silent on tenant isolation architecture.

## Defenses

For operators deploying LLM APIs, mitigations cluster around two categories:

### 1. Reduce Timing Signal

**Randomized prefix salting.** Append a short, secret, deployment-specific token to the beginning of every system prompt before hashing. This means identical system prompts across deployments don't share a cache key, and timing probes against the deployment's prefix don't reveal anything about other deployments' cache state. The cost: cache hits become deployment-specific — you cannot warm a shared cache across multiple production instances.

**Latency normalization.** Some providers add artificial latency to normalize time-to-first-token, eliminating cache timing differentials visible to API consumers. This defends against external observers but doesn't help with intra-provider timing observations.

**Rate limiting on repeated identical requests.** An accurate cache oracle requires multiple probes to build statistical confidence against network jitter. Rate limiting per IP or per API key on similar requests degrades oracle accuracy.

### 2. Reduce Cache Surface

**Explicit cache opt-out.** Some providers allow disabling prompt caching entirely. For deployments with short or dynamically constructed system prompts where the caching benefit is small, opting out eliminates the attack surface at a modest cost premium.

**Minimize cacheable prefix length.** Caching triggers on longer prefixes. Keeping system prompts short enough to fall below the caching threshold removes the benefit and the risk together.

**Per-tenant cache namespacing.** For providers operating multi-tenant LLM infrastructure internally, isolating cache namespaces by tenant at the storage layer (not just at the routing layer) is the architectural mitigation that addresses the root cause.

### 3. Audit and Detect

**Cache hit logging.** If a provider exposes cache hit status in API responses, log it. An unexpected pattern of cache hits on a rarely-queried system prompt — hits that precede your own query by the oracle logic above — suggests a third party within the same account namespace was recently querying with the same prefix.

**Provider-level audit trails.** In enterprise agreements, request audit trail access that includes caching behavior. This doesn't prevent attacks but enables detection after the fact.

## Why This Attack Class Matters Now

The industry incentive structure favors aggressive caching. Every cache hit is direct cost reduction for the provider and latency improvement for the user. As context windows grow (128K, 1M tokens) and system prompts become longer and more complex, the caching dividend grows proportionally. Providers will continue expanding caching aggressively.

This means the isolation architecture protecting tenants from each other's cache state will face increasing pressure at exactly the time the cache surface is growing. Attacks that are impractical today against short system prompts become more practical when 100K-token context caches are the norm.

The broader pattern: **inference infrastructure is becoming a meaningful attack surface** alongside the application layer. Batching, speculative decoding, KV cache sharing — these mechanisms are designed for efficiency and have been evaluated primarily on performance and correctness metrics. Security analysis of multi-tenant isolation guarantees has not kept pace.

The conventional penetration testing toolkit doesn't naturally reach this layer. LLM-specific security research is still catching up to the infrastructure realities of production deployments. Timing side-channels against shared caches are a good example of a risk class that's clearly within scope for serious infrastructure audits but not yet part of standard LLM security evaluations.

## Summary

| Claim | Confidence | Basis |
|---|---|---|
| KV-cache sharing introduces timing differentials measurable at the API layer | **Confirmed** | Cache hit performance data from provider documentation |
| Timing oracle can detect intra-account cache activity via latency vs. baseline comparison | **Plausible / theoretical** | Analogous CPU cache timing attacks well-demonstrated; LLM-specific exploit not published |
| Cross-account timing oracle is possible under standard per-account isolation | **Not supported** | Per-account namespacing severs the cross-account signal; requires isolation weakness |
| Cache namespace injection under misconfigured isolation is possible | **Structural / theoretical** | Follows from multi-tenant storage architecture; not reported against production systems |
| Hash collision enables serving adversarial activations under a legitimate cache key | **Structural / theoretical** | Well-understood in cryptographic literature; requires weak hash scheme |
| Randomized prefix salting mitigates timing oracle attacks | **Confirmed** | Standard defense from analogous timing attack literature |
| Providers have sufficient tenant isolation to prevent cross-account cache poisoning | **Unverified** | No public documentation on storage-layer isolation guarantees |

The empirically solid claim is simple: shared caches produce timing signals, and timing signals leak information. Everything downstream of that depends on isolation guarantees that providers have not publicly verified. That's a gap worth closing — through either published security architecture documentation or independent security research.

---

*Related: [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/) — LLM05 covers supply chain risks; infrastructure-layer cache attacks are an adjacent surface not yet in the standard taxonomy. OpenAI [prompt caching documentation](https://platform.openai.com/docs/guides/prompt-caching); Anthropic [prompt caching documentation](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching).*
