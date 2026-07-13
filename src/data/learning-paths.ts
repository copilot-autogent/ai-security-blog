export interface LearningPathStep {
  slug: string;
  why: string;
}

export interface LearningPath {
  slug: string;
  title: string;
  description: string;
  audience: string;
  intro: string;
  posts: LearningPathStep[];
}

/** Curated learning paths through the post collection.
 *  Every slug must correspond to an existing post in src/content/blog/.
 *  Paths are ordered — read from first to last. */
export const LEARNING_PATHS: LearningPath[] = [
  {
    slug: "ai-security-foundations",
    title: "AI Security Foundations",
    description:
      "A beginner-accessible sequence from threat taxonomy through to incident response — the essential first curriculum for anyone entering AI security.",
    audience: "Security practitioners new to AI, ML engineers learning threat modeling, or anyone who wants a structured overview before diving deeper.",
    intro:
      "AI security has its own vocabulary, attack classes, and mental models that don't map cleanly onto traditional application security. This path walks you through the foundational layer: how to think about threats in AI systems (MITRE ATLAS), the oldest and most studied attack class (adversarial examples), the most exploited vulnerability in deployed LLMs (prompt injection), where untrusted components enter the supply chain, and finally what to do when something goes wrong. By the end you'll have the conceptual scaffolding to understand any other post on this blog.",
    posts: [
      {
        slug: "mitre-atlas-adversarial-ai-threat-landscape",
        why: "Start here: MITRE ATLAS is the ATT&CK-equivalent for AI/ML — this post maps the entire threat landscape into a shared taxonomy you'll reference throughout.",
      },
      {
        slug: "adversarial-examples-foundational-ml-attack-production",
        why: "The oldest and most studied AI attack. Understanding how imperceptible perturbations break classifiers builds the intuition for every evasion technique that follows.",
      },
      {
        slug: "prompt-injection-role-confusion",
        why: "The most widely exploited LLM vulnerability. This post explains the role-confusion root cause before you encounter the more complex injection variants.",
      },
      {
        slug: "indirect-prompt-injection-incidents-survey",
        why: "Real-world incidents show prompt injection escaping the chat window — a survey of how attackers weaponize it against deployed systems.",
      },
      {
        slug: "ai-agent-supply-chain-attacks",
        why: "AI systems pull in third-party models, datasets, and tools — this post maps where the supply chain introduces untrusted inputs.",
      },
      {
        slug: "agent-security-os-analogy",
        why: "A useful mental model: AI agents share the same structural security problems as operating systems. Builds intuition for the rest of the blog.",
      },
      {
        slug: "ai-incident-response-playbook",
        why: "Closes the loop: what to do when an attack succeeds. Practical playbook for detection, containment, and recovery in AI systems.",
      },
    ],
  },
  {
    slug: "securing-ai-agents",
    title: "Securing AI Agents",
    description:
      "End-to-end security for autonomous LLM agents — from credential hygiene through multi-agent trust, runtime controls, and zero-trust architecture.",
    audience: "Engineers building or operating agentic AI systems, platform security teams, and architects designing multi-agent pipelines.",
    intro:
      "Autonomous agents introduce a qualitatively different attack surface: they act, not just respond. A compromised agent can exfiltrate data, escalate privileges, or persist across sessions. This path builds the security model for agentic systems from the ground up — starting with the identity layer (non-human credentials), moving through multi-agent trust delegation, runtime containment, and finally zero-trust architecture for agent deployments. Read in order: each post builds on the mental model established by the previous one.",
    posts: [
      {
        slug: "agent-attack-surface-mapped",
        why: "Orient with a complete attack surface map before diving into individual threat categories — understand what you're defending.",
      },
      {
        slug: "non-human-identity-security-ai-agents",
        why: "Agents need credentials to act. NHI (non-human identity) mismanagement is how agents get their keys stolen — start here before trust delegation.",
      },
      {
        slug: "ai-secrets-management-api-keys-system-prompts-model-credentials",
        why: "From NHI theory to operational practice: how to store, scope, rotate, and monitor API keys, system prompts, and ephemeral agent tokens across the full deployment lifecycle.",
      },
      {
        slug: "multi-agent-orchestration-security-trust-delegation",
        why: "When agents call agents, trust chains form. This post explains how delegation goes wrong and what safe orchestration looks like.",
      },
      {
        slug: "multi-agent-trust-escalation",
        why: "Escalation attacks in multi-agent pipelines — the concrete exploit path when trust delegation lacks privilege boundaries.",
      },
      {
        slug: "confused-deputy-llm-tool-use-least-privilege",
        why: "The confused deputy problem applied to LLM tool use — why least-privilege is the structural fix, not prompt hardening.",
      },
      {
        slug: "circuit-breakers-ai-agents-controllability",
        why: "Runtime containment: how circuit breakers interrupt runaway or compromised agents before they cause irreversible harm.",
      },
      {
        slug: "defense-in-depth-ai-agents-security-stack",
        why: "Synthesises the whole picture: layered defenses across identity, tool use, memory, and network for production agent deployments.",
      },
      {
        slug: "zero-trust-architecture-ai-agent-deployments",
        why: "Caps the path: applying zero-trust network principles to AI agents — never implicit trust, always verify, least-privilege access.",
      },
    ],
  },
  {
    slug: "privacy-and-data-protection",
    title: "Privacy & Data Protection",
    description:
      "From differential privacy mathematics through training data extraction, membership inference, and privacy-preserving inference — how AI systems leak information and how to stop them.",
    audience: "ML engineers, privacy engineers, and security researchers concerned with data leakage from trained models and inference pipelines.",
    intro:
      "Training a model on private data doesn't privatize that data — in many cases the model memorizes and can be queried to reproduce it. This path covers the full lifecycle of privacy attacks against AI systems: what formal privacy guarantees mean (differential privacy), how attackers extract memorized training data verbatim, how membership inference detects whether a specific record was in the training set, and how privacy-preserving inference techniques (TEEs, homomorphic encryption) change the threat model. RAG systems introduce new exfiltration surfaces covered at the end.",
    posts: [
      {
        slug: "differential-privacy-epsilon-guarantees-ai-training",
        why: "Start with the math: what ε-differential privacy actually guarantees (and doesn't) before encountering the attacks it's meant to prevent.",
      },
      {
        slug: "training-data-extraction-memorized-private-content",
        why: "The most direct privacy attack: querying a model to reproduce verbatim training data, including PII, code, and documents.",
      },
      {
        slug: "gradient-inversion-attacks-reconstructing-private-training-data",
        why: "In federated learning, gradient updates themselves leak training data — this post shows how reconstruction attacks work.",
      },
      {
        slug: "membership-inference-attacks",
        why: "Subtler than extraction: determining whether a specific record was in the training set, with implications for sensitive datasets.",
      },
      {
        slug: "model-inversion-attacks-reconstructing-training-data-confidence-scores",
        why: "Completes the reconstruction attack quadrant: how confidence score optimization can recover class-representative training examples from a black-box inference API.",
      },
      {
        slug: "federated-learning-poisoning-the-aggregation-attack-surface",
        why: "Federated learning's privacy promise is undermined by aggregation-layer attacks — this post maps the poisoning and inference surface.",
      },
      {
        slug: "privacy-preserving-ai-inference-tee-homomorphic-encryption-confidential-computing",
        why: "The defensive side: TEEs, homomorphic encryption, and confidential computing applied to inference — how the privacy threat model changes.",
      },
      {
        slug: "rag-privacy-attacks-retrieval-data-exfiltration",
        why: "RAG systems introduce a new exfiltration surface: attackers can craft queries that retrieve and exfiltrate documents from the retrieval index.",
      },
      {
        slug: "agent-memory-cloud-privacy-leak",
        why: "Closes the path: how persistent agent memory stores leak sensitive context across sessions — the newest frontier in AI privacy attacks.",
      },
    ],
  },
  {
    slug: "red-team-offense",
    title: "Red Team / Offense Perspective",
    description:
      "The attacker's view: jailbreaks, injection vectors, supply chain compromise, tool poisoning, and AI weaponised against traditional infrastructure.",
    audience: "Red teamers, offensive security researchers, and defenders who want to understand attacks at a technical depth that informs better mitigations.",
    intro:
      "You can't defend what you don't understand. This path takes the attacker's perspective through the full AI attack chain — starting with jailbreaks (the most visible attack class), moving through prompt injection as an exploitation primitive, into supply chain compromise via model hubs and MCP servers, and finishing with AI used as an offensive weapon against traditional infrastructure. The goal is depth: understand each technique well enough to build a test case for it.",
    posts: [
      {
        slug: "crescendo-multi-turn-jailbreaks-stateful-conversation-attacks",
        why: "Start with the stateful jailbreak — multi-turn gradual escalation defeats safety training that single-shot attacks cannot.",
      },
      {
        slug: "multimodal-jailbreak-attacks",
        why: "Jailbreaks cross modalities: image-encoded instructions bypass text safety filters, expanding the attack surface to any vision-language model.",
      },
      {
        slug: "jailbreak-as-a-service-underground-market",
        why: "The commoditisation of jailbreaks — understanding the market tells you which techniques are actively maintained and at what scale.",
      },
      {
        slug: "prompt-injection-long-context-windows",
        why: "Prompt injection scales with context: longer windows introduce new injection surfaces and make instruction-boundary attacks harder to detect.",
      },
      {
        slug: "indirect-prompt-injection-incidents-survey",
        why: "Indirect injection weaponised in the real world — a survey of incidents where injected instructions in external content hijacked deployed agents.",
      },
      {
        slug: "model-hub-supply-chain-attacks",
        why: "Attacking the model supply chain via malicious weights on public hubs — the equivalent of a malicious npm package for AI models.",
      },
      {
        slug: "tool-poisoning-malicious-mcp-servers",
        why: "MCP (Model Context Protocol) servers as an attack vector: the mechanics of how a poisoned tool definition is crafted and delivered to hijack an agent's tool-use decisions.",
      },
      {
        slug: "ai-as-weapon-attacking-traditional-infrastructure",
        why: "Caps the path: AI used offensively against traditional infrastructure — code generation for exploits, autonomous vulnerability discovery, and disinformation.",
      },
    ],
  },
  {
    slug: "enterprise-ai-governance",
    title: "Enterprise AI Governance",
    description:
      "From shadow AI risk through regulatory compliance, production monitoring, guardrail design, vulnerability disclosure, and incident response — the practitioner's governance stack.",
    audience: "CISOs, security architects, compliance engineers, and anyone operationalising AI security at enterprise scale.",
    intro:
      "Governance isn't bureaucracy — it's the operational layer that makes security controls stick across an organization. This path builds the enterprise AI governance stack: discovering and controlling Shadow AI (unsanctioned tools), meeting the regulatory requirements of the EU AI Act and NIST RMF, monitoring production LLMs for anomalies, designing guardrails that don't break at the seams, and running an effective incident response when a security event occurs. Posts are ordered from discovery to control to response.",
    posts: [
      {
        slug: "shadow-ai-enterprise-governance",
        why: "Start with discovery: shadow AI (unsanctioned tools and models) is the ungoverned surface — you can't secure what you don't know exists.",
      },
      {
        slug: "ai-security-regulatory-compliance-eu-ai-act-nist-rmf-iso-42001",
        why: "The regulatory landscape: EU AI Act, NIST RMF, and ISO 42001 mapped to practical controls — what you must do and by when.",
      },
      {
        slug: "per-model-security-posture",
        why: "Different models carry different risk profiles — this post frames how to assess and document the security posture of each model in your stack.",
      },
      {
        slug: "llm-security-monitoring-production-anomaly-detection-audit-logging",
        why: "Production monitoring: what to log, what anomalies to alert on, and how to build an audit trail for LLM API interactions.",
      },
      {
        slug: "llm-guardrails-decision-guide",
        why: "A decision framework for guardrail design — when to use input filters, output classifiers, or structural controls, and how to avoid the fragile middle.",
      },
      {
        slug: "guardrail-structural-bottleneck",
        why: "Why guardrails fail: the structural bottleneck problem — a single guardrail layer is a single point of failure regardless of its accuracy.",
      },
      {
        slug: "coordinated-vulnerability-disclosure-ai-models",
        why: "When researchers find vulnerabilities in your models: how CVD processes for AI differ from traditional software and what an effective programme looks like.",
      },
      {
        slug: "ai-incident-response-playbook",
        why: "Caps the path: the incident response playbook — detection, containment, eradication, and post-incident review specific to AI security events.",
      },
    ],
  },
];
