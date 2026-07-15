---
title: "Sponge Examples: Energy and Latency Attacks on Neural Networks"
description: "Adversarial inputs that don't fool a model's outputs — they exhaust its compute. Sponge examples maximize inference energy and latency, enabling DoS attacks that bypass rate limits, drain edge-device batteries, and degrade shared inference infrastructure. What they are, how they work, and how to defend against them."
pubDate: 2026-07-15
tags: ["adversarial-examples", "denial-of-service", "inference-security", "agent-autonomy", "energy-attacks", "ml-security", "ai-security", "neural-networks"]
relatedPosts: ["agent-loop-hijacking-resource-exhaustion-attacks", "adversarial-examples-foundational-ml-attack-production"]
---

Most discussions of adversarial attacks focus on outputs: the model classifies a stop sign as a speed limit, generates toxic text, or leaks training data. The threat model is deception — make the model produce the wrong answer.

Shumailov et al. (2021) described a different threat class entirely. Their inputs don't alter a model's answer. They alter how expensive it is to compute that answer. They coined the term **sponge examples**: inputs crafted to soak up as much energy and compute as possible during inference — like a sponge absorbing water.

The result is a denial-of-service attack operating at a level that conventional infrastructure defenses are blind to. Rate limiters count requests. Hardware firewalls filter packets. Network-layer DDoS scrubbing drops volumetric floods. None of these measures say anything about how much GPU compute one legitimate-looking API request consumes. A sponge input can exhaust a GPU cluster that handles 100 requests per second while sitting comfortably within a quota of 1 request per second.

This post covers what sponge examples are, how the attack works across NLP and vision models, the specific mechanics for modern LLMs, what the real-world threat models look like, why standard defenses fail, and what actually helps.

## The Paper: Shumailov et al., NeurIPS 2021

The foundational reference is Shumailov, Zhao, Gal, Papernot, Anderson, and Gal, "Sponge Examples: Energy-Latency Attacks on Neural Networks," published at the IEEE European Symposium on Security and Privacy (EuroS&P 2021) and also appearing as NeurIPS 2021 workshop material (arXiv:2006.03463).

The core empirical result: on standard NLP models (BERT, AlBERT, ALBERT-xxlarge), adversarially crafted inputs increased energy consumption by **10 to 35 times** relative to typical inputs. On vision models, the increase was smaller but still meaningful — 1.5 to 3x on architectures using dynamic computation (adaptive computation graphs, early-exit networks).

The attack targets a structural property of neural networks, not a bug in any particular implementation. Understanding why requires understanding what determines inference cost.

## What Determines Inference Cost?

For a fixed-architecture model like a CNN with no dynamic components, inference cost is essentially fixed per input — every input runs through the same number of operations. These models are not vulnerable to sponge attacks in the traditional sense.

Vulnerable models are those with **input-dependent computation**:

**Attention mechanisms** (transformers, self-attention). The attention operation has O(n²) complexity in sequence length: computing attention between n tokens requires n² pair-wise attention scores. A 512-token input requires 4× the attention computation of a 256-token input. An attacker who can push inputs toward longer processed sequences directly scales inference cost quadratically.

**Dynamic computation graphs**. Some architectures — adaptive computation networks, MoE routing, early-exit networks — take different paths through the compute graph depending on input content. Early-exit networks, designed to save energy by short-circuiting easy inputs, provide confidence signals that an adversary can invert: maximize the difficulty signal to force late exit (most computation), or manipulate it to trigger long chains. The energy-saving mechanism becomes the attack surface.

**Beam search and auto-regressive generation**. In seq2seq models and language model generation, the output length is not fixed. Beam search with width `k` explores `k` candidate sequences at each decoding step. More steps × wider beam = quadratically more computation. An input that triggers longer, more complex outputs amplifies inference cost multiplicatively.

**Tokenization variability**. Some tokenization schemes (BPE, WordPiece) produce variable-length token sequences from equal-length text. Adversarial inputs can be crafted to maximize token count from the tokenizer, inflating the effective sequence length before attention even begins.

