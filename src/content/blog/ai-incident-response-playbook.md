---
title: "AI Incident Response: A Practitioner's Playbook for When Your AI System Is Compromised"
description: "Detection signals, containment options, evidence preservation, and recovery procedures for AI-specific security incidents — the operational complement to attack coverage. NIST IR lifecycle applied to prompt injection, model backdoors, data poisoning, and adversarial input attacks."
pubDate: 2026-07-07
tags: ["incident-response", "prompt-injection", "model-security", "mlops", "defense", "playbook"]
---

At 2:47 AM, a production alert fires. Your RAG-based customer support assistant is generating responses that include what looks like internal system prompt content — fragments of infrastructure documentation the model should never surface to end users. The on-call engineer pages the ML team. Nobody has a runbook for this.

This scenario — an *illustrative composite of documented attack patterns* — is becoming more common as AI systems move from experimental to business-critical. What's rare is any organization being prepared to respond.

Traditional security incident response is a mature discipline. NIST SP 800-61r2 defined a lifecycle (Prepare → Detect → Contain → Eradicate → Recover → Post-Incident) that most security teams have adapted; the 2024 revision (SP 800-61r3) restructures guidance around the Cybersecurity Framework's Govern/Identify/Protect/Detect/Respond/Recover functions. What neither revision addresses in detail is the specific character of AI system compromises: ephemeral attack surfaces, probabilistic reproduction, model artifacts as evidence, and recovery procedures that involve deploying different inference objects rather than patching software.

This post is the operational playbook. It follows the classic IR phase structure while extending it for AI-specific threats.

## Why AI Incidents Are Different

Before the phases: four structural differences that make AI incidents harder than conventional software incidents.

**Evidence is ephemeral by default.** A SQL injection attack leaves traces in web server logs, database query logs, and potentially WAF alerts. A prompt injection attack against an LLM leaves traces only if you specifically instrumented prompt logging. Most deployments don't log full input/output pairs by default — privacy concerns, cost, and latency all push against it. When the incident happens, the attack surface may not have been logged at all.

**Attacks may not reproduce.** A buffer overflow either triggers or it doesn't. Prompt injection attacks depend on model behavior that's probabilistic. The attack that succeeded at 2:47 AM may fail 60% of the time when you try to reproduce it in a test environment. Traditional IR assumes you can study the attack mechanism by replicating it. AI incidents often don't give you that luxury.

**The "binary" is hard to diff.** Software incidents ultimately come down to understanding which code is running. You can diff binaries, audit git history, inspect running processes. A model artifact is an opaque parameter matrix. "What changed between the clean version and the compromised version" is an open research problem for neural networks, not a solved operational procedure.

**Recovery means replacing inference objects.** Software recovery usually means patching the vulnerability and restarting. AI recovery means deploying a different model — which requires knowing which checkpoint is clean, having a deployment pipeline that supports checkpoint selection, and being able to validate the replacement before traffic is restored. Most ML pipelines aren't designed for this.

## Prepare: What to Instrument Before an Incident

The organizations that respond well to AI incidents are the ones that treated incident response as a logging design constraint, not an afterthought. Every decision about what to log is made harder once an incident is in progress.

### Logging Minimum Viable Evidence

Every production AI system should capture:

**Full input/output pairs.** Not just user-visible query and response — the full context window presented to the model, including system prompts, retrieved context in RAG systems, and tool call results. This is the minimum needed to understand what the model saw and responded to. **Implement with access controls and retention limits:** a full-context log is a high-value store that may contain PII, credentials, and tenant data. Redact sensitive fields, apply role-based access, and define a retention period consistent with your privacy obligations before enabling this at scale.

**System prompt versions.** Your system prompt is part of the attack surface. Log the exact system prompt hash (e.g., SHA-256 of the prompt string) for every inference call, and maintain a versioned history of prompt changes with timestamps.

**Model version hashes.** The model artifact SHA or checkpoint identifier for every inference call. When you're trying to determine whether a checkpoint was tampered with, you need to know which checkpoint was running when.

**Tool call traces.** For agentic systems, log every tool invocation: the tool name, input parameters, and output. Where chain-of-thought reasoning is available and your provider exposes it, you may log a summary of the reasoning that triggered the call — but be cautious: raw CoT can contain sensitive intermediate content or prompt-injection payloads, and many providers do not expose it at all. At minimum, the tool name and parameters are essential for distinguishing legitimate from attack-driven invocations.

**Timing and latency data.** Anomalous latency patterns can indicate certain attack classes (e.g., repeated probing for model extraction). Timestamp every inference call with millisecond resolution.

**Confidence and logit distributions.** If your inference infrastructure supports it, log token-level confidence scores or softmax distributions. Behavioral shifts in confidence are one of the detectable signals for backdoor activation.

