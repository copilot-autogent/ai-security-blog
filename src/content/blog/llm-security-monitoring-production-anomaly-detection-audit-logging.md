---
title: "LLM Security Monitoring in Production: Anomaly Detection, Audit Logging, and Intrusion Detection for AI Systems"
description: "Guardrails block known bad inputs. Incident response handles breaches after they happen. This post covers the gap: building LLM-specific observability that detects attacks while they are occurring — anomalous outputs, prompt injection signatures, unusual tool-call patterns, and model drift from baseline."
pubDate: 2026-07-10
tags: ["monitoring", "anomaly-detection", "audit-logging", "intrusion-detection", "observability", "langfuse", "arize", "owasp", "nist", "security", "llm", "production"]
---

Guardrails block known bad inputs at the gate. Incident response handles breaches after they have already happened. Between those two layers sits a largely empty space — the continuous monitoring of live AI systems while requests are being processed, outputs being generated, and tools being called.

Standard application performance monitoring was not designed for this. A web service either returns HTTP 200 or it doesn't. An LLM either complies with an injection attempt or it doesn't — and it may do so in ways that look exactly like normal operation to every metric you're currently collecting. Latency is in range. Token counts are within bounds. No exceptions were thrown. The system appears healthy while an attacker is extracting sensitive information or manipulating agent behavior across an extended session.

This post builds the monitoring layer that addresses that gap: what to instrument, what anomalies to alert on, how to structure audit logs for AI-specific events, and how to detect the signal patterns that indicate attacks in progress.

## Why Standard APM Fails for AI Systems

Traditional application monitoring rests on determinism: a correct database query returns the expected rows; an incorrect one throws an exception or returns zero results. The "right answer" is knowable. Monitoring is a matter of detecting deviations from it.

LLM outputs are not deterministic in this sense. The same prompt sent to the same model at different times, different temperatures, or with different context will produce different outputs — all of which may be entirely correct. There is no ground-truth oracle you can compare against at runtime.

This breaks the foundational assumption of standard monitoring in three ways:

**Structural metrics are necessary but not sufficient.** Request latency, token counts, HTTP status codes, and error rates are worth collecting — they detect infrastructure problems and gross failures. But they are blind to semantic failures: an output that is structurally valid but behaviorally compromised. A model that has been jailbroken into providing harmful content looks identical to a healthy model from the perspective of a latency histogram.

**Thresholds are statistical, not absolute.** You can't set a threshold of "toxicity score > 0.8 = alert" and call it done. An LLM's output distribution is wide and context-dependent. A creative writing application legitimately produces outputs that would be flagged as suspicious in a customer service context. Meaningful thresholds require baseline characterization of *your specific deployment* before they can be calibrated.

**Intent divergence is invisible to structural inspection.** One of the primary attack classes in LLM systems — prompt injection via indirect content — succeeds precisely because the model is following instructions correctly. From the model's perspective, the injected instructions *are* the instructions. The structural output is valid. The semantic behavior has been hijacked. Detecting this requires comparing what the model was *supposed* to do against what it actually did — a fundamentally different monitoring task than checking whether a function returned an error.

The OWASP Top 10 for Large Language Model Applications (the project publishes versioned editions; consult the current release at owasp.org) covers Prompt Injection and Sensitive Information Disclosure as two of its top risk categories, noting that neither is reliably caught by standard application security monitoring tools designed for deterministic software. The NIST AI Risk Management Framework (AI RMF 1.0, January 2023) dedicates its MEASURE function specifically to the challenge of operationalizing AI-specific metrics — recognizing that trustworthiness properties like fairness, safety, and security require continuous measurement, not just one-time validation.

## Input Monitoring

The first monitoring layer sits before the model — on the raw input before it reaches inference.

**Prompt length distribution.** An attacker probing for jailbreaks, injection vulnerabilities, or context-window overflows often uses atypically long or structured prompts. Track the distribution of prompt lengths for your deployment and alert on significant deviations from the baseline — prompts in the 99th percentile of length warrant inspection, particularly if they come from a single user or session. This is a weak signal in isolation but a useful component in a composite score.

**Embedding-space outlier detection.** Semantic outlier detection works by embedding incoming prompts and comparing them against a characterization of normal traffic. If your deployment serves customer service queries, the embedding centroid of normal traffic clusters tightly around product questions, billing inquiries, and support requests. An adversarial prompt attempting indirect injection will often land far from that centroid in embedding space — not because it's structurally different, but because it's semantically unlike your normal workload.