## How the Attack Works for NLP Models

Shumailov et al. formulated sponge example generation as an optimization problem: find input `x` within a perturbation budget ε (to keep the input plausible) that maximizes a cost proxy — either energy measured directly, or a surrogate like sequence length, attention entropy, or computation graph depth.

For white-box attacks (gradient access), they used gradient ascent on the energy proxy. For black-box attacks (API access only), they used query-based optimization and evolutionary search. Both work, but the black-box versions require more queries.

For NLP, the attack exploits the relationship between input structure and attention cost:

**Maximizing attended tokens**. Inputs that cause dense attention — where each token attends heavily to many others rather than a few — are more expensive. Adversarial inputs can push attention patterns from sparse (cheap) to dense (expensive).

**Triggering worst-case tokenization**. Inputs crafted with unusual character sequences, rare unicode, or specific subword combinations force tokenizers to produce many more tokens than the raw character count would suggest. A 100-character input can produce 150 tokens if it hits pathological tokenization cases.

**Inflating decoding depth**. For sequence-to-sequence models and generation tasks, inputs that produce long outputs — many decoding steps, high-branching-factor beam search — impose cost that multiplies with every output token. An adversarially crafted input to a translation or summarization model can force a much longer output without the output being "wrong" in any detectable way.

## How the Attack Works for Modern LLMs

Modern large language models amplify every sponge mechanism simultaneously:

**O(n²) attention at scale**. A 128K-context transformer has attention cost that scales with the square of the context length. Processing a 64K-token sponge input costs 4× more than a 32K-token sponge input. API providers that charge per input token still face GPU saturation effects: a single 100K-token request can tie up a GPU for seconds while thousands of normal 1K-token requests would serve the same user count at normal latency.

**Chain-of-thought depth**. Models prompted to reason step-by-step generate intermediate tokens before the final answer. An adversarial input that maximizes chain-of-thought length — by posing a problem that appears to require deep reasoning — multiplies output cost by the reasoning depth. The final answer might be correct; the energy expenditure is adversarially inflated.

**KV cache pressure**. Long-context transformers maintain key-value caches that grow with sequence length. A sponge input that saturates KV cache forces cache eviction for concurrent requests, degrading throughput system-wide for all users sharing the inference backend — not just the attacker's own requests.

**Multi-modal inputs**. Vision-language models that process images at full resolution before encoding face image-resolution-dependent cost. An adversarially crafted high-resolution image with maximally complex visual structure can inflate vision encoder cost before any text processing begins.

## The Threat Models

### Public API Abuse

An attacker with API access but no credentials beyond a free or low-tier subscription submits sponge inputs that consume far more GPU time per request than the provider's pricing model anticipates. If the provider uses rate limits (requests per minute) rather than compute limits (GPU-seconds per minute), the sponge inputs exhaust backend capacity while staying within quota.

The economic asymmetry is the key threat: the attacker pays for one request; the provider bears the cost of 30× the normal compute. At scale across multiple free-tier accounts, this is a DoS attack that costs the provider real money without requiring volumetric traffic. The Shumailov et al. paper showed that their attacks fit comfortably within standard API rate limits while still causing significant compute inflation.

### Multi-Tenant Inference Server Degradation

Multi-tenant serving infrastructure — Triton Inference Server, vLLM, and similar systems — batches requests from multiple clients for efficiency. A sponge input submitted by one user can blow up the batch processing time for all concurrent users, increasing their latency. The attack is a lateral effect: attacker submits one expensive request; dozens of unrelated users see elevated response times.

This is particularly relevant for shared cloud inference endpoints where customers don't have isolated GPU allocations. A single adversarially long request holds a GPU thread while other users' requests queue.

### Edge Deployment: Battery Drain and Thermal DoS