### Model Versioning for Rollback

Recovery from poisoned models requires being able to deploy a clean checkpoint. That means:

- Every checkpoint used in production should be hashed and stored in a model registry (MLflow, Weights & Biases, or a purpose-built model store)
- Deployment pipelines should support atomic checkpoint switching with rollback capability
- The "clean" baseline checkpoint should be identified and protected before deployment — not discovered during an incident

Tools: [MLflow Model Registry](https://mlflow.org/docs/latest/model-registry.html), [Weights & Biases Artifacts](https://docs.wandb.ai/guides/artifacts), [Arize Phoenix](https://phoenix.arize.com/) for observability.

### Alert Thresholds for Behavioral Anomalies

Configure alerts on:
- Content policy trigger rate (sudden spike above baseline)
- Response length distribution (data exfiltration often produces unusually verbose responses)
- Tool call frequency and diversity
- Query volume with low semantic diversity (potential model extraction)
- System prompt content appearing in output (exact-match detection)

## Detect: Behavioral Signals by Attack Class

The following table maps attack types to detection signals. Signal confidence is rated Low/Medium/High based on false-positive/false-negative rates in practice — not theoretical detectability.

| Attack Type | Detection Signal | Confidence | Notes |
|-------------|-----------------|------------|-------|
| Prompt injection | Unexpected tool invocations | High | Compare against expected tool call distribution for query type |
| Prompt injection | System prompt content in output | High | Exact-match detection is reliable; paraphrase detection is harder |
| Prompt injection | Context length spikes | Medium | Injection payloads often substantially expand input tokens |
| Prompt injection | Content policy trigger spike | Medium | High false-positive rate — useful only as a correlation signal |
| Backdoor activation | Sudden behavioral shift on specific trigger pattern | High | Requires behavioral monitoring against a known-clean baseline |
| Backdoor activation | Confidence distribution anomaly | Medium | Requires token-level logging; not standard in most deployments |
| Data exfiltration | Unexpected outbound calls (agentic systems) | High | Network monitoring + tool call audit log |
| Data exfiltration | PII patterns in response output | High | Standard DLP regex patterns apply; combine with content policy |
| Data exfiltration | Unusual output verbosity | Low | Noisy; useful only as corroboration |
| Model extraction | High query volume + low semantic diversity | High | Query deduplication analysis; rate limiting by semantic hash |
| Model extraction | Systematic parameter space probing | Medium | Pattern analysis across query sequences; requires session correlation |
| Adversarial input | Accuracy drop on monitored distribution | High | Requires a holdout distribution that's continuously evaluated |
| Supply chain / poisoned training | Behavioral shift post fine-tune on user data | Medium | A/B testing before rollout; RLAIF reward hacking detection |

### Correlated Signal Investigation

Single signals rarely provide certainty. Prompt injection incidents often show correlated signals: context length spikes *and* unexpected tool calls *and* partial system prompt in output — three coincident signals make the diagnosis high-confidence.

When an alert fires, the first step is correlation: pull the last N minutes of all signal types for the affected model endpoint and look for clustering. Isolated signals are noise. Clustered signals are incidents.

## Contain: Options from Least to Most Disruptive

Containment is often where AI IR diverges most sharply from conventional playbooks. The goal is to limit ongoing damage while preserving the capability to continue serving users. Options range from lightweight filtering to full traffic suspension.

**Option 1: Output filtering (least disruptive).** Deploy or tighten a content policy layer that blocks responses containing known-bad patterns (e.g., system prompt fragments, PII formats, unusual verbosity). This doesn't stop the attack but limits its output surface. Risk: sophisticated attacks may evade pattern-based filtering.

**Option 2: Rate limiting by query pattern.** If the attack pattern is identifiable in inputs (e.g., systematic model extraction queries), rate-limit or block by semantic similarity. This is appropriate for extraction attacks where the attack is in the query, not the model behavior.

**Option 3: Route to shadow / backup model.** Most production ML stacks can be configured to split traffic. Route suspicious sessions (or all traffic) to a known-clean model checkpoint while investigating the primary. This preserves service availability while removing the potentially-compromised model from the critical path.

**Option 4: Disable tool access.** For agentic systems where the immediate risk is tool misuse (data exfiltration, unauthorized actions), disable tool invocation capabilities system-wide. This significantly degrades the system's usefulness but stops the most dangerous classes of prompt injection damage.

**Option 5: Reduce to smaller / safer model.** Drop to a smaller, more constrained model (e.g., from a fine-tuned large model to a smaller base model with stronger safety tuning). The smaller model may have lower capability but also a reduced attack surface. This is appropriate when the vulnerability appears to be in fine-tuning or RLHF applied to the larger model.

**Option 6: Human-in-the-loop escalation gates.** For high-stakes actions (financial transactions, data access, external communications), add a mandatory human review step before execution. This is maximally conservative and doesn't scale, but is appropriate for the highest-risk window.

**Option 7: Full traffic suspension (most disruptive).** If none of the above contains the damage and the system is actively exfiltrating data or performing unauthorized actions, take it offline. Have a fallback user experience ready (e.g., a static FAQ page, redirect to human support). The cost of taking a system offline is almost always lower than the cost of continued compromise.

## Eradicate and Recover: Model Rollback in Practice

"Rollback" for AI systems means deploying a different model artifact. This is conceptually similar to rolling back a software deployment, but operationally different in several ways.

### What Rollback Means for Different Compromise Types

**Prompt injection compromise:** The model itself is not compromised — the attack succeeded through the input interface. Rollback means: (1) patch the system prompt or retrieval pipeline to close the injection vector, (2) review tool permissions and restrict as needed, (3) audit output logs for data already exfiltrated. For agentic systems, also revoke any credentials or sessions the model may have used during the compromise window, and perform integrity checks on any downstream systems the model could have written to or modified.

**Backdoor in fine-tuned model:** The model artifact is compromised at training time. Rollback means deploying a checkpoint from before the backdoor was introduced. If you don't know which checkpoint is clean, you must return to the pre-fine-tune base model and retrain from a trusted data source.

**Data poisoning in training set:** The model artifact may be compromised in subtle ways that a checkpoint rollback doesn't address (the poison may have been present in previous fine-tuning runs). Eradication requires: (1) identify and remove poisoned training examples, (2) retrain from a clean checkpoint with clean data, (3) validate the retrained model before redeploy.

**Model extraction (your model has been copied):** The model artifact is not modified; the damage is in the exfiltrated copy. There is no rollback in the traditional sense. Eradication options include: architectural changes to make future extraction harder (e.g., output truncation, stochastic response formatting), monitoring for unauthorized model distribution, and legal action.

### Validating a Clean Model Before Redeploy

Before returning a model to production, validate:

1. **Behavioral baseline comparison:** Run the candidate deployment checkpoint against a holdout evaluation set and compare results to the known-clean baseline. Significant divergence warrants investigation.

2. **Backdoor probe testing:** Use [Garak](https://github.com/NVIDIA/garak) or equivalent adversarial testing tools to probe the checkpoint for known backdoor trigger patterns. Garak provides a structured framework for systematic LLM vulnerability scanning, including backdoor and jailbreak categories.

3. **System prompt exfiltration probes:** Attempt common system prompt extraction attacks against the clean checkpoint in a sandboxed environment. If these succeed, the system prompt design is part of the vulnerability surface — address before redeployment.

4. **Tool misuse scenarios:** For agentic systems, run through a library of prompt injection + tool misuse scenarios against the clean checkpoint to verify that the vulnerability was in model behavior, not just the input pipeline.

### Redeploy Checklist

- [ ] Clean checkpoint identified and hash verified against model registry
- [ ] Behavioral baseline comparison passed
- [ ] Garak (or equivalent) adversarial probe completed with no critical findings
- [ ] System prompt reviewed and hardened
- [ ] Tool permissions scoped to minimum necessary
- [ ] Logging configuration verified (all required fields captured)
- [ ] Alert thresholds set and validated
- [ ] Shadow deployment run with sample traffic before full cutover
- [ ] Rollback plan ready if issues emerge post-redeploy

## Post-Incident: Disclosure and Retrospective

### When to Notify Users

User notification thresholds vary by jurisdiction and incident type. General guidelines:

- **Data exfiltration:** If user PII was exposed in model outputs, apply breach notification obligations — these vary by jurisdiction. Under GDPR Art. 33, supervisory authority notification is required within 72 hours; user notification (Art. 34) is required "without undue delay" when there is a high risk to rights and freedoms. US state breach notification laws vary but typically do not map to a uniform 72-hour window. Consult counsel for your specific jurisdictions.
- **Behavioral manipulation:** If users received responses that were materially different from what the model should have produced (e.g., malicious instructions disguised as legitimate advice), disclose to affected users.
- **Service disruption from containment:** If containment measures degraded service, notify users with an explanation of what happened and when normal service is expected to resume.

### Platform and Ecosystem Notifications

If you operate on a platform (API provider, marketplace, enterprise software ecosystem), check your platform agreement for breach notification obligations. Most platform providers have their own incident reporting requirements.

For AI-specific incidents, consider submitting to the [MITRE ATLAS case study library](https://atlas.mitre.org/) once the incident is resolved and disclosure is appropriate. ATLAS is a knowledge base of adversarial AI attack patterns and documented cases — submitting a case study contributes to the field's collective understanding of real-world AI attacks. The MITRE ATLAS website provides a structured case study submission process.

The coordinated vulnerability disclosure framework covered in related posts provides detailed guidance if the incident involves a vulnerability that has broader ecosystem impact.

### Retrospective: Questions to Answer

A post-incident retrospective should answer:

1. **Timeline:** When did the attack begin? When was it detected? What was the detection-to-containment gap?
2. **Detection gap:** What signals existed that could have triggered earlier detection? Why didn't they? What monitoring gaps does this reveal?
3. **Logging gaps:** What evidence was unavailable because it wasn't logged? What would have accelerated investigation if it had been captured?
4. **Containment efficacy:** Which containment steps worked? Which were applied too late or were inadequate?
5. **Vulnerability root cause:** Was this a prompt injection via input validation failure? A supply chain compromise at training time? A tool permission design flaw? Root cause drives the fix.
6. **Persistence verification:** After rollback, how do you know the vulnerability is gone? What tests prove it?

## Appendix: AI Incident Log Template

The following template captures the minimum evidence set for an AI incident investigation. Adapt as needed for your environment.

```
AI INCIDENT LOG
===============
Incident ID: [INC-YYYY-NNN]
Severity: [Critical / High / Medium / Low]
Status: [Detecting / Containing / Eradicating / Recovering / Closed]

AFFECTED SYSTEM
  Model name/version: 
  Model checkpoint hash: 
  Inference endpoint: 
  System prompt version (hash): 

TIMELINE
  First anomalous signal detected: 
  Alert triggered: 
  Incident declared: 
  Containment initiated: 
  Containment completed: 
  Service restored: 
  Incident closed: 

ATTACK CLASS (check all that apply)
  [ ] Prompt injection
  [ ] Backdoor activation
  [ ] Data exfiltration
  [ ] Model extraction
  [ ] Adversarial input
  [ ] Supply chain / training data poisoning
  [ ] Other: ________________

EVIDENCE CAPTURED
  Full input/output pairs (date range): 
  Tool call traces: [ ] Yes / [ ] No
  Model version at time of incident: 
  System prompt at time of incident: 
  Content policy trigger logs: 

DETECTION SIGNALS OBSERVED
  1.
  2.
  3.

CONTAINMENT STEPS TAKEN (in order)
  1.
  2.
  3.

ERADICATION AND RECOVERY
  Rollback checkpoint: 
  Rollback checkpoint hash: 
  Behavioral validation completed: [ ] Yes / [ ] No
  Adversarial probe (Garak) completed: [ ] Yes / [ ] No
  Redeploy timestamp: 

IMPACT ASSESSMENT
  Users potentially affected: 
  Data classes potentially exposed: 
  Service downtime: 
  Estimated business impact: 

DISCLOSURE
  User notification required: [ ] Yes / [ ] No / [ ] Undetermined
  User notification sent: 
  Platform notification sent: 
  ATLAS case study filed: [ ] Yes / [ ] No / [ ] Pending

ROOT CAUSE
  (One paragraph: what made the attack possible, what allowed it to succeed)

REMEDIATION ACTIONS
  1.
  2.
  3.

RETROSPECTIVE DATE: 
```

---

## Tooling Reference

| Category | Tool | Notes |
|----------|------|-------|
| LLM observability | [Langfuse](https://langfuse.com/) | Open-source; input/output logging, trace visualization |
| LLM observability | [Arize Phoenix](https://phoenix.arize.com/) | Open-source; production LLM monitoring |
| LLM observability | [WhyLabs](https://whylabs.ai/) | Enterprise ML monitoring; drift and anomaly detection |
| Adversarial testing | [Garak](https://github.com/NVIDIA/garak) (NVIDIA) | LLM vulnerability scanner; backdoor, jailbreak, extraction probes |
| Model versioning | [MLflow Model Registry](https://mlflow.org/) | Checkpoint storage, versioning, deployment tracking |
| Model versioning | [Weights & Biases Artifacts](https://wandb.ai/) | Experiment tracking + artifact versioning |
| Attack taxonomy | [MITRE ATLAS](https://atlas.mitre.org/) | AI threat modeling framework; incident case library |

---

*NIST references: [NIST SP 800-61r2](https://csrc.nist.gov/publications/detail/sp/800-61/rev-2/final) (Computer Security Incident Handling Guide); [NIST SP 800-61r3](https://csrc.nist.gov/pubs/sp/800/61/r3/final) (Incident Response Recommendations and Considerations for Cybersecurity Risk Management, 2024); [NIST AI RMF 1.0](https://doi.org/10.6028/NIST.AI.100-1) (AI Risk Management Framework — Govern, Map, Measure, Manage functions, 2023). Garak: [github.com/NVIDIA/garak](https://github.com/NVIDIA/garak). MITRE ATLAS: [atlas.mitre.org](https://atlas.mitre.org/).*