This approach requires building a baseline model during a clean initial period of operation, then running a distance metric (cosine distance from centroid, or a more sophisticated anomaly detection model) on incoming prompts at inference time. False positive rates depend heavily on how well your baseline characterizes normal variation. It is a *detection* signal — it tells you something unusual arrived — not a *prevention* mechanism.

One structural assumption to be aware of: a single centroid baseline assumes your normal traffic has a roughly unimodal distribution. Multi-tenant platforms or deployments that serve multiple distinct use cases (e.g., a code assistant and a customer support bot sharing infrastructure) will have multimodal traffic distributions — a single centroid will both over-alert on legitimate traffic from minority cohorts and fail to detect attacks in underrepresented segments. For these workloads, segment baselines by use-case label, tenant ID, or request type, and compute embedding distance against the appropriate segment baseline rather than the global one.

**Known injection signature matching.** A catalog of known prompt injection patterns (instruction overrides, role-switch attempts, DAN-style formatting, system prompt extraction probes) can be matched against incoming prompts using string matching or lightweight classifier models. OWASP's LLM Top 10 provides a categorization of attack types. Individual red-team research projects and security vendors maintain signature sets that can be adapted for detection purposes.

Signature matching catches known attacks reliably; it is blind to zero-day variants. Use it as a fast-path signal that escalates to logging and investigation, not as a blocking gate unless you also have a high-confidence model classifier in the loop.

**Velocity and session signals.** Track request rates per user, per session, and per IP. Coordinated probing for injection vulnerabilities often involves high-velocity sessions with systematic prompt variation — iterating over a template with slight modifications. Anomalous request velocity is a meaningful signal when combined with input embedding distance.

## Output Monitoring

Output monitoring is harder than input monitoring because the output space is vast and context-dependent, but it is often where the most useful attack signals appear.

**Refusal rate tracking.** Well-aligned models refuse a predictable fraction of requests across a representative traffic sample. A sudden drop in refusal rates may indicate that jailbreaking attempts are succeeding — the model has been persuaded to override its safety behaviors more frequently than baseline. This is not definitive (the content of the traffic may have legitimately shifted), but a sustained downward drift in refusal rate deserves investigation.

The inverse is also informative: a sudden spike in refusal rates may indicate that the model is receiving a flood of adversarial inputs that trigger safety responses. This pattern is consistent with a probing campaign searching for the boundary of the model's safety envelope.

Refusal rate baselines are sensitive to model version, system prompt changes, and safety-policy updates. Version your baselines: whenever you update the model, change the system prompt, or apply a safety policy change, start a new baseline window rather than comparing against pre-change behavior. A drop in refusal rate that coincides with a known model update is expected; the same drop in the absence of any known change is the signal worth investigating.

**Output length anomalies.** Prompt injection attacks that successfully redirect model behavior often result in outputs that are atypically long (the model is now following the injected instruction, which may ask for an extensive response), atypically structured (the model is producing output in a format specified by the injected instruction), or simply very different from the length distribution of legitimate outputs for that request type.

Track output length as a distribution, not just a max. A request category that normally generates 50-200 token responses and suddenly produces 1,500 token responses warrants inspection.

**Sentiment and tone drift.** For deployments where the model should maintain a consistent tone (customer service, healthcare information, educational contexts), track the sentiment and tone of outputs over time. A model that has been manipulated into adopting an adversarial or inappropriate persona will often show a measurable shift in tone metrics — more aggressive, more definitive about topics it should hedge on, or exhibiting stylistic characteristics inconsistent with its system prompt.

**Output content classifiers.** A lightweight content classifier running asynchronously on model outputs can flag outputs containing PII patterns (credit card numbers, social security numbers, email addresses, API keys), hate speech, or other policy-violating content. This does not block the output — it is a monitoring layer, not a filter — but it creates a record for investigation and can trigger real-time alerts.

For PII detection specifically: if your deployment handles user data and your model should not be surfacing PII in its outputs, systematic output PII scanning detects data exfiltration attempts that succeeded in getting through the model. It is a detection signal, not a prevention mechanism.

**Intent-output divergence.** The most sophisticated output monitoring technique compares what the user's intent *appeared* to be (as classified from the input) against what the model actually produced (as classified from the output). A significant divergence — the user asked a product question but the model produced what looks like a code execution instruction — is a strong signal of successful indirect injection.