Edge-deployed models — on-device LLMs, mobile NLP, embedded vision — face a qualitatively different threat. GPU compute on a mobile device is directly tied to battery life and thermal performance. A sponge input that forces maximal computation exhausts the battery faster and may trigger thermal throttling, degrading all on-device performance for minutes after a single inference call.

A malicious QR code processed by an on-device model, a crafted audio segment processed by an on-device speech recognizer, or a specially crafted document viewed in an app with on-device summarization — any of these can function as sponge inputs that drain battery and degrade device performance. The attacker controls the input; the victim's device pays the energy cost.

Shumailov et al. explicitly demonstrated this in their energy measurements using hardware power monitors — the energy increase is real and measurable at the device level, not just a theoretical throughput metric.

### Fine-Tuning and Training Poisoning

A related attack: injecting sponge inputs into training datasets so that the model learns to produce expensive computation patterns on certain trigger inputs. This isn't just adversarial training; it's an attack on the operational cost of running the model at inference time, embedded invisibly in the model's weights. A model deployed from a poisoned dataset may have artificially elevated inference costs at production scale that are indistinguishable from legitimate increased demand.

## Why Rate Limiting Doesn't Catch Sponge Attacks

The fundamental mismatch is between the units of measurement. Rate limiters operate on **request count**: `N requests per minute`. They're designed for volumetric attacks, where the attacker achieves impact through volume.

Sponge attacks are **per-request compute attacks**. The impact is achieved within a single request. A rate limit of 60 requests per minute:
- Stops an attacker sending 10,000 normal requests per minute (volumetric)
- Does nothing against an attacker sending 1 sponge request per minute that consumes as much GPU as 1,000 normal requests

The GPU sees: 1 request (within quota) that runs for 30 seconds. The rate limiter sees: 1 request (within quota). No alarm fires.

Token-based billing (charging per input/output token) partially addresses this for billing purposes, but doesn't prevent the infrastructure impact. A 100K-token request might be priced appropriately for the bill to the customer, but the GPU still spends the time running it, and other requests in the queue still wait.

The same gap exists for cost-per-request API quotas, IP-based throttling, and user-level request budgets. All of these are volumetric controls applied to a non-volumetric attack.

## Why Classical Analogs Are Instructive

Sponge examples have meaningful parallels to well-understood algorithmic complexity attacks:

**XML bombs** (also called "billion laughs"): an XML document with exponentially nested entity references that expands a small input file into gigabytes of data in memory. The input is small and valid; the processing cost is enormous. XML parsers that expand entities without recursion limits are vulnerable.

**ReDoS (Regular Expression Denial of Service)**: carefully crafted strings that trigger catastrophic backtracking in regex engines with exponential worst-case complexity. A 30-character input can cause a vulnerable regex engine to run for minutes.

**Hash flooding**: adversarially chosen keys that all hash to the same bucket in a hash table with poor collision handling, turning O(1) lookups into O(n) operations.

In all three cases: the input is syntactically valid, the processing appears normal from the outside, and the vulnerability is in the interaction between adversarial input structure and a complexity property of the processing algorithm. Sponge examples are the neural network version of this class.

The lesson from the classical cases is also instructive: all three required defense mechanisms beyond "count the requests" — resource bounds (entity expansion limits, regex timeout budgets, randomized hash seeds). Neural inference requires analogous per-request compute bounds.

## Defenses

### Per-Request Compute Budget Enforcement

The most direct defense: enforce a time or computation budget per inference request and terminate requests that exceed it. If inference normally takes 50ms, requests that haven't returned by 500ms are terminated with an error. This caps the maximum compute any single request can consume.

Implementation requires measurement at the right layer. A wall-clock timeout at the API gateway level is a start, but it doesn't account for GPU-specific execution time or distinguish between slow network and slow computation. Better: GPU execution time counters at the inference server level, with a per-request budget in GPU-milliseconds.

The tradeoff is legitimate latency variation: complex queries take longer than simple ones, and legitimate use cases may have high variance. The budget needs to be set relative to the expected distribution of normal query costs, not a fixed absolute limit.

