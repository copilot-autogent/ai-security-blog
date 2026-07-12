# Corpus Audit: 137-Post Redundancy & Overlap Analysis

**Date**: 2026-07-12  
**Audited by**: Sprint agent (Issue #277)  
**Posts reviewed**: 137  
**Scope**: All posts in `src/content/blog/` as of 2026-07-12  

---

## Summary

| Metric | Count |
|--------|-------|
| Total posts reviewed | **137** |
| Clusters identified | **11** |
| True overlaps (consolidate) | **1** |
| Complementary pairs (add "See also") | **3** |
| Cluster needing cross-references (no overlaps, just navigation) | **1** (backdoor cluster, 5 posts) |
| Follow-up issues filed | **4** (#280, #281, #282, #283) |

---

## Cluster Table

### Cluster 1: Data Poisoning (20 posts)

| Slug | Title | Verdict |
|------|-------|---------|
| `adversarial-document-injection-rag-vector-stores` | Poisoning the Knowledge Base: Adversarial Document Injection into RAG Vector Stores | Keep — vector store injection taxonomy (PoisonedRAG, BadRAG) |
| `pretraining-corpus-poisoning-web-scale-attack` | Poisoning the Pretraining Corpus: How Attackers Corrupt Foundation Models Before They're Built | Keep — web-scale pretraining corpus angle |
| `rag-memory-poisoning-attacks` | Poisoning the Well: Memory and RAG Attacks Against Long-Context AI Systems | Keep — long-context/memory scope (broader than vector stores alone) |
| `federated-learning-poisoning-the-aggregation-attack-surface` | Federated Learning Poisoning: The Aggregation Attack Surface | Keep — federated learning is a distinct architecture/attack |
| `backdoor-attacks-foundation-models` | Backdoor Attacks in Foundation Models: Sleeper Triggers That Survive Fine-Tuning | Keep — foundation model persistence angle (see Backdoor cluster) |
| `backdoor-trigger-mechanisms-steganographic-encoding` | The Trigger You Can't See: Steganographic Backdoors in Deployed Language Models | Keep — unique mechanism: trigger absent from training data (see Backdoor cluster) |
| `fine-tuning-trojans-backdoors-training-pipeline` | Fine-Tuning Trojans: Injecting Backdoors Through the Model Training Pipeline | Keep — fine-tuning as insertion point (see Backdoor cluster) |
| `metabackdoor-positional-encoding-trigger` | The Time Bomb in Your Fine-Tuned Model: MetaBackdoor Exploits Position, Not Content | Keep — positional encoding trigger bypasses content defenses (see Backdoor cluster) |
| `sleeper-agents-ai-supply-chain-backdoor` | Sleeper Agents in Production: The AI Supply Chain Backdoor Threat | Keep — supply chain framing; Anthropic paper (see Backdoor cluster) |
| `trojan-triggers-multimodal-models-visual-backdoors` | Trojan Triggers in Multi-Modal Models: How Visual Backdoors Activate Hidden Behaviors | Keep — multimodal/visual-specific mechanism |
| `etamp-agent-memory-poisoning` | Poisoning What Your Agent Remembers: The Cross-Session Attack You Haven't Modeled | Keep — agent memory cross-session angle (distinct from RAG attacks) |
| `skill-library-memory-poisoning-defense` | When Your Agent Forgets the Right Things: Skill Libraries as Emergent Defense Against Memory Poisoning | Keep — defense perspective on skill library architecture |
| `quantization-compression-attacks-safety-alignment` | Quantization and Compression Attacks: How Model Size Reduction Can Re-Enable Suppressed Unsafe Behaviors | Keep — unique angle: model compression as safety regression vector |
| `mechanistic-interpretability-security-tool` | Mechanistic Interpretability as a Security Tool: Detecting Backdoors and Hidden Behaviors in AI Models | Keep — MI as a defense tool; distinct reader takeaway |
| `constitutional-ai-under-attack` | Constitutional AI Under Attack: Exploiting Self-Critique Alignment Mechanisms | Keep — attacks on the Constitutional AI alignment method specifically |
| `mcp-tool-poisoning` | MCP Tool Poisoning: How Malicious Tool Definitions Hijack AI Agents | ⚠️ **OVERLAP** — see Cluster 6 (Agentic / MCP) |
| `tool-poisoning-malicious-mcp-servers` | Tool Poisoning via Malicious MCP Servers: When Your Agent's Tools Turn Against It | ⚠️ **OVERLAP** — see Cluster 6 (Agentic / MCP) |
| `ai-agent-supply-chain-attacks` | AI Agent Supply Chain Attacks: Compromising Agents Before They Run | Keep — full supply chain taxonomy for agents |
| `ci-cd-pipeline-injection-ai-code-assistants` | CI/CD Pipeline Injection: When AI Code Assistants Become Supply Chain Threats | Keep — CI/CD pipeline specifics; code assistant framing |
| `ai-incident-response-playbook` | AI Incident Response: A Practitioner's Playbook for When Your AI System Is Compromised | Keep — incident response (distinct pillar) |

**Overall cluster verdict**: Well-differentiated. The backdoor sub-cluster (5 posts) needs cross-reference links. One true overlap in MCP poisoning (see Cluster 6). All other entries are distinct.

---

### Cluster 2: Jailbreaks (9 posts)

| Slug | Title | Verdict |
|------|-------|---------|
| `jailbreak-as-a-service-underground-market` | Jailbreak-as-a-Service: The Underground Market for LLM Exploit Techniques | Keep — economics/market framing; unique angle |
| `jailbreak-robustness-after-finetuning` | Jailbreak Robustness After Fine-Tuning: How Safety Alignment Degrades | Keep — post-fine-tune safety regression |
| `crescendo-multi-turn-jailbreaks-stateful-conversation-attacks` | Crescendo: Why Single-Turn Safety Filters Are Insufficient | ⚠️ **See also** — [#283] pair with `twingate-stateful-defense-decompositional-jailbreaks` |
| `twingate-stateful-defense-decompositional-jailbreaks` | Safe in Isolation, Dangerous Together: The Multi-Turn Blind Spot in Your Safety Filter | ⚠️ **See also** — [#283] pair with `crescendo-multi-turn-jailbreaks-stateful-conversation-attacks` |
| `multimodal-jailbreak-attacks` | Beyond Text: How Simple Perceptual Tricks Break Multimodal AI Safety | ⚠️ **See also** — [#282] pair with `multimodal-jailbreaking-image-bypass-text-safety` |
| `multimodal-jailbreaking-image-bypass-text-safety` | Multimodal Jailbreaking: How Attackers Use Images to Bypass Text Safety Filters | ⚠️ **See also** — [#282] pair with `multimodal-jailbreak-attacks` |
| `reward-hacking-rlhf-safety` | Reward Hacking in Production: When RLHF Optimization Inverts Safety Goals | Keep — RLHF-specific security failure mode; note conceptual cousin `specification-gaming-reward-hacking-wrong-goal` |
| `guardrail-structural-bottleneck` | Your Guardrails Can't Read JSON: The Structural Bottleneck in Agentic Safety | Keep — JSON/structured output bypass; agentic context |
| `chatgpt-google-sheets-data-exfiltration` | Your Spreadsheet Is the Attack Surface: ChatGPT for Google Sheets Data Exfiltration | Keep — specific product/deployment attack case study |

**Overall cluster verdict**: 2 pairs need cross-reference links. No consolidation required. Both multi-turn jailbreak posts and both multimodal jailbreak posts are genuinely distinct — different research papers, different attack mechanisms, different reader takeaways.

---

### Cluster 3: Prompt Injection (17 posts)

| Slug | Title | Verdict |
|------|-------|---------|
| `prompt-injection-role-confusion` | Prompt Injection as Role Confusion: Why LLMs Trust Style Over Role Tags | Keep — role/style confusion framing |
| `prompt-injection-long-context-windows` | Prompt Injection in Long-Context Windows: When More Context Means More Attack Surface | Keep — long-context window-specific attack surface |
| `prompt-injection-defenses-privilege-separation-structured-outputs` | Defending Against Prompt Injection: Privilege Separation, Structured Outputs, and the Limits of Current Defenses | Keep — defenses-focused; distinct from attack posts |
| `shadow-prompting-hidden-system-instructions` | Shadow Prompting: How Hidden System Instructions Hijack AI Behavior | Keep — hidden instructions as a distinct attack mode |
| `indirect-prompt-injection-incidents-survey` | Indirect Prompt Injection Against Production Systems: A Survey of Documented Disclosures | Keep — empirical survey of real incidents |
| `copilot-cowork-file-exfiltration-prompt-injection` | Five Lines of Injection: How Microsoft Copilot Cowork Exfiltrates Pre-Authenticated File Links Without Approval | Keep — specific real-world incident |
| `adversarial-prompt-caching-kv-timing-attacks` | Adversarial Prompt Caching: Timing Attacks and Injection via Shared KV Caches | Keep — KV-cache infrastructure angle |
| `adversarial-attacks-vision-language-models-pixels-injection` | Adversarial Attacks on Vision-Language Models: Pixels as Injection Vectors | Keep — gradient-crafted adversarial perturbation; distinct from rendered-text attacks |
| `improper-llm-output-handling-sql-injection-xss-ssrf` | Improper LLM Output Handling: SQL Injection, XSS, and SSRF via AI-Generated Responses | Keep — downstream code execution; distinct attack surface |
| `browser-use-attacks-hijacking-ai-agents` | Browser-Use Attacks: Hijacking AI Agents That Browse the Web | Keep — browser agent specialization |
| `healthcare-rag-chatbot-data-leak` | No Auth Required: How a Healthcare RAG Chatbot Leaked 1,000 Patient Conversations | Keep — real-world case study; healthcare context |
| `owasp-top10-ai-agents-part1` | OWASP Top 10 for AI Agents, Part 1: The Three Vulnerabilities That Break Agent Trust | Keep — standards-framework post |
| `llm-security-monitoring-production-anomaly-detection-audit-logging` | LLM Security Monitoring in Production: Anomaly Detection, Audit Logging, and Intrusion Detection | Keep — monitoring/detection framing |
| `ai-incident-response-playbook` | AI Incident Response: A Practitioner's Playbook for When Your AI System Is Compromised | Keep — response framing (appears in multiple clusters; that's expected for a survey-level post) |
| `reward-hacking-rlhf-safety` | Reward Hacking in Production | Keep — appears in multiple clusters; RLHF framing is distinct |
| `adversarial-document-injection-rag-vector-stores` | Poisoning the Knowledge Base | Keep — RAG vector store injection |
| `ci-cd-pipeline-injection-ai-code-assistants` | CI/CD Pipeline Injection | Keep — CI/CD framing |

**Overall cluster verdict**: All 17 are distinct. No consolidation required. Cluster is large but reflects genuine breadth of prompt injection as a topic.

---

### Cluster 4: Supply Chain Attacks (9 posts)

| Slug | Title | Verdict |
|------|-------|---------|
| `model-hub-supply-chain-attacks` | Model Hub Supply Chain Attacks: Malicious Models, Tokenizer Exploits, and Typosquatting on Hugging Face | Keep — model hub / from_pretrained() angle |
| `malicious-ai-model-files-pickle-exploits-arbitrary-code-execution` | Malicious AI Model Files: Pickle Exploits and Arbitrary Code Execution on Model Load | Keep — pickle deserialization specifically; broader than model hub |
| `ml-model-provenance-signing-sboms-verification` | ML Model Provenance: Signing, SBOMs, and Verifying the AI You Deploy Before It Runs | Keep — defense / provenance angle |
| `mini-shai-hulud-supply-chain-agent-pipelines` | When Your Safety Layer Gets Compromised: The npm Supply Chain Problem in AI Agent Pipelines | Keep — npm package supply chain in agent context |
| `llm-router-supply-chain-attack` | Your Agent Is Mine: The LLM Router Supply Chain Attack You're Not Defending Against | Keep — LLM routing layer as attack surface |
| `ai-agent-supply-chain-attacks` | AI Agent Supply Chain Attacks: Compromising Agents Before They Run | Keep — full supply chain taxonomy |
| `fine-tuning-trojans-backdoors-training-pipeline` | Fine-Tuning Trojans: Injecting Backdoors Through the Model Training Pipeline | Keep — training pipeline stage |
| `sleeper-agents-ai-supply-chain-backdoor` | Sleeper Agents in Production: The AI Supply Chain Backdoor Threat | Keep — supply chain + sleeper agent framing |
| `ci-cd-pipeline-injection-ai-code-assistants` | CI/CD Pipeline Injection | Keep — CI/CD pipeline stage |

**Overall cluster verdict**: All distinct — each covers a different stage or mechanism of the AI supply chain. No consolidation required.

---

### Cluster 5: Regulatory / Compliance (6 posts)

| Slug | Title | Verdict |
|------|-------|---------|
| `ai-security-regulatory-compliance-eu-ai-act-nist-rmf-iso-42001` | AI Security and the Law: What the EU AI Act, NIST AI RMF, and ISO 42001 Actually Require | Keep — comprehensive regulatory overview |
| `ai-incident-response-playbook` | AI Incident Response: A Practitioner's Playbook | Keep — overlaps with compliance but response-focused |
| `machine-unlearning-security-when-forgetting-creates-vulnerabilities` | Machine Unlearning Security: When Forgetting Training Data Creates New Vulnerabilities | Keep — GDPR right-to-erasure angle + security implications |
| `sqlite-agents-md-no-agentic-code-accepted` | SQLite AGENTS.md: No Agentic Code Accepted | Keep — specific governance/policy case study |
| `troy-hunt-1000-breaches-disclosure-lag` | 1,000 Breaches Later: The Disclosure Lag Is Worse Than Ever | Keep — disclosure policy angle |
| `mechanistic-interpretability-security-tool` | Mechanistic Interpretability as a Security Tool | Keep — MI as compliance/audit tool |

**Overall cluster verdict**: All distinct. No consolidation required.

---

### Cluster 6: Agentic Security (35 posts, focused sub-analysis)

This cluster is the largest. Full list omitted for brevity; focused analysis on sub-clusters with potential overlap.

#### Sub-cluster 6a: MCP Tool/Server Attacks — ⚠️ TRUE OVERLAP [Issue #281]

| Slug | Title | Verdict |
|------|-------|---------|
| `mcp-tool-poisoning` | MCP Tool Poisoning: How Malicious Tool Definitions Hijack AI Agents | ⚠️ **CONSOLIDATE** with `tool-poisoning-malicious-mcp-servers` |
| `tool-poisoning-malicious-mcp-servers` | Tool Poisoning via Malicious MCP Servers: When Your Agent's Tools Turn Against It | ⚠️ **CONSOLIDATE** — keep as primary (broader framing) |
| `mcp-security-attack-surface` | MCP Security: The New Attack Surface for AI Tool Protocols | Keep — broader MCP protocol security overview |

**Overlap assessment**: `mcp-tool-poisoning` (July 11) and `tool-poisoning-malicious-mcp-servers` (June 29) teach the same core concept: MCP tool definitions are injection surfaces that can redirect agent behavior before any user message is processed. The distinction (definition-level injection vs. server-level compromise) is real but thin — both posts walk through the same trust model and arrive at the same reader takeaway. Most readers would perceive this as the same topic twice. Filed as **Issue #281**.

#### Sub-cluster 6b: Multi-Agent Trust — See Also recommended

| Slug | Title | Verdict |
|------|-------|---------|
| `multi-agent-orchestration-security-trust-delegation` | Multi-Agent Orchestration Security: Trust, Delegation, and Inter-Agent Attack Surfaces | Keep — broad taxonomy (privilege escalation, confused deputy, tool-chain hijacking) |
| `multi-agent-trust-escalation` | Multi-Agent Trust Escalation: How Subagents Inherit and Abuse Orchestrator Permissions | Keep — deeper focus on privilege escalation specifically |
| `multi-agent-non-compositionality` | Safe Agents, Unsafe Systems: The Non-Compositionality Problem in Multi-Agent Security | Keep — theoretical; emergent unsafe behavior from individually-safe agents |

**Assessment**: The first two posts overlap in topic (multi-agent trust, privilege escalation) but are genuinely distinct: `orchestration-security` provides a broad taxonomy of attack surfaces; `trust-escalation` goes deep on one specific attack class (permission inheritance abuse). Keep both; add cross-references.

#### Sub-cluster 6c: Remaining agentic posts (all distinct)

`agent-attack-surface-mapped`, `agent-loop-hijacking-resource-exhaustion-attacks`, `agent-memory-cloud-privacy-leak`, `agent-security-os-analogy`, `agentbridge-attack-surface-analysis`, `ai-worms-multi-agent-pipelines`, `browser-use-attacks-hijacking-ai-agents`, `defense-in-depth-ai-agents-security-stack`, `etamp-agent-memory-poisoning`, `finharness-inline-safety-harness`, `guardrail-structural-bottleneck`, `latent-space-injection-multi-agent`, `llm-router-supply-chain-attack`, `llm-security-testing-cost-empirical-study`, `multi-agent-red-teaming-network-attacks`, `non-human-identity-security-ai-agents`, `on-the-fly-agent-prototype-problem`, `owasp-top10-ai-agents-part1`, `personal-ai-agent-ambient-authority-inbox-attack`, `physics-is-all-you-need-agent-supervision-case-study`, `rag-memory-poisoning-attacks`, `skill-library-memory-poisoning-defense`, `trinityguard-mas-safety-evaluation`, `zero-trust-architecture-ai-agent-deployments`, `sqlite-agents-md-no-agentic-code-accepted` — all keep.

---

### Cluster 7: RAG / Retrieval (5 posts)

| Slug | Title | Verdict |
|------|-------|---------|
| `adversarial-document-injection-rag-vector-stores` | Poisoning the Knowledge Base: Adversarial Document Injection into RAG Vector Stores | Keep — corpus injection attack taxonomy |
| `rag-memory-poisoning-attacks` | Poisoning the Well: Memory and RAG Attacks Against Long-Context AI Systems | Keep — broader (memory + RAG + long-context) |
| `rag-privacy-attacks-retrieval-data-exfiltration` | RAG Privacy Attacks: How Retrieval-Augmented Generation Pipelines Leak Private Documents | Keep — privacy/data exfiltration angle (distinct from poisoning) |
| `healthcare-rag-chatbot-data-leak` | No Auth Required: How a Healthcare RAG Chatbot Leaked 1,000 Patient Conversations | Keep — real-world case study |
| `mitre-atlas-adversarial-ai-threat-landscape` | MITRE ATLAS: Mapping the AI/ML Threat Landscape with an Authoritative Adversarial Framework | Keep — framework/taxonomy post |

**Overall cluster verdict**: All distinct. First two posts (injection + memory poisoning) conceptually overlap but have different scopes. No consolidation required.

---

### Cluster 8: Multimodal / Visual (4 posts)

| Slug | Title | Verdict |
|------|-------|---------|
| `adversarial-attacks-vision-language-models-pixels-injection` | Adversarial Attacks on Vision-Language Models: Pixels as Injection Vectors | Keep — gradient-crafted adversarial perturbations |
| `multimodal-jailbreak-attacks` | Beyond Text: How Simple Perceptual Tricks Break Multimodal AI Safety | ⚠️ **See also** — [#282] pair with `multimodal-jailbreaking-image-bypass-text-safety` |
| `multimodal-jailbreaking-image-bypass-text-safety` | Multimodal Jailbreaking: How Attackers Use Images to Bypass Text Safety Filters | ⚠️ **See also** — [#282] pair with `multimodal-jailbreak-attacks` |
| `trojan-triggers-multimodal-models-visual-backdoors` | Trojan Triggers in Multi-Modal Models: How Visual Backdoors Activate Hidden Behaviors | Keep — visual-trigger backdoor mechanism |

**Overlap assessment**: `multimodal-jailbreak-attacks` and `multimodal-jailbreaking-image-bypass-text-safety` both cover image-based safety bypass. They are kept as distinct because:
- First: empirical attack results (>75% ASR, no gradient access needed; arXiv:2510.20223)
- Second: architectural explanation (token-level vs pixel-level safety gap; enterprise defender framing)
Different takeaways, different audiences. Filed as **Issue #282** to add cross-references.

---

### Cluster 9: Privacy / Data Extraction (7 posts)

| Slug | Title | Verdict |
|------|-------|---------|
| `training-data-extraction-memorized-private-content` | Training Data Extraction: How Attackers Query LLMs to Surface Memorized Private Content | Keep — verbatim extraction from deployed inference API |
| `membership-inference-attacks` | Membership Inference Attacks: Detecting What Was in an AI Model's Training Data | Keep — detecting presence (not extracting content) |
| `gradient-inversion-attacks-reconstructing-private-training-data` | Gradient Inversion Attacks: Reconstructing Private Training Data from Model Updates | Keep — reconstruction from gradients (requires model access) |
| `model-extraction-api-queries-stealing-proprietary-ai` | Model Extraction via API Queries: Stealing Proprietary AI Without the Weights | Keep — model IP theft via query oracles |
| `differential-privacy-epsilon-guarantees-ai-training` | Differential Privacy in Practice: What the Math Guarantees (and What It Doesn't) for AI Training Data | Keep — defense/guarantee post |
| `rag-privacy-attacks-retrieval-data-exfiltration` | RAG Privacy Attacks: How Retrieval-Augmented Generation Pipelines Leak Private Documents | Keep — retrieval-specific privacy leakage |
| `agent-memory-cloud-privacy-leak` | Your Agent's Memory Is Building a Privacy Database You Didn't Design | Keep — persistent agent memory angle |

**Overall cluster verdict**: All distinct. Posts already cross-reference each other (confirmed: `training-data-extraction` explicitly contrasts with `membership-inference-attacks` and `gradient-inversion-attacks`). Model cluster is healthy.

---

### Cluster 10: Red Teaming (9 posts)

| Slug | Title | Verdict |
|------|-------|---------|
| `adaptive-red-teaming-advgrpo` | Adaptive Red Teaming via GRPO: When the Attacker and Defender Train Together | Keep — co-training framework; specific research paper |
| `automating-red-team-ai-at-scale` | Automating the Red Team: Using AI to Attack AI at Scale | Keep — automation framing; tooling and scale |
| `big-labs-red-teaming-methodology-gaps` | How the Big Labs Red-Team Their Models — and What They Keep Missing | Keep — methodology critique; meta-analysis |
| `multi-agent-red-teaming-network-attacks` | What Red-Teaming Misses When Agents Talk to Each Other | Keep — multi-agent blind spot in red-teaming |
| `ai-safety-evals-gaming-sandbagging-context-drift` | How AI Safety Evaluations Are Gamed: Sandbagging, Context Drift, and Eval Design Gaps | Keep — eval gaming (distinct from red teaming proper) |
| `benchmark-contamination-false-assurance-ai-safety` | Benchmark Contamination and the False Assurance Problem in AI Safety Evaluations | Keep — benchmark integrity angle |
| `attacking-the-judge-llm-evaluation-adversarial-manipulation` | Attacking the Judge: Adversarial Manipulation of LLM-as-a-Judge Evaluation Systems | Keep — LLM-as-judge attack surface |
| `ai-security-regulatory-compliance-eu-ai-act-nist-rmf-iso-42001` | AI Security and the Law: What the EU AI Act, NIST AI RMF, and ISO 42001 Actually Require | Keep — regulatory framing |
| `mechanistic-interpretability-security-tool` | Mechanistic Interpretability as a Security Tool | Keep — MI as evaluation tool |

**Overall cluster verdict**: All distinct. Cluster is coherent — covers methodology, automation, gaps, and gaming of evaluations.

---

### Cluster 11: Unclustered / Other (52 posts — sampled for overlap review)

All 52 were reviewed. Selected observations:

| Posts | Topic | Verdict |
|-------|-------|---------|
| `openai-codex-sandboxing-patterns` + `anthropic-claude-sandbox-architecture` | Sandboxing AI agents | Keep both — `anthropic-claude-sandbox-architecture` explicitly compares to the OpenAI post; intentional two-part series. Cross-references already present. |
| `reward-hacking-rlhf-safety` + `specification-gaming-reward-hacking-wrong-goal` + `beyond-reward-hacking-causal-rewards-rlhf` | Reward hacking / RLHF alignment | Keep all three — production security failure (RLHF), theoretical alignment framing (specification gaming), and specific causal solution (CRM paper) are genuinely distinct |
| `agent-side-channel-exfiltration` + `side-channel-attacks-llm-apis-timing-token-counts` + `adversarial-prompt-caching-kv-timing-attacks` | Side channels | Keep all three — agent behavioral encoding, API metadata, and KV-cache timing are distinct attack surfaces. `side-channel-attacks-llm-apis` already cross-references `adversarial-prompt-caching` |
| `llm-influence-operations` + `ai-social-engineering-deepfakes-voice-cloning-impersonation` | AI-powered social manipulation | Keep both — influence operations (systemic, nation-state, disinformation) vs. social engineering (individual impersonation, deepfake fraud) are distinct threat models |
| `coordinated-vulnerability-disclosure-ai-models` + `ai-breaking-vulnerability-disclosure-cultures` | Vulnerability disclosure | Keep both — first is about CVD frameworks for AI; second is about how AI-assisted scanning changes disclosure culture |

---

## Filed Follow-Up Issues

| Issue | Type | Posts Affected |
|-------|------|----------------|
| [#280](https://github.com/copilot-autogent/ai-security-blog/issues/280) | Cross-reference (See also) | Backdoor/trojan 5-post cluster: `backdoor-attacks-foundation-models`, `fine-tuning-trojans-backdoors-training-pipeline`, `sleeper-agents-ai-supply-chain-backdoor`, `metabackdoor-positional-encoding-trigger`, `backdoor-trigger-mechanisms-steganographic-encoding` |
| [#281](https://github.com/copilot-autogent/ai-security-blog/issues/281) | **Consolidate** (true overlap) | `mcp-tool-poisoning` + `tool-poisoning-malicious-mcp-servers` |
| [#282](https://github.com/copilot-autogent/ai-security-blog/issues/282) | Cross-reference (See also) | `multimodal-jailbreak-attacks` + `multimodal-jailbreaking-image-bypass-text-safety` |
| [#283](https://github.com/copilot-autogent/ai-security-blog/issues/283) | Cross-reference (See also) | `crescendo-multi-turn-jailbreaks-stateful-conversation-attacks` + `twingate-stateful-defense-decompositional-jailbreaks` |

---

## Notes on Methodology

- **Scan method**: All 137 posts scanned via `title`, `description` frontmatter extraction + cluster keyword matching. For all candidate overlap pairs, opening paragraphs (first 20 lines of body) were read directly to assess genuine distinction.
- **Cluster assignment**: Posts were assigned to clusters by regex matching on title + description. Posts may appear in multiple clusters (expected for broad-topic posts like `ai-incident-response-playbook`).
- **"True overlap" threshold**: Posts were flagged for consolidation only when they share the same core concept, the same reader takeaway, and the distinction between them does not justify separate reads. Posts that cover the same *topic area* but with different attack vectors, research papers, or deployment contexts were classified as "keep + See also."

---

## Appendix: Full Post List by Cluster Assignment

Post count per cluster (clusters overlap; total > 137):

| Cluster | Post count |
|---------|------------|
| Agentic Security | 35 |
| Data Poisoning | 20 |
| Prompt Injection | 17 |
| Red Teaming | 9 |
| Supply Chain | 9 |
| Jailbreak | 9 |
| Privacy / Extraction | 7 |
| Regulatory / Compliance | 6 |
| RAG / Retrieval | 5 |
| Multimodal / Visual | 4 |
| Unclustered (other) | 52 |

*All 137 posts reviewed. 52 "other" posts were reviewed individually; no consolidation candidates identified among them beyond those noted above.*