This requires two classifiers: one for input intent and one for output intent. The computational overhead is nontrivial but can be applied to a sample of traffic rather than every request.

## Tool and Function Call Monitoring

For agentic deployments where the model can invoke tools — web search, code execution, file access, external APIs — tool call monitoring is often the highest-signal layer because tool calls represent real-world actions with real consequences.

**Unusual call sequences.** Most legitimate use cases have characteristic tool call sequences. A research assistant might consistently call search, then read, then summarize. An unusual sequence — such as read followed by write followed by a network egress call — may indicate that the agent has been hijacked into executing a data exfiltration pipeline. Model the expected call graph for your deployment and alert on statistically unusual sequences.

**Privilege escalation attempts in tool parameters.** Inspect the parameters passed to tools, not just the tools themselves. An agent that should be reading from a user's document library but is passing system file paths as tool parameters, or an agent that should be querying a database but is passing SQL that includes schema introspection, is exhibiting behavior consistent with privilege escalation.

Parameter-level inspection requires structured parsing of tool call arguments. For JSON-structured tool calls this is tractable; for free-form string parameters it requires pattern matching or a classifier.

**Call rate anomalies.** A tool that is normally called once or twice per session being called hundreds of times per session is a significant anomaly signal. This pattern is consistent with brute-force attempts, systematic data extraction, or an agent that has been instructed to maximize some metric in ways that circumvent intended usage constraints.

**Exfiltration pathway detection.** For deployments with access to sensitive data, model the set of tool calls that would be necessary to exfiltrate that data. A sequence of calls that (1) retrieves sensitive records, (2) formats them as structured text, and (3) invokes an outbound communication tool should trigger an immediate alert regardless of whether any individual call looks anomalous in isolation. Composite rule matching across a session window is the appropriate detection mechanism here.

## Session-Level Behavioral Analysis

Individual requests often look innocuous; the attack pattern only emerges across a session or across sessions.

**Cross-request context accumulation.** An attacker executing a multi-turn injection campaign may use early turns to probe the model's behavior and later turns to execute the actual attack, having identified through the probing what instructions the model will follow. No individual turn looks suspicious; the aggregate session is an attack. Session-level monitoring that tracks the trajectory of a conversation — how inputs are evolving, how outputs are drifting — can catch this pattern.

**Cross-session clustering.** Coordinated attacks from multiple accounts, often using automated tooling, may appear as individual sessions that look slightly unusual but not alarming. Clustering sessions by behavioral similarity (embedding-distance of prompt sequences, tool call pattern similarity) can surface coordinated campaigns that no single session analysis would catch. This is computationally expensive and typically implemented on a delayed basis against log data rather than in real time.

**Session anomaly scoring.** A composite session anomaly score — weighting input embedding distance, refusal rate deviation, output length anomalies, and tool call sequence deviation — provides a single signal for triage. Sessions scoring above a threshold go into a review queue; sessions scoring very high trigger immediate alerts.

## Audit Logging for AI Systems

Audit logging for AI systems requires capturing events that standard application logging doesn't record, in a format that supports retroactive investigation of incidents.

**What to log.** At minimum, every LLM request should generate a log record containing:

- A stable session identifier (linking all turns of a conversation)
- A request timestamp and processing latency
- The model version and configuration hash (so that behavioral changes attributable to model updates are detectable)
- The system prompt hash (not the system prompt in plaintext if it contains sensitive configuration, but a hash that allows correlation)
- The prompt length (in tokens) and a hash of the prompt content
- The completion length and a hash of the completion content
- Whether the model issued a refusal, and the refusal category if available
- Any tool calls made, including the tool name, parameter hash, and response status
- A classification of the input intent (from a lightweight classifier)
- Any anomaly scores from the monitoring layer

Log the hashes, not the raw content, in the default log stream. Plain cryptographic hashes (SHA-256 of the raw text) are useful for correlation and deduplication, but they are not privacy-safe in isolation: low-entropy content such as short prompts or common completions can be reversed via dictionary or membership inference attacks. For privacy-sensitive deployments, use a keyed HMAC with a server-side secret. When using HMAC, include the key version identifier in the audit log record alongside the hash — this allows historical correlation to remain valid across key rotations, and avoids ambiguity when a log record from before a rotation must be matched against one from after. Alternatively, encrypt the raw content and store the ciphertext with a key reference rather than the hash. Raw prompt and completion content should be stored separately with appropriate access controls and a shorter retention window, indexed by request ID so that investigation can retrieve the full content when needed.