### Input Complexity Scoring Before Inference

Pre-screen inputs for features that predict high computation cost before inference runs:

- **Token count after tokenization**: reject or downgrade inputs above a token-count threshold before the model processes them
- **Structural complexity**: for structured inputs (code, JSON, HTML), measure nesting depth or reference count as a proxy for processing cost
- **Entropy and character distribution**: pathological tokenization cases often correlate with unusual character distributions

This is a content-aware rate limiter that operates in compute-predictive space rather than raw request count. It's not perfect — an adversary with access to the scoring logic can craft inputs that score low but still cause high compute — but it raises the attack cost significantly.

A practical implementation: run a lightweight proxy model or heuristic function that estimates inference cost from input features in O(1) or O(n) time, before committing to the O(n²) attention computation.

### Hardware Performance Counters

Modern GPUs and CPUs expose performance monitoring units (PMUs) that count low-level events: cache misses, branch mispredictions, memory bandwidth, floating-point operations. Sponge inputs that force maximal computation will register as outliers on these counters.

Monitoring GPU utilization, memory bandwidth, and compute duration per request provides a behavioral signal that's hard to spoof: an adversary can shape their input content, but they can't (from user space) control how it executes on the hardware. An inference request that consumes 10× the normal GPU-seconds is an anomaly regardless of what the input looks like.

Operationally: baseline normal per-request GPU utilization; set an anomaly threshold; flag or terminate requests that exceed it. This requires instrumentation at the inference serving layer, not just the API gateway layer.

### Maximum Output Length Limits

For generation models, the most direct sponge surface is output length. Hard-capping the maximum number of output tokens prevents the beam search and auto-regressive generation attacks. OpenAI, Anthropic, and most major inference providers implement `max_tokens` parameters precisely for this reason — they're both a cost control mechanism and, when enforced server-side, a sponge defense.

The defense is partial: it bounds output cost but not input attention cost. A 100K-token input with a forced 1-token output is still expensive to process.

### Server-Side Request Costing and Dynamic Backpressure

Instrument the inference serving layer to measure actual compute cost per request — GPU time, memory bandwidth, FLOPs — and maintain a per-user compute budget alongside the per-user request budget. A user who submits one very expensive request is subject to backpressure (queuing delay, throttling) on subsequent requests even if they haven't exceeded their request-count quota.

This is the analog of bandwidth-based rate limiting for network traffic: rather than counting packets, count bytes. For inference, rather than counting requests, count GPU-seconds.

Dynamic backpressure means: when the inference cluster is under high load, prioritize requests that are predicted to be inexpensive. This is already done implicitly in some continuous batching implementations (vLLM, PagedAttention), but it's typically optimized for throughput rather than security. Making the cost accounting explicit and tying it to per-user quotas closes the volumetric-vs-compute gap.

### Architectural Defenses

For models in the design phase rather than already deployed:

**Fixed-computation paths**: architectures that don't use adaptive computation (no early exit, no dynamic routing) eliminate the dynamic-computation attack surface. The cost is that these models can't take advantage of the energy savings that dynamic computation provides on easy inputs.

**Attention sparsification**: sparse attention patterns (BigBird, Longformer, sliding-window attention) reduce the O(n²) scaling of full attention. This provides a structural ceiling on per-token attention cost, though adversarial inputs can still target the remaining quadratic terms.

**Efficient KV cache management**: systems that evict KV cache entries from long requests without holding GPU memory hostage to a single request provide some isolation against the cache-pressure variant of the attack.

## What Sponge Examples Are Not

To be precise about the scope:

Sponge examples are **not** the same as agent loop hijacking (covered in [Agent Loop Hijacking](/blog/agent-loop-hijacking-resource-exhaustion-attacks)). Loop hijacking operates at the orchestration layer: adversarial prompts that cause agents to spin in reasoning loops, make excessive tool calls, or trigger billing events across many separate inference calls. Sponge examples operate at the single-inference level: one API call, one model forward pass, maximized compute cost within that call.

