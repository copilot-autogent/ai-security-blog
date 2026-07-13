---
title: "AI in Critical Infrastructure: Attack Surfaces in Industrial Control Systems and Smart Grids"
description: "How AI integration into power grids, water treatment, manufacturing, and transportation creates novel attack surfaces distinct from traditional ICS/SCADA threats — sensor spoofing against ML anomaly detectors, adversarial attacks on predictive maintenance, model poisoning in federated industrial AI, and mitigations specific to OT environments."
pubDate: 2026-07-13
tags: ["adversarial-ml", "adversarial-examples", "ics-security", "ot-security", "critical-infrastructure", "scada", "ai-security", "defense-patterns"]
relatedPosts: ["ai-as-weapon-attacking-traditional-infrastructure", "adversarial-examples-foundational-ml-attack-production", "mitre-atlas-adversarial-ai-threat-landscape"]
---

Researchers have demonstrated that an adversary can inject carefully crafted false readings into the sensor streams of an industrial anomaly detection system — readings that, examined individually, look entirely plausible — and cause the ML model to classify an ongoing equipment fault as normal operation. The attack is silent. The physical process is degrading. The AI watchdog says nothing is wrong.

This is the core tension in AI-enabled critical infrastructure: the same ML capabilities that make industrial systems smarter — anomaly detection that catches faults humans would miss, predictive maintenance that extends equipment life, AI-assisted operator decision support — also introduce a new class of attack surface that traditional OT security was never designed to address.

This post covers the security implications of AI embedded *into* physical industrial systems: power grids, water treatment plants, manufacturing facilities, and transportation networks. This is distinct from [AI being used as a weapon against traditional infrastructure](/blog/ai-as-weapon-attacking-traditional-infrastructure) (AI as an attack tool), from [adversarial examples in the abstract ML sense](/blog/adversarial-examples-foundational-ml-attack-production) (though the concepts apply), and from general [AI agent security](/blog/agent-security-os-analogy) (the physical consequences are categorically different). When the target system controls a power plant or a water treatment process, the stakes are not data loss or service unavailability — they are physical consequences that can harm or kill people.

## What "AI in Critical Infrastructure" Actually Means Today

Before addressing the attack surfaces, it's worth grounding the discussion in concrete deployments rather than hypothetical futures. AI integration into operational technology is already happening at scale, though unevenly across sectors and geographies.

**Power grids and smart energy systems** represent the most mature deployment context. Utilities use ML for demand forecasting, load balancing, and fault detection across transmission and distribution networks. Smart meters in advanced metering infrastructure (AMI) generate granular consumption data that flows into analytics pipelines. Grid operators use AI to detect anomalies across thousands of sensors — an application that matters because grid faults can cascade rapidly and manual monitoring at scale is impossible.

**Water and wastewater treatment** increasingly relies on AI for process optimization: dosing algorithms that adjust chemical treatment based on sensor readings, anomaly detection for pump and valve systems, and predictive maintenance for infrastructure that often runs on decades-old hardware. The EPA's Water Sector Cybersecurity Framework notes AI adoption as an emerging trend with attendant risks.

**Manufacturing and industrial automation** has the broadest AI footprint. Predictive maintenance using vibration sensors, thermal imaging, and acoustics is widely deployed in heavy industry. Quality inspection using computer vision has replaced or augmented human inspection in high-volume production. AI-assisted planning and scheduling systems optimize supply chains. The convergence of IT and OT in "Industry 4.0" facilities means these AI systems often share infrastructure with enterprise networks.

**Transportation** encompasses autonomous vehicles and ADAS systems, AI-assisted air traffic management, and railway control systems that use ML for fault prediction and traffic optimization.

The common thread: in each case, an ML model is making or influencing real-time decisions about physical processes. The model's outputs are not recommendations that a human reviews before acting — they drive actuators, trigger alerts that operators act on immediately, or enable autonomous control loops. This is the deployment context that makes AI-specific attack surfaces in ICS materially different from AI security problems in cloud environments.

## The OT Security Baseline: Why This Environment Is Different

To understand what AI adds to the threat landscape, you need to understand the security properties of the environment it's being deployed into. OT security has always been different from IT security, and those differences shape what mitigations are and aren't feasible.

### The Traditional OT Security Model