**Tamper-evident storage.** Audit logs are only useful as forensic evidence if they cannot be retroactively modified. For AI systems in regulated contexts, or any deployment where the logs may need to serve as evidence of what the system did, write logs to an append-only store with cryptographic integrity guarantees. Platform audit services such as AWS CloudTrail, Google Cloud Audit Logs, and Azure Monitor provide tamper-evident storage for *platform-level events* (API calls, IAM changes) — they do not automatically capture your application-level LLM audit records, and their default configurations do not always satisfy evidentiary append-only requirements without additional setup (for example, CloudTrail log file validation must be explicitly enabled; S3 bucket Object Lock policies must be explicitly applied). You must forward your AI audit events to a dedicated append-only store: a write-once object store (S3 with Object Lock, GCS with retention locks, Azure Immutable Blob Storage) or a WORM-capable log management service. Supplement with hash chaining over sequential log batches to detect any gaps or retroactive modifications. For distributed or async pipelines, define a stable ordering key before computing the chain — sequence numbers assigned at write time work; arrival order at the store does not, since retries and out-of-order delivery will produce false tamper alarms against a chain computed from arrival order.

**Retention policies.** Balance forensic utility against storage cost and privacy obligations. A reasonable baseline: high-level event records (hashes, metadata, anomaly scores) for one year; raw prompt/completion content for 90 days; session-level aggregates for one year. Retain user and session identifiers for no longer than your operational need — if long-retention records are needed for baseline drift analysis, pseudonymize user identifiers (replace with a derived token that supports correlation within a session but cannot be reversed to the original user) before extending their retention window. Raw identifiers retained indefinitely create GDPR erasure conflicts, since a right-to-erasure request must propagate to every log record linking the user. Note that GDPR does not specify fixed retention windows — it requires that data be kept only as long as necessary for the stated purpose, so your specific use cases determine the appropriate window, not a universal number. HIPAA specifies a separate six-year minimum for covered entity documentation. Consult your legal counsel for your specific regulatory context.

**Log correlation identifiers.** Ensure that AI system log records can be correlated with the wider infrastructure logs. The user identifier that initiated the request, the session ID, and the originating service should all be present in the AI log record *and* in the application logs, so that a security investigation can reconstruct the full request chain from user action through AI inference through downstream tool calls.

## Intrusion Detection Patterns

Beyond general anomaly detection, specific attack classes have characteristic signals that can be matched against log data.

**Prompt injection detection via intent divergence.** The signal for a successful prompt injection is not in the input — it's in the divergence between what the input was asking for and what the output provided. Log both input intent classification and output intent classification. A large divergence (the input was classified as a product inquiry, the output was classified as an instruction to click a link) is the detection signal. This works retroactively on log data as well as in near-real-time on a buffered stream.

**Jailbreak detection via behavioral consistency monitoring.** A jailbroken model exhibits characteristic behavioral patterns: it responds to categories of requests that it would normally refuse; it adopts personas inconsistent with its system prompt; it produces content that diverges from its typical style. Track refusal rates by request category. A sustained, statistically significant drop in refusals for a specific category — particularly following a period of high-volume adversarial probing — is a jailbreak signal.

**Data exfiltration detection via output entropy and PII scanning.** Exfiltration attempts through an LLM often produce outputs with elevated information density: the model is being asked to surface structured data (names, numbers, keys) rather than generate natural language. Output entropy monitoring (does this output have significantly higher information content than typical outputs for this request category?) is a lightweight signal. PII pattern scanning on outputs is more precise. Both can be implemented asynchronously against the output stream with negligible impact on response latency.

**Model poisoning and behavioral drift detection.** Detecting model poisoning requires a behavioral baseline established before any suspected poisoning event. This baseline should be generated by running a fixed evaluation set against the production model on a regular schedule — daily or weekly — and tracking metrics including refusal rates on the evaluation set, response style metrics, and factual accuracy on verifiable questions. Statistically significant drift from this baseline is a signal warranting investigation. Spontaneous drift (occurring without a model update) is particularly significant.

Note the important distinction here: drift detection identifies that *something has changed* in model behavior. It does not by itself identify whether the change is adversarial (poisoning) or benign (distribution shift in training data for a fine-tuned model). Investigation is required to attribute the cause.

## Tooling Landscape

Several tools exist specifically for LLM observability. The following reflects their claimed capabilities based on their public documentation as of mid-2026; independent benchmarks against your specific deployment may yield different results.