The two attacks are complementary and can be combined: a loop hijacking payload that also contains sponge-optimized inputs would inflate both the number of calls and the cost per call. But the defenses differ. Loop hijacking defenses focus on orchestration — termination conditions, tool call limits, output validation. Sponge defenses focus on per-inference compute bounds.

Sponge examples are also **not** the same as classical adversarial examples (covered in [Adversarial Examples](/blog/adversarial-examples-foundational-ml-attack-production)). Classical adversarial examples maximize classification error — they cause wrong outputs. Sponge examples maximize compute cost — the output may be correct. The optimization target is entirely different. An adversarially perturbed image that a vision classifier misclassifies is not, in itself, a sponge example. A sponge input to a vision model with dynamic computation would look different and would be specifically crafted to force maximal compute, not maximal error.

## Detection and Monitoring

From an operations perspective, sponge attacks are detectable but require instrumentation that many deployments lack:

**Latency distribution outliers**: normal inference latency has a predictable distribution for a given model and workload. Sponge inputs shift a request's latency to the tail of that distribution — or beyond it. Alerting on requests whose latency exceeds the 99.9th percentile of the normal distribution provides an early signal, though it requires a clean baseline.

**Per-user cost accounting**: tracking GPU-time-per-user over a rolling window reveals users whose requests are consistently more expensive than average. This is operationally similar to tracking bandwidth-per-user in a network context.

**Input feature monitoring**: logging the distribution of input token counts, input entropy, and other complexity proxies over time reveals adversarial attempts to push inputs toward high-complexity regions.

**Batch impact monitoring**: in multi-tenant batch serving, tracking how one user's request affects other users' latency (batch slowdown) provides a signal that's specifically sensitive to sponge inputs.

The challenge is that all of these require instrumentation at the inference serving layer, not just the API layer. Most off-the-shelf monitoring stacks instrument HTTP latency and request count — they don't have visibility into GPU execution time at per-request granularity. Building the instrumentation is the prerequisite to detection.

## Practical Risk Assessment

For organizations deploying inference APIs at scale, the practical risk assessment:

**High risk**: public-facing APIs with free tiers or permissive rate limits, multi-tenant inference infrastructure where one user's cost affects others' latency, edge deployments on battery-constrained devices processing untrusted inputs.

**Medium risk**: internal-facing APIs with authenticated users (insider threat remains; so does compromised account misuse), any deployment where inference cost is not metered at the compute level.

**Low risk**: fixed-architecture models with no dynamic computation (classical CNNs, transformers with fixed input and output lengths), isolated single-tenant deployments where cost inflation doesn't affect other users.

The defenses with the highest impact-to-effort ratio are per-request timeout enforcement (cheap to implement, immediately effective) and output token limits (already built into most generation APIs). Hardware performance counter monitoring requires more investment but provides the most robust detection capability.

## Summary

Sponge examples represent a threat class that's fundamentally distinct from both classical adversarial attacks (which target output correctness) and volumetric DoS (which targets request volume). They exploit a real structural property of input-adaptive computation — attention's O(n²) scaling, dynamic routing, auto-regressive generation — to impose adversarially inflated compute costs within a single, quota-compliant request.

The Shumailov et al. measurement (10–35× energy increase on NLP models, peer-reviewed at NeurIPS 2021) establishes that this is a practical attack, not a theoretical curiosity. The defenses — compute budget enforcement, input complexity scoring, hardware PMU monitoring, output length limits, per-user compute accounting — are implementable with current infrastructure, but require deliberate instrumentation work rather than default configuration.

The gap to address: most deployments have request-count rate limits and no compute-per-request accounting. Closing that gap is the primary actionable step.

---

*Primary reference: Shumailov, Zhao, Gal, Papernot, Anderson, and Gal. "Sponge Examples: Energy-Latency Attacks on Neural Networks." IEEE European Symposium on Security and Privacy, 2021. arXiv:2006.03463.*