The Purdue Reference Model for Control Hierarchy (developed by Theodore Williams at Purdue University in the 1990s, and widely called the Purdue Model) has structured industrial network design for decades. ISA-95, a related but distinct standard covering enterprise/manufacturing integration, adopted a similar hierarchy. Both organize industrial systems into hierarchical levels: field devices (Level 0), control systems and PLCs (Level 1), supervisory control/SCADA (Level 2), manufacturing operations management (Level 3), and enterprise networks (Levels 4-5). Operational technology spans Levels 0 through 3; the traditional security model relied on **air gaps** — physical network isolation between the OT zone (Levels 0-3) and the IT/enterprise zone (Levels 4-5).

The air gap has been eroding for over a decade. Remote access requirements for vendor maintenance, IoT connectivity, cloud analytics pipelines, and the business pressure to integrate operational data with enterprise systems have created connectivity between formerly isolated levels. The Ukraine power grid attacks demonstrated that air-gap erosion has real consequences. The 2015 attack (using the BlackEnergy malware family) compromised distribution system operators through spear-phishing, used lateral movement from IT to OT networks, and caused unplanned disconnections affecting approximately 225,000 customers. The 2016 attack (using the Industroyer/Crashoverride malware) targeted the Pivnichna transmission substation near Kyiv, operating at 330 kV, causing a roughly one-hour outage by using native substation communication protocols (IEC 101, IEC 104, IEC 61850 GOOSE) to open circuit breakers without operator authorization. Both incidents are the most documented cases of IT/OT-bridging attacks with physical consequences, though they attacked traditional SCADA components rather than AI systems specifically.

### Unique Constraints That Limit Security Options

OT environments impose constraints that don't exist in cloud AI deployments:

**Uptime requirements are extreme.** A power substation cannot tolerate a rolling restart for a security patch. A chemical plant cannot have its control system rebooted to apply an update. Equipment uptime requirements are measured in years, not hours. This means patching cycles are vastly longer than in IT, and the installed base of legacy operating systems in OT environments remains significant.

**Legacy hardware has no capacity for security additions.** PLCs and RTUs from the 1990s and 2000s run on minimal compute. They cannot run endpoint detection agents, encrypt all communications, or participate in modern authentication protocols. Any security architecture must account for this.

**Safety systems and control systems are deeply integrated.** A safety instrumented system (SIS) that trips a process on out-of-bounds conditions cannot be casually modified. Safety certification processes (IEC 61511, for functional safety of process industry SIS; IEC 61513 for nuclear instrumentation and control systems) impose rigorous change management requirements that make software updates slow.

**Physical consequences are irreversible.** An incorrect command to a grid protection relay doesn't produce a recoverable service degradation — it can cause equipment damage and cascading outages. This changes the risk calculus for both attackers and defenders.

### Standards Context

The primary cybersecurity standard for industrial environments is the IEC 62443 series (formerly ISA-99). IEC 62443 defines Security Levels (SL 1-4) based on the assumed attacker's means, motivation, and resources — roughly from incidental or low-skill attackers (SL 1) through sophisticated, well-resourced adversaries capable of extended campaigns against specific targets (SL 4). The series specifies requirements for zones and conduits (network segmentation), security management systems, and component requirements for embedded systems.

NIST's Cybersecurity Framework (CSF) 2.0 has been applied to ICS environments, and NIST SP 800-82 Rev 3 (2023, "Guide to Operational Technology (OT) Security") provides ICS-specific guidance. For AI specifically, CISA released a "Roadmap for Artificial Intelligence" in 2023 that addresses critical infrastructure sectors, emphasizing that AI systems in these contexts need to meet the same security rigor as the OT systems they integrate with — a point that is easier to state as a principle than to implement.

MITRE ATT&CK for ICS (attack.mitre.org/matrices/ics) extends the ATT&CK framework with ICS-specific tactics and techniques. Relevant technique families include Impair Process Control, Inhibit Response Function, and Impact — the latter covering techniques that affect the physical process. AI-specific techniques are not yet formalized in ATT&CK for ICS as of this writing, but several existing techniques (particularly sensor spoofing and data manipulation) map directly to the AI attack vectors discussed below.

## AI-Specific Attack Surfaces in ICS Environments

Traditional OT security concerns — unauthorized access to SCADA systems, exploitation of unpatched PLCs, manipulation of historian databases — remain real and relevant. But AI integration creates additional attack surfaces that are distinct and in some ways harder to detect. Here is a taxonomy of the primary AI-specific attack vectors.

### 1. Sensor Spoofing Against ML Anomaly Detectors

This attack class has been studied extensively in the adversarial ML literature and generalizes across ICS deployment contexts. An ML-based anomaly detector is trained on historical sensor data representing normal operation. At inference time, it receives a stream of sensor readings and outputs an anomaly score or classification.

