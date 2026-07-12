export interface CategoryDef {
  slug: string;
  title: string;
  description: string;
  tags: string[];
}

/** Topic categories derived from post tags. A post belongs to a category
 *  if it has ANY of the listed tags. */
export const CATEGORIES: CategoryDef[] = [
  {
    slug: "agent-security",
    title: "Agent Security",
    description:
      "Risks unique to autonomous LLM agents: tool misuse, multi-agent trust, goal hijacking, and resource exhaustion. This is the frontier of AI-specific attack surface.",
    tags: ["agent-security", "agentic-ai", "tool-use", "multi-agent"],
  },
  {
    slug: "prompt-injection",
    title: "Prompt Injection",
    description:
      "Direct and indirect prompt injection, jailbreaks, system-prompt leakage, and instruction-override attacks — the most exploited class of LLM vulnerability.",
    tags: [
      "prompt-injection",
      "jailbreak",
      "system-prompt",
      "indirect-prompt-injection",
    ],
  },
  {
    slug: "defense-patterns",
    title: "Defense Patterns",
    description:
      "Practical mitigations: threat modeling, red-teaming methodologies, monitoring pipelines, incident response playbooks, and least-privilege architectures for AI systems.",
    tags: [
      "defense-patterns",
      "red-teaming",
      "monitoring",
      "incident-response",
      "threat-modeling",
      "least-privilege",
    ],
  },
  {
    slug: "llm-model-security",
    title: "LLM & Model Security",
    description:
      "Attacks targeting the model itself: fine-tuning vulnerabilities, RAG poisoning, model extraction, weight theft, and inference-time manipulation of large language models.",
    tags: [
      "llm-security",
      "model-security",
      "rag-security",
      "fine-tuning",
      "llm",
      "model-extraction",
    ],
  },
  {
    slug: "supply-chain",
    title: "Supply Chain Attacks",
    description:
      "Backdoors in training data, model weights, and third-party components. Sleeper agents, poisoned checkpoints, and dependency confusion in AI pipelines.",
    tags: [
      "supply-chain",
      "supply-chain-security",
      "backdoor",
      "sleeper-agents",
    ],
  },
  {
    slug: "ai-safety-alignment",
    title: "AI Safety & Alignment",
    description:
      "Reward hacking, specification gaming, RLHF failure modes, and the gap between intended and learned behavior — where safety research meets security practice.",
    tags: ["ai-safety", "alignment", "rlhf", "reward-hacking", "safety-alignment"],
  },
  {
    slug: "adversarial-ml",
    title: "Adversarial ML",
    description:
      "Evasion attacks, membership inference, data poisoning, and adversarial examples — classical adversarial machine learning applied to modern foundation models.",
    tags: [
      "adversarial-ml",
      "poisoning-attacks",
      "data-poisoning",
      "model-extraction",
      "membership-inference",
      "adversarial-examples",
    ],
  },
  {
    slug: "privacy",
    title: "Privacy & Data Security",
    description:
      "Differential privacy guarantees, gradient leakage in federated learning, data exfiltration via model outputs, and privacy-preserving training techniques.",
    tags: [
      "privacy",
      "differential-privacy",
      "federated-learning",
      "data-exfiltration",
      "gradient-attacks",
    ],
  },
];