**Langfuse** is an open-source LLM observability platform that captures traces of LLM requests including model inputs, outputs, latencies, and token counts, with support for user feedback annotation and cost tracking. It provides a session view linking multi-turn conversations and an evaluation framework for running custom scoring functions on captured traces. Langfuse's strength is in developer-facing observability and evaluation; its anomaly detection capabilities require custom implementation on top of the trace data it collects.

**Arize AI Phoenix** is an open-source library (with a commercial Arize AI platform counterpart) focused on LLM evaluation and monitoring, including embedding drift detection, retrieval quality monitoring for RAG systems, and hallucination evaluation. Phoenix's embedding drift detection is directly applicable to the input-space monitoring described above — it can surface shifts in the embedding distribution of incoming prompts over time. The commercial Arize platform claims real-time monitoring capabilities with alerting; these have not been independently evaluated here.

**Weights & Biases Weave** (W&B's LLM monitoring product) provides tracing, evaluation, and dataset management capabilities, with particular depth in evaluation pipelines for teams that already use W&B for ML experiment tracking. Weave captures full traces of LLM call chains, supports custom evaluation scorers, and integrates with W&B's broader monitoring infrastructure. Its security-specific monitoring capabilities are limited relative to its general evaluation capabilities.

**LangSmith** (by LangChain) is a debugging, testing, and monitoring platform for LLM applications built on LangChain or LangGraph. It provides full trace capture, dataset management, and evaluation frameworks. LangSmith's monitoring capabilities are primarily developer-facing; production anomaly detection requires building on top of its trace data and alerting infrastructure.

**PromptLayer** provides a proxy layer for LLM API calls that logs all requests and responses, with support for prompt versioning and analysis. Its approach — positioning as a transparent proxy — means it captures the full input/output stream without instrumentation in application code, which simplifies adoption. Its monitoring capabilities are weighted toward prompt management and cost analysis rather than security-specific anomaly detection.

The common pattern across these tools: they are strong at *collection* (capturing the raw data needed for monitoring) and variable at *analysis* (the security-specific signal extraction that is the subject of this post). For a production security monitoring stack, expect to build custom anomaly detection logic on top of whatever observability tool you adopt for collection.

A gap all of these tools share: none provides off-the-shelf composite session anomaly scoring with cross-session clustering. That capability requires custom implementation against the trace data these tools collect.

## Alerting Thresholds and SLOs

Setting meaningful alerting thresholds for AI systems is difficult because LLM output variability is high and context-dependent. Alert fatigue is a real operational risk: a monitoring system that generates too many false positives trains operators to ignore alerts, including the real ones.

**Establish a characterization period before alerting.** Before setting any anomaly thresholds, run the monitoring infrastructure in observation mode for a minimum of two weeks of normal production traffic. Collect the distribution of every metric you plan to alert on — prompt length, output length, refusal rates, tool call sequences, input embedding distances. The thresholds you set should be derived from this distribution, not from theoretical assumptions about what "normal" looks like.

**Use percentile-based thresholds, not fixed values.** A fixed threshold (alert if prompt length > 5,000 tokens) ignores the natural variation in your traffic. A percentile-based threshold (alert if prompt length exceeds the 99.9th percentile of baseline) adapts to your actual distribution. Review and update thresholds monthly, or whenever a significant change in traffic pattern is expected.

**Tier your alerts.** Not every anomaly requires immediate human response. A practical tiering:

- *Tier 1 (immediate): Multi-signal composite anomaly* — three or more anomaly signals firing simultaneously on the same session, or a single high-confidence classifier detecting a known attack pattern. These warrant immediate investigation.
- *Tier 2 (investigate within 1 hour): Sustained metric drift* — refusal rates dropping below a sustained threshold for 30+ minutes, output entropy elevated above baseline for 30+ minutes. These indicate a possible ongoing attack but require time-series context to assess.
- *Tier 3 (daily review): Single metric anomaly* — a single metric flagging without corroborating signals. These go into a daily review queue, not an immediate interrupt.

**Define SLOs that account for LLM variability.** Standard SLOs (error rate < 0.1%, latency p99 < 500ms) are easy to define for deterministic services. For LLM systems, consider including:

- *Refusal rate SLO*: the refusal rate should remain within ±2 standard deviations of its 30-day baseline for any 1-hour window
- *Output quality SLO*: the fraction of outputs flagged by your content classifier should not exceed X% of requests in any 1-hour window
- *Tool call anomaly SLO*: the rate of tool call sequences scoring above your anomaly threshold should not exceed Y% of sessions per day

The specific values depend on your deployment context. The structure — defining the SLO in terms of statistical deviation from baseline rather than absolute values — is the generalizable principle.

## Cost vs. Coverage Trade-offs

Full prompt/response logging and real-time anomaly scoring for every request at scale is expensive, both computationally and in storage. The cost can be managed through structured sampling without sacrificing security posture significantly.

**Tiered logging.** Log metadata and hashes for 100% of requests. For raw prompt and completion content, use a buffer-and-selectively-persist strategy rather than pure upfront sampling: write all raw content to a short-lived buffer (for example, a rolling 30-minute window in hot storage), then flush to permanent storage only requests that were flagged by asynchronous analysis during that window, plus a random baseline sample of 10% of unflagged requests for coverage. This approach preserves the forensic content needed for any anomaly discovered during the async analysis window, while keeping permanent storage costs near the tiered-logging level. Pure upfront 10% sampling without a buffer window would discard raw content for anomalies discovered moments after their request completed.

Note the privacy trade-off: the buffer window transiently holds 100% of raw prompt and completion content, including any sensitive user data. This expands the potential breach scope during that window compared to never storing raw content, and this buffer store must inherit the same access controls, encryption at rest, and retention/erasure policies as your permanent audit store — not be treated as a lower-security temporary store. For deployments with strict data-minimization requirements or zero-retention commitments on prompt content, this approach requires explicit policy review — you may need to shorten the buffer window significantly, apply in-transit encryption, or accept that the forensic retrieval capability is limited to hash-only correlation.

**Asynchronous analysis.** Many of the analysis techniques described above — content classification, PII scanning, intent divergence scoring — do not need to run synchronously in the request path. Running them asynchronously against a stream of logged events introduces a delay in detection (minutes rather than real-time) but avoids adding latency to user-facing requests. For most threat models, a detection lag of a few minutes is acceptable; the attack is already in your logs and can be acted on promptly.

One trust boundary consideration: if you route log streams to third-party analysis services (external content classifiers, vendor-hosted PII scanners), those services become a second disclosure path for sensitive content. Asynchronous analysis pipelines that send raw prompts and completions to external APIs share the data with those vendors under their terms of service. Unless that data sharing is explicitly covered by your agreements and your user-facing data processing terms, keep analysis pipelines within the same trust boundary as your core inference infrastructure — either self-hosted analyzers or analyzers covered by a data processing agreement with the vendor.

**Sample-based baseline maintenance.** Behavioral baseline metrics (refusal rate distribution, output length distribution, input embedding distribution) can be computed on a stratified sample of traffic rather than the full stream. A statistically representative 5-10% sample is sufficient for baseline characterization when traffic volume is high. At low traffic volumes, compute baselines on all traffic.

**Prioritize high-value sessions.** Apply heavier monitoring to sessions that handle sensitive data, use high-privilege tools, or come from unauthenticated or low-trust contexts. The cost per session for comprehensive monitoring is justified when the consequences of a compromised session are significant.

## Building the Stack

A practical LLM security monitoring stack for a production deployment combines the layers described above:

1. **Collection layer**: An observability tool (Langfuse, Phoenix, or equivalent) capturing full traces including inputs, outputs, tool calls, and timing. This is the foundation.

2. **Feature extraction layer**: Asynchronous jobs running on the trace stream computing embedding distances from baseline, content classifications, PII scan results, and tool call sequence anomaly scores. These produce a feature vector per request.

3. **Anomaly scoring layer**: A composite anomaly scorer combining the feature vector into a session anomaly score. Initially this can be a weighted rule-based system; over time it can be replaced or augmented with a learned model trained on labeled incidents from your deployment.

4. **Alerting layer**: Threshold-based alerts derived from your baseline characterization period, tiered as described above, feeding into your existing incident management workflow.

5. **Audit store**: An append-only store receiving the full audit event per request — the structured record of what happened, anchored by hashes and signed for tamper-evidence.

This is not a product you can install and configure in an afternoon. It is an operational capability that takes weeks to establish and requires ongoing tuning as your traffic pattern evolves. But so does any serious security monitoring capability — the LLM-specific layers are new; the operational discipline of running a detection and response program is not.

The gap between guardrails and incident response is real, and attacks that exploit it are increasingly well-documented in the literature on indirect prompt injection and multi-turn jailbreaking. Continuous monitoring is the layer that closes it.