The attack: instead of injecting sensor readings that are obviously out of range (which would be caught by simple threshold monitoring), an adversary injects readings that individually appear plausible but are jointly crafted to keep the ML model's anomaly score below its alert threshold. The readings don't need to look "normal" — they need to look normal *to the model*, which is a subtler requirement.

This is a form of adversarial evasion attack, but the adversarial goal is not misclassification of a label — it's suppression of an alert while a physical process degrades. The attacker isn't trying to fool the model into thinking something bad is happening; they're trying to fool it into *not noticing* something bad that they have caused.

Why is this plausible in practice?

- **Models are known**: in many ICS environments, the vendor of the predictive maintenance or anomaly detection system is known, and published research often reveals the architecture and training approach. White-box and gray-box attacks are feasible when the model type is predictable.
- **Historical data is accessible**: in some federated or cloud-connected industrial AI deployments, training data characteristics can be inferred or approximated from observable model behavior.
- **The physical attack can be staged alongside the sensor attack**: an adversary who has compromised field device communications (or can physically access sensors, as is the case for insider threats at industrial facilities) can both cause the process deviation and spoof the sensor readings that would detect it.

The 2021 Oldsmar water treatment plant incident is instructive as a cautionary analog: an attacker remotely accessed the SCADA system and briefly raised sodium hydroxide (lye) dosing to dangerous levels before an operator noticed. No AI was involved. But if an AI dosing system were present and the adversary understood its sensor fusion, the attack surface expands: instead of making an obvious setting change that a human operator notices immediately, the adversary could craft sensor inputs that cause the AI to recommend a dangerous dosing while the readings suggest a normal chemistry state.

### 2. Adversarial Attacks on Predictive Maintenance AI

Predictive maintenance systems use ML to predict equipment failure from sensor data — vibration, temperature, current draw, acoustic signatures. These systems have two attack surfaces corresponding to two adversarial goals.

**False negative attacks (hiding degradation):** An adversary who has compromised sensor communications or firmware can craft sensor readings that mask genuine equipment degradation. The ML model, receiving sanitized readings, classifies the equipment as healthy. Maintenance is not scheduled. Eventually, the equipment fails — potentially catastrophically, in a manner that causes downstream damage, production loss, or safety incidents.

This attack is particularly concerning in safety-critical contexts: a turbine with masked bearing degradation, a pipeline with masked corrosion readings, a circuit breaker with masked insulation degradation. The attack is designed to cause failure at an adversary-chosen time by preventing the predictive maintenance system from issuing a warning.

**False positive attacks (forcing unnecessary downtime):** The inverse attack causes the ML model to predict imminent failures that are not real, triggering unnecessary maintenance shutdowns, operational disruptions, and economic losses. Repeated false positive attacks could cause operators to lose confidence in the system entirely — effectively destroying the AI's protective value by making its outputs untrustworthy (a "crying wolf" attack).

Research in adversarial robustness of industrial fault detection has demonstrated that adversarial perturbations of vibration sensor readings can reliably cause misclassification in CNN-based fault detection models. The perturbations can be physically realized through manipulation of the sensor signal itself or through tampering with data in transit. (See, e.g., work on adversarial attacks against bearing fault classifiers using CWRU and similar benchmark datasets, an active area since approximately 2019.)

### 3. Model Poisoning in Federated and Distributed Industrial AI

Some industrial AI deployments use federated learning to train models across multiple facilities — a natural architecture when data is generated at the edge (individual plant sensors) but centralized data collection is impractical or privacy-sensitive. A manufacturing conglomerate might federate predictive maintenance across dozens of factories. A utility might aggregate anomaly detection models across substations.

Federated learning has known poisoning vulnerabilities. A participant with a compromised local training environment can submit model updates (gradients) that are designed to degrade global model performance, introduce backdoors, or bias the model toward specific misclassifications. In the Byzantine-robust federated learning literature, this is known as a Byzantine attack or a backdoor poisoning attack.

In an industrial context, the threat model is more specific than the general federated learning case:

- **Insider threat from a compromised subcontractor**: a vendor providing AI services to multiple facilities could, under coercion or compromise, corrupt the federated model updates submitted from their systems.
- **Nation-state with long-horizon positioning**: an adversary willing to invest in compromising a small number of federated participants could degrade a grid or industrial AI system before a crisis period, ensuring the AI provides unreliable outputs precisely when it's most critical.
- **Supply chain poisoning**: the AI component itself (the model weights delivered to facilities, or the training framework used at edge nodes) could be trojaned before deployment.

Detecting poisoning in federated industrial settings is harder than in research settings: the number of participants is often small (limiting statistical anomaly detection), ground truth for evaluating model quality may only be observable through physical outcomes (which manifest slowly), and the computational capacity for robust aggregation may be limited at edge nodes.

### 4. Prompt Injection Against LLM-Assisted SCADA Operators

The most recent and speculative category: the use of large language models as decision-support tools for human operators in industrial control rooms. Vendors are beginning to offer LLM-based interfaces for interpreting alarm floods, summarizing process state, or querying historical incident data. An operator facing a complex, fast-moving situation might query an LLM assistant: "What caused the 14:32 anomaly on circuit 7B, and what should I do?"

If the LLM assistant has access to operational data, alarm logs, or external data sources, it inherits the [prompt injection attack surface](/blog/prompt-injection-role-confusion) of any LLM with tool access. An attacker who can inject adversarial content into the data sources the LLM queries — historian logs, maintenance records, external threat feeds — can potentially manipulate the AI's recommendations to the operator.

This attack class requires LLM integration, which remains uncommon in mature OT environments (safety culture rightly resists introducing unvalidated AI into control loops). But the commercial pressure to add "AI assistant" interfaces to SCADA and DCS platforms is real, and the deployment is happening ahead of security analysis in several vendor ecosystems.

The consequence potential is high: an operator misled by an AI assistant during a time-critical incident response is more dangerous than an AI assistant that is simply unavailable. The attack exploits operator trust in the AI's synthesis of complex information — precisely the context where humans are most cognitively loaded and least likely to verify each claim.

## Real-World Context and Research Evidence

It's important to be accurate about the current state of evidence. The documented ICS-targeted attacks with physical consequences — the Ukraine grid attacks (2015, 2016), the Oldsmar water treatment incident (2021) — and the most consequential documented ICS attack on a safety system, Triton/TRISIS (2017, targeting safety instrumented systems at a Saudi petrochemical facility) — were not AI-targeted attacks. They attacked traditional SCADA systems, historian databases, safety controllers, and IT/OT network connections. Other high-profile incidents sometimes cited in ICS security writing, such as Shamoon (2012, a destructive attack on Saudi Aramco's IT infrastructure) and Colonial Pipeline (2021, ransomware against IT systems causing voluntary OT shutdown), targeted IT systems rather than industrial control processes directly and are better understood as IT incidents with operational consequences.

The AI-specific attacks described in this post are at the **research-demonstrated** level, not at the **incident-documented** level. This is an important distinction that some vendor marketing obscures. The sensor spoofing against ML anomaly detectors has been demonstrated in laboratory and simulation settings. The adversarial attacks on predictive maintenance classifiers have been shown to work in controlled environments. No public incident attribution confirms that a critical infrastructure AI system was specifically targeted through adversarial ML techniques.

This is not reassuring. The absence of confirmed incidents could reflect:
1. The attacks have not yet been attempted at scale in real deployments
2. The attacks have been attempted but not detected (detection of adversarial ML attacks is notoriously difficult without specific monitoring for it)
3. The attacks have been detected but not attributed or disclosed

The ICS threat actor community is sophisticated and patient. Documented ICS intrusion campaigns — Triton/TRISIS (2017), PIPEDREAM/INCONTROLLER (2022, a modular framework targeting multiple ICS protocols) — demonstrate that nation-state actors invest in ICS-specific capabilities, are willing to operate with long dwell times, and understand the operational specifics of industrial environments at a level that enables targeted attacks.

The research demonstrating AI attack feasibility, combined with the established pattern of ICS-targeted nation-state activity, makes this threat category credible and worth addressing in defense architectures now, before incident evidence accumulates.

## Defensive Architecture for Safety-Critical AI Deployments

This is the gap in most existing writing on ICS + AI security: concrete practitioner guidance. The following is organized by the specific attack vectors discussed above, with attention to the unique constraints of OT environments.

### Defense Against Sensor Spoofing: Adversarially Robust Anomaly Detection

The fundamental defense against adversarial sensor spoofing is building anomaly detection models that are explicitly hardened against adversarial inputs, not just optimized for normal operation accuracy.

**Adversarial training**: train the anomaly detection model on adversarially perturbed sensor streams in addition to historical normal data. This is the most effective known defense against evasion attacks (Madry et al., "Towards Deep Learning Models Resistant to Adversarial Attacks," arXiv 2017, published ICLR 2018 — projected gradient descent adversarial training remains the baseline), though it increases model complexity and may reduce accuracy on non-adversarial inputs. In ICS contexts, domain-specific adversarial examples — perturbations that respect physical plausibility constraints — are more useful than generic ℓ∞-bounded perturbations.

**Physics-constrained validation**: ML anomaly detectors should not operate in isolation from physics-based process models. If a sensor reading is consistent with the ML model's "normal" distribution but violates what is physically possible given adjacent sensor readings (energy balance, flow conservation, thermal dynamics), a combined system will flag what the pure ML model misses. This defense raises the bar for adversarial attacks: an attacker must now craft sensor inputs that satisfy both the ML model's learned boundaries *and* the physics constraints simultaneously. A single-point sensor spoof that satisfies the ML model may fail the physics check; a coordinated multi-sensor attack that satisfies physics constraints requires substantially more knowledge of and access to the physical system.

**Sensor redundancy with diversity**: use redundant sensors measuring the same physical quantity via different transduction principles. An adversary can spoof a pressure transducer by manipulating its output signal, but spoofing a pressure transducer, an independent strain gauge on the same vessel, and an inferential estimate from flow and temperature simultaneously requires more access and more precisely coordinated manipulation. Design sensor architectures that make consistent spoofing of redundant heterogeneous sensors difficult.

**Out-of-distribution detection as a monitoring layer**: separately from the anomaly detector itself, monitor the statistical distribution of incoming sensor data for shift from training distribution. An adversarial attack that injects crafted sensor streams may keep the model's output safe while causing the input distribution to drift detectably. Lightweight distributional monitoring (e.g., tracking feature statistics, running hypothesis tests) can flag adversarially crafted inputs even when the primary anomaly detector has been fooled.

### Defense Against Predictive Maintenance Attacks: Integrity Verification and Diverse Sources

**End-to-end integrity of sensor data**: the most actionable defense against adversarial manipulation of sensor data in transit is ensuring cryptographic integrity from field device to ML model. This is architecturally simple in principle but practically challenging in legacy OT environments. For new deployments, specifying authenticated communication from intelligent field devices (IEC 61850-based protection systems, Profinet with security extensions, or OPC UA's built-in security model) protects against in-transit manipulation. For legacy environments, data diodes or protocol gateways that perform integrity checking at the OT/IT boundary are a partial control. Note that this defense addresses tampering in transit; it does not protect against an attacker who has physically compromised the sensor itself or its firmware — a separate threat model that requires sensor-level attestation or hardware security modules in high-assurance deployments.

**Cross-source triangulation**: predictive maintenance predictions should be correlated against independent data sources. A vibration-based bearing fault prediction that contradicts evidence from oil analysis, thermal imaging, and power draw is more suspicious than one that is consistent across modalities. This requires investment in diverse sensing but significantly raises the bar for false-negative attacks.

**Gradual alert threshold calibration with human validation**: for high-stakes predictive maintenance decisions (scheduling major overhauls, shutting down production equipment), require human confirmation of AI recommendations with a brief review of the raw sensor data, not just the AI's summary. Alerts that recommend continued operation despite unusual patterns in one sensor stream should receive additional human scrutiny even if the overall model output is "healthy."

### Defense Against Federated Poisoning: Robust Aggregation and Audit

**Byzantine-robust aggregation**: replace standard FedAvg aggregation with robust alternatives — Krum, Trimmed Mean, Flame, or Bulyan — that are designed to tolerate a fraction of malicious participants submitting adversarial updates. The specific choice depends on the number of participants and the threat model, but any federated industrial AI deployment should specify robustness assumptions explicitly and choose an aggregation algorithm that meets them.

**Participant auditing and local model validation**: before accepting a gradient update from a participating node, validate it against a held-out reference dataset. Updates that disproportionately degrade performance on the reference set, or that are statistical outliers relative to honest participants' updates, should be quarantined. In industrial contexts, where the number of participants is often small, each participant's update can receive more intensive scrutiny than in large-scale consumer federated learning.

**Versioned model provenance and rollback**: maintain versioned model checkpoints with cryptographic provenance chains. If a poisoning attack is discovered, rollback to a known-good model state must be possible and tested. This requires treating ML models in ICS with the same change management rigor applied to control system software — including validation testing before deployment.

### Defense Against LLM Prompt Injection in Operator Support

If LLM-assisted operator tools are deployed or planned:

**Treat LLM recommendations as advisory, not authoritative**: LLM-generated recommendations in control room contexts should be clearly labeled as AI-generated, with easy access to the underlying data the AI synthesized. Operators should be trained that the AI can be manipulated and that they should apply independent judgment to any AI recommendation during active incidents.

**Sanitize and validate data sources**: any data source that feeds the LLM's context (historian queries, alarm log lookups, external documentation) should be treated as untrusted input and sanitized. Structured queries with schema validation are preferable to free-text injection. Limit the LLM's ability to receive arbitrary text from external sources that an attacker could influence.

**Privilege separation**: LLM operator tools should have read access to observational data and zero write access to control systems, setpoints, or alarm configurations. Any command the AI recommends must be independently issued by a human operator through normal control interfaces. This eliminates the highest-consequence attack path.

**Network-separate LLM inference from control networks**: if LLM inference runs on cloud infrastructure, ensure the data pipeline from OT systems to the LLM is outbound-only — OT data flows to the LLM inference service, and the LLM's text responses flow back to the operator terminal (a normal IT display workstation), never to a control system. The critical boundary is that no LLM output ever reaches an OT actuator or setpoint directly; the operator remains the only path from LLM recommendation to physical action.

### Cross-Cutting: Human-in-the-Loop for AI-Driven Actuation

The most important structural defense in safety-critical AI deployments is a principled policy on where AI is permitted to drive actuation without human confirmation.

IEC 62443 describes "security levels" for components and systems based on attack sophistication; a similar framework is needed for AI autonomy in safety-critical contexts. A practical taxonomy:

- **Monitoring-only AI**: the AI observes and alerts; all actuation is human-initiated. This is the appropriate default for all AI in safety-critical ICS until adversarial robustness is validated.
- **Supervised AI**: the AI recommends actions, humans confirm before actuation. Appropriate for time-sensitive but not time-critical decisions (predictive maintenance scheduling, minor setpoint adjustments).
- **Autonomous AI with hard limits**: the AI can actuate within a bounded envelope; any recommendation outside the envelope requires human confirmation. Appropriate for fast-response needs (automatic demand response in grids, automatic fault isolation) where the bounded envelope can be validated to be safe.
- **Fully autonomous AI**: appropriate only where the failure mode of delayed human response (not acting) is worse than the failure mode of an adversarially manipulated AI acting — a rare circumstance in practice.

This policy should be documented, auditable, and reviewed whenever the AI component changes.

## What Practitioners Should Do Now

The combination of AI adoption acceleration in OT environments and the lag in OT-specific AI security guidance creates a practical gap. Here is a prioritized starting point:

1. **Inventory AI components in your OT environment.** This sounds obvious but is often incomplete. Include AI components delivered by vendors as "analytics add-ons" to industrial platforms, which may not be tracked with the same rigor as PLC firmware.

2. **Apply IEC 62443 security level classification to AI components.** AI inference endpoints in ICS environments should receive the same network segmentation and access control as the control systems they observe.

3. **Require adversarial robustness testing from AI vendors.** When procuring industrial AI, ask vendors directly: what adversarial testing has been performed on this system? What is the documented attack surface against the sensor inputs? Vendor inability to answer is itself a risk signal.

4. **Implement physics-based cross-validation in parallel with ML anomaly detection.** This is achievable today without waiting for adversarially robust ML products.

5. **Review data paths from OT sensors to ML models for integrity protection.** Specifically, identify where sensor data can be manipulated in transit before reaching the AI, and add integrity controls at those points.

6. **For any AI recommendation that would be acted on in less than 60 seconds, document why human confirmation isn't required.** This is a forcing function for examining autonomous AI loops before an incident.

The OT security community has spent decades building the culture and practices to manage legacy, constrained, high-stakes environments. The AI security community has spent less time than it should thinking about physical consequences. The convergence of these two fields is where the next category of consequential vulnerabilities will emerge.

---

*Related reading: [AI as a Weapon: How Attackers Use LLMs Against Traditional Infrastructure](/blog/ai-as-weapon-attacking-traditional-infrastructure) covers AI used as an offensive tool against non-AI systems — the inverse threat direction. [Adversarial Examples: The Foundational ML Attack](/blog/adversarial-examples-foundational-ml-attack-production) covers the underlying evasion attack techniques referenced throughout this post. [MITRE ATLAS: Mapping the Adversarial AI Threat Landscape](/blog/mitre-atlas-adversarial-ai-threat-landscape) provides the broader threat taxonomy framework.*
