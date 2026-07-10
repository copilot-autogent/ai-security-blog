---
title: "Privacy-Preserving AI Inference: Trusted Execution Environments, Homomorphic Encryption, and Confidential Computing"
description: "When you submit a medical record to an AI API, can the cloud operator read it? TEEs, homomorphic encryption, and secure multi-party computation provide cryptographic and hardware-enforced confidentiality. This post explains what each actually guarantees — and what it doesn't."
pubDate: 2026-07-10
tags: ["privacy", "confidential-computing", "trusted-execution-environments", "homomorphic-encryption", "secure-mpc", "healthcare-ai", "threat-modeling", "cryptography", "inference-privacy"]
---

The differential privacy post in this series covered a property of *training* — statistical protections for the records used to build a model. But there is a separate and distinct privacy problem that arises every time you *use* an AI system in production: when you submit a query to an inference API, the provider's infrastructure processes that query in plaintext. The model operator sees your input.

For most consumer applications, this is an acceptable trade-off. For healthcare, legal, and financial workloads, it frequently isn't — not because providers are untrustworthy in the conventional sense, but because "trusting the API provider" carries a specific set of hidden assumptions worth making explicit before you ship.

## 1. The Threat Model: What "Trusting the Provider" Actually Means

When you send a sensitive query to an AI API — a patient's diagnostic notes, a confidential legal brief, a customer's financial history — you are making several implicit bets simultaneously:

**No insider threats.** You are assuming that every employee with infrastructure access, every support engineer with the ability to inspect inference logs, and every contractor with system-level access will not abuse that access. At large cloud providers this is partially mitigated by access controls and audit logging, but access controls create barriers, not impossibility. [Verizon's Data Breach Investigations Report](https://www.verizon.com/business/resources/reports/dbir/) has consistently shown that insider threats account for roughly 20–25% of data breaches in enterprise settings over the past decade. Cloud AI providers are not structurally different.

**No breach exposure.** You are assuming that if the provider's systems are compromised, your query data will not be in scope. Query logs, prompt caches, and inference context buffers are precisely the kind of high-value data that sophisticated attackers target in cloud infrastructure breaches.

**No regulatory gap.** For HIPAA-covered entities, the covered entity/business associate relationship creates contractual obligations — but contractual obligations are not a technical control. The technical question is whether patient data is *capable* of being read by the provider's staff. HIPAA's Security Rule focuses on administrative, physical, and technical safeguards that *limit* access; in a standard cloud inference deployment, the plaintext query is technically accessible to the provider during processing, which creates documentation requirements that many organizations handle inadequately.

**No vendor lock-in via data.** If the provider processes your queries in plaintext, they have — technically — seen your use patterns, your sensitive inputs, and your query structure. Even if they never act on that data, you have transferred some degree of information to them.

The techniques in this post are not primarily about distrusting specific providers. They are about creating **technical guarantees that constrain what the provider's infrastructure can observe** — architectures where encrypted memory and attestation prevent the hypervisor and host OS from reading query data, or where cryptographic techniques make computation possible without exposing plaintext. This reduces the attack surface and provides hardware-rooted or cryptographic assurance, as opposed to purely contractual guarantees. It does not make trust *irrelevant*: the attested application code running inside a TEE can still log, retain, or transmit data through its permitted output channels — its egress behavior and application-level data handling still require trust in the deployed application. What changes is that *infrastructure-level* access (host OS, hypervisor, data center staff) is technically constrained, not just contractually prohibited.

## 2. Trusted Execution Environments (TEEs)

A Trusted Execution Environment is a hardware-enforced isolated execution context. The core guarantee is **memory isolation from the host operating system and hypervisor**: code and data inside the TEE are encrypted in-memory and cannot be read or tampered with by software running outside the TEE, including the hypervisor managing the virtual machine.

### What a TEE Actually Guarantees

The guarantee has two components:

**Memory confidentiality and integrity.** The CPU encrypts TEE memory using keys stored in hardware, inaccessible to the OS or hypervisor. Even a fully compromised cloud host — one where an attacker has root or hypervisor access — cannot read the plaintext contents of TEE memory. This extends to memory at rest: if an attacker snapshots the VM's memory, what they get is encrypted ciphertext.

**Remote attestation.** A TEE can produce a cryptographically signed report — an attestation — that describes the state of the trusted environment, the hardware it is running on, and the firmware version. A client can verify this attestation against the hardware manufacturer's certificate authority before sending sensitive data.

Attestation is most useful when it is *bound to the data channel* — that is, when the client not only verifies the attestation report, but also ensures that data is encrypted directly to a key that only the attested workload can access. In AWS Nitro Enclaves, this is the standard pattern: data enters the enclave encrypted with a key that KMS will only release to an enclave with a verified attestation. In TDX or SEV-SNP deployments, the client should use the attestation to establish a TLS session terminating *inside* the confidential VM, or to seal data to a key proven by the attestation — simply verifying an attestation report separately from the data path does not prevent a relay or redirection attack.

The precision of what is attested varies by TEE architecture. In SGX-style enclave models, the attestation covers the specific application binary (an *MRENCLAVE* measurement). In VM-level TEEs like Intel TDX and AMD SEV-SNP, the attestation covers the VM's boot and launch measurements — the initial memory state of the guest, its configuration, and the firmware — rather than the running application binary directly. Application-level code identity verification (binding a specific inference server version to an attestation) requires additional tooling above the hardware attestation layer, such as a trusted launch policy that measures the guest kernel and bootloader.

What attestation reliably provides in all TEE implementations:
- Evidence that the hardware and firmware satisfy the expected configuration
- Evidence that the memory isolation guarantee is in effect
- A hardware-rooted chain of trust that can be verified cryptographically, not just contractually

Remote attestation is the mechanism that converts a hardware property into a trust relationship between a client and a remote service — with the caveat that the granularity of trust depends on what the specific TEE architecture measures, and the protection is only meaningful when attestation is cryptographically bound to the data channel.

### The Major TEE Implementations

**Intel TDX (Trust Domain Extensions).** TDX is Intel's current generation VM-level confidential computing technology, available in Sapphire Rapids and later Xeon processors. TDX protects entire virtual machines as Trust Domains (TDs), rather than requiring applications to be written as enclaves. The entire VM guest — OS, runtime, and applications — runs encrypted and isolated from the host hypervisor. TDX attestation produces a TD Quote signed by the TD Attestation Key; Intel Trust Authority is one attestation verification service that can validate this quote, but the quote format is an open standard that other attestation services (cloud provider-operated or third-party) can verify as well. TDX is distinct from Intel SGX (Software Guard Extensions), which required applications to be partitioned into small enclave modules — a significant application development burden. TDX's VM-granularity protection is considerably more practical for deploying existing AI inference stacks.

**AMD SEV-SNP (Secure Encrypted Virtualization – Secure Nested Paging).** AMD's equivalent of TDX, available in EPYC 7003 (Milan) and later processors. SEV-SNP adds integrity protection to SEV-ES (Secure Encrypted Virtualization – Encrypted State), preventing a malicious hypervisor from modifying guest VM memory pages. As of 2024–2025, AMD SEV-SNP is available on Azure (as part of Confidential VMs) and in Google Cloud's Confidential Computing offerings. The attestation report is signed using AMD's Root of Trust, enabling remote verification.

**AWS Nitro Enclaves.** AWS's approach is architecturally different from TDX and SEV-SNP. Nitro Enclaves are isolated compute environments created by partitioning some of the CPU and memory of an EC2 instance. They have no persistent storage, no interactive access, and no external networking beyond a local vsock connection to the parent EC2 instance. The parent instance can connect to AWS KMS to provision attestation-gated encryption keys — keys that KMS will only release to an enclave whose attestation report matches a specified hash. This creates a clean pattern for sensitive data processing: data enters the enclave encrypted, the enclave proves its identity to KMS, KMS releases the decryption key to the enclave, processing occurs inside the isolated environment, and encrypted results exit. AWS Nitro Enclaves are the most operationally mature TEE option available today in a major public cloud, with documented support for running Python inference workloads.

**Azure Confidential Computing.** Azure offers confidential VMs using both AMD SEV-SNP (as DCasv5 and ECasv5 series) and Intel TDX (DCesv5 series). Azure also provides a managed attestation service (Microsoft Azure Attestation, or MAA) and a set of confidential AI offerings under the Confidential Computing umbrella. Microsoft's Azure Confidential AI preview includes confidential GPU instances — Nvidia H100 GPUs with hardware-level attestation for the GPU memory.

**Fortanix.** Fortanix is a commercial confidential computing company built on Intel SGX (and expanding to TDX). They offer a confidential AI inference service and their Confidential AI SDK, which handles the enclave lifecycle management. For organizations that need a managed deployment rather than building their own TEE infrastructure, Fortanix is a practical option for SGX-based deployments.

### What TEEs Don't Guarantee

**Side-channel attacks.** TEEs protect memory content, not memory *access patterns*. Cache timing side channels — attacks that infer information about computation by observing which cache lines are accessed — are not prevented by TEE memory encryption. Attacks like [CacheBleed](https://ieeexplore.ieee.org/document/8106521) and various [SGX cache side-channel attacks](https://arxiv.org/abs/1702.08719) demonstrate that an adversary with physical access or hypervisor-level access can potentially infer information about TEE computation from cache access patterns, even without reading TEE memory directly. This is a meaningful limitation for inference workloads where access patterns can reveal structural properties of the input.

**Enclave-internal bugs.** The TEE guarantee isolates the enclave from the host. It does not protect against vulnerabilities in the code *running inside* the enclave. If the inference server code has a buffer overflow or injection vulnerability, an attacker who can craft malicious inputs can potentially compromise the enclave from the inside. The TEE isolation makes this harder to exploit from the outside, but the code correctness problem remains.

**GPU memory.** Standard TEE implementations protect CPU-side memory. When AI workloads move data to a GPU for inference, the standard path involves transferring data through a channel that, until recently, was not covered by the TEE's memory protection. Nvidia's H100 with Confidential Computing support is the current state of the art for GPU-side isolation, with initial support for inference workloads via NVTrust attestation — but this technology is newer and deployments are less mature than CPU TEE deployments.

**Performance overhead.** TEE deployments introduce measurable overhead. The magnitude varies by implementation. AWS Nitro Enclaves add relatively low overhead for inference workloads because the Nitro architecture already uses hardware isolation; the main cost is the vsock serialization. Intel TDX adds approximately 5–15% overhead for memory-intensive workloads in documented benchmarks, primarily from memory encryption and integrity checking. AMD SEV-SNP is in a similar range. These numbers are for general VM workloads; inference-specific benchmarks depend heavily on model size and batch size.

## 3. Homomorphic Encryption (HE) for ML Inference

Homomorphic encryption is a class of cryptographic techniques that allow computation on *encrypted data without decryption*. The computation takes ciphertext inputs and produces ciphertext outputs, and when the output is decrypted, the result is the same as if the computation had been performed on the plaintexts.

The distinction from TEEs is fundamental: TEEs protect computation by isolating the execution environment from untrusted parties. HE protects data by ensuring that the computation itself — even if fully observed — reveals nothing about the plaintext.

### The Gentry 2009 Breakthrough

The possibility of fully homomorphic encryption was conjectured for decades before Craig Gentry proved a construction exists in his 2009 Stanford PhD dissertation, published as "[A Fully Homomorphic Encryption Scheme](https://crypto.stanford.edu/craig/craig-thesis.pdf)" and presented at STOC 2009. Gentry's construction used lattice-based cryptography — specifically ideal lattices — to build an encryption scheme that could evaluate arbitrary boolean circuits. The key insight was a *bootstrapping* technique: periodically "refreshing" ciphertexts to prevent noise accumulation from making them undecodable.

The 2009 construction was not practical — the overhead was enormous. But it established that FHE was *possible*, which catalyzed a decade of cryptographic engineering toward practical schemes.

### Current HE Schemes and Their Properties

Modern HE implementations fall into several families, each with different performance profiles and suitable use cases:

**BFV (Brakerski/Fan-Vercauteren) and BGV (Brakerski-Gentry-Vaikuntanathan).** Integer-arithmetic schemes supporting addition and multiplication of integers packed into ciphertext vectors. Suitable for operations on integer-valued data. These schemes are implemented in [Microsoft SEAL](https://github.com/microsoft/SEAL) and [OpenFHE](https://openfhe.org/). BFV and BGV are practical for tasks like private set intersection, encrypted database queries, and simple logistic regression over integer features.

**CKKS (Cheon-Kim-Kim-Song).** The scheme designed for approximate floating-point arithmetic. CKKS allows some controlled noise in the final result, which is acceptable for machine learning applications where approximate answers are fine (and where floating-point arithmetic introduces rounding anyway). CKKS is the primary scheme used for neural network inference under HE. It supports Single Instruction, Multiple Data (SIMD) packing of floating-point values into ciphertext slots, enabling batched matrix operations that are necessary for neural network layers. CKKS is implemented in Microsoft SEAL (which supports it alongside BFV), OpenFHE, and [HElib](https://homenc.github.io/HElib/).

**TFHE (Fast Fully Homomorphic Encryption over the Torus).** A gate-bootstrapping scheme that evaluates arbitrary boolean circuits efficiently, with fast per-gate bootstrapping. TFHE's key property is low latency per gate operation, making it suitable for non-linear activation functions (like ReLU) that don't have natural polynomial approximations. [Zama's Concrete ML](https://docs.zama.ai/concrete-ml) is built on TFHE and targets machine learning inference specifically. Zama provides tools to convert scikit-learn models (logistic regression, decision trees, small neural networks) to FHE-evaluatable circuits using Concrete ML.

### What Is Practically Feasible Today

The current state of HE for ML inference — as of 2025–2026 — involves stark contrasts between feasibility categories:

**Practical today (minutes-to-seconds latency, <100× overhead):**
- Logistic regression inference on modest feature counts (tens to hundreds of features). CKKS-based logistic regression runs in seconds on commodity hardware.
- Simple CNNs on MNIST-scale problems. Research implementations (e.g., [CryptoNets, Gilad-Bachrach et al. 2016](https://proceedings.mlr.press/v48/gilad-bachrach16.html)) demonstrated MNIST inference under HE, though with latency in the range of minutes per sample.
- Decision trees and random forests with Concrete ML. Zama's published benchmarks for simple decision tree classifiers show inference under a minute.

**Feasible for research / high-regulatory-bar applications (hours latency, 1,000×–100,000× overhead):**
- Small neural networks with non-linear activations approximated via low-degree polynomials.
- Text classification with small transformers, where attention mechanisms are approximated.

**Not yet practical for production:**
- Large language model inference under FHE. The computational overhead for LLM-scale matrix multiplications under CKKS is currently in the range of 10,000–1,000,000× versus plaintext, depending on the scheme, model size, and hardware. For a model with billions of parameters, this is not deployable. The research community continues to make progress on this, with specialized architectures (smaller models designed for HE, polynomial-friendly activation functions) bringing the gap down — but GPT-3 or GPT-4 scale inference under standard FHE schemes is not on a near-term deployment horizon.

The 10,000–1,000,000× overhead figure is not a single number — it depends heavily on model architecture. Matrix-vector products, which dominate transformer inference, can be evaluated under CKKS with overhead in the 100–10,000× range for small matrices. Non-linear operations (softmax, layer normalization, GELU activations) are the bottleneck: they require polynomial approximations that add depth to the circuit and compound the noise accumulation problem.

### Key HE Libraries

**[Microsoft SEAL](https://github.com/microsoft/SEAL)** — An open-source C++ library implementing BFV, BGV, and CKKS. It is the most widely used HE library in industry research contexts. SEAL handles the parameter selection, encoding, and noise management complexity, exposing a high-level API for encrypted arithmetic. MIT license.

**[OpenFHE](https://openfhe.org/)** — An academic and industry project combining the implementations behind the PALISADE library and others. Supports a wide range of FHE schemes (BFV, BGV, CKKS, TFHE, FHEW). OpenFHE is particularly active for research and supports serialization formats for interoperability.

**[Zama Concrete ML](https://docs.zama.ai/concrete-ml)** — A Python library that compiles scikit-learn and PyTorch models to FHE-evaluatable circuits using the Concrete framework (built on TFHE). Concrete ML handles the conversion of floating-point model operations to integer-based FHE circuits. It is the most developer-friendly path for ML practitioners to deploy HE inference without cryptographic expertise.

**[HElib](https://homenc.github.io/HElib/)** — IBM's open-source library implementing BGV and CKKS. HElib was one of the first practical FHE libraries and remains used in research contexts, though OpenFHE has in some cases succeeded it for new work.

## 4. Secure Multi-Party Computation (SMPC/MPC)

Where HE allows one party to compute on another's encrypted data, Secure Multi-Party Computation (SMPC or MPC) allows *multiple parties* to jointly compute a function of their combined inputs, such that each party learns only the output — not the other parties' inputs.

The classic formulation (Yao's Millionaires' Problem, 1982) asks: can two millionaires determine who is wealthier without revealing their actual net worth? MPC provides a general answer: any function computable by a circuit can be evaluated by two or more parties where each party provides some inputs and learns only the output, under appropriate security assumptions.

For AI inference, the MPC formulation is: the client holds the query; the model provider holds the model weights; jointly compute the inference result, such that the client learns the output but not the model (protecting model IP), and the provider never sees the plaintext query (protecting user privacy).

### Garbled Circuits and Secret Sharing

MPC protocols broadly fall into two families:

**Garbled circuits** (originating from Yao's 1986 protocol) represent the computation as a boolean circuit and encrypt each gate's truth table. Party A (the "garbler") encrypts the circuit; Party B (the "evaluator") evaluates it with encrypted inputs. The evaluator learns only the output, not the intermediate values. The protocol has low round complexity (two rounds for the basic version), making it suitable for computations where network latency is a concern. The overhead is proportional to the circuit size.

**Secret sharing schemes** (Shamir 1979; also additive secret sharing) split each value into *shares* distributed across parties such that any subset below a threshold can reconstruct nothing, but the full set of parties can jointly compute on their shares using local arithmetic. Protocols based on secret sharing (GMW protocol, SPDZ, ABY frameworks) achieve better asymptotic performance than garbled circuits for large computations, at the cost of more communication rounds.

For practical ML inference, most MPC frameworks use hybrid approaches: secret sharing for the linear layers (matrix multiplications) which have low communication cost under secret sharing, and garbled circuits or specialized protocols for non-linear activations where the round-count advantage of garbled circuits matters.

### CrypTen

[CrypTen](https://github.com/facebookresearch/CrypTen) (Knott et al., 2021; arXiv:2109.00984) is Meta's open-source framework for MPC with PyTorch models. CrypTen extends PyTorch with encrypted tensor types that support the same operations as standard PyTorch tensors, but backed by MPC protocols rather than plaintext arithmetic. The design goal is to make MPC accessible to ML practitioners without requiring cryptographic expertise.

CrypTen's default configuration uses additive secret sharing for tensor values across participating parties. For multiplication, CrypTen uses Beaver triples (correlated randomness generated in an offline preprocessing phase) — a technique consistent with the SPDZ framework's approach, though CrypTen's security model in its default two-party configuration relies on a semi-honest (honest-but-curious) threat model rather than the full malicious-security of SPDZ. The key implementation choices:
- The online phase (where actual computation happens with input data) is fast; the offline phase (generating correlated randomness for multiplications) can be precomputed.
- Non-linear activations (ReLU, softmax) require specialized protocols or polynomial approximations.
- CrypTen supports the standard PyTorch model formats; an existing trained model can be run under MPC with relatively minor code changes.

The practical trade-off: for a simple feedforward network with ReLU activations on a batch of 128 inputs, CrypTen inference in a two-party setting adds roughly 10–50× latency compared to plaintext inference, with multiple network round trips. Communication cost is the dominant factor — not computation. For wide-area network settings (parties in different data centers), this is a significant limitation. For co-located parties or high-bandwidth networks, MPC is considerably more practical.

### Federated Inference vs. Federated Training

Federated learning (covered in [a previous post in this series](./federated-learning-poisoning-the-aggregation-attack-surface)) addresses training-phase privacy: model weights are updated at each participant without raw data leaving the device, and only gradient updates are shared with the aggregator. The threat model and privacy properties are different from inference-phase privacy:

**Federated training** limits raw training data from leaving participant devices — model weights are updated locally, and only gradient updates are shared with the aggregator. However, as the linked gradient inversion post covers in detail, gradients themselves can leak training data to an adversary who controls the aggregation server. Federated learning reduces but does not eliminate the model operator's ability to learn about client data; it is a structural privacy improvement over centralizing data, with residual risks depending on the attack model.

**Federated inference** (or private inference via MPC) protects *query* data at inference time. The model is already trained; the goal is to evaluate it on user inputs without the model operator seeing those inputs.

These are complementary protections with different cost profiles. Federated training is mature and deployed at scale. Private inference via MPC or HE is substantially more expensive and more limited in what models it can support. A full privacy stack for sensitive applications might ultimately need both: federated training to protect training data, and private inference to protect query data.

## 5. Practical Deployment Guidance

The techniques above exist on a spectrum from "deployable today in production" to "research frontier." Choosing the right approach requires matching the technique to the threat model and the model complexity.

### Scenario 1: Healthcare — Patient Data Submitted to AI Diagnostic Tool

**Threat model:** HIPAA-covered entity submitting patient records (diagnoses, lab values, clinical notes) to a cloud AI inference API. Primary concern: provider infrastructure staff or a breach could expose PHI.

**Recommended approach: TEEs.**

Azure Confidential VMs (AMD SEV-SNP) can run existing inference stacks with relatively modest integration work — the isolation is at the VM level, so existing software runs inside the protected boundary without restructuring. AWS Nitro Enclaves, by contrast, require a more significant architectural change: the enclave is a fully isolated environment with no persistent storage, no interactive access, and only a local vsock connection to the parent EC2 instance. Applications must be refactored into a parent/enclave split-architecture pattern where sensitive data is passed through the vsock interface, processed inside the enclave, and encrypted results are returned. This is a real engineering investment, not a drop-in deployment, but the operational maturity of the Nitro attestation and KMS integration makes it a well-documented path.

For either platform, the attestation workflow can provide hardware-rooted evidence that:
1. The VM or enclave configuration (firmware, launch state) matches the expected measurements.
2. The hardware satisfies the expected security configuration.
3. Memory isolation from the host hypervisor is in effect.

Application-level code version verification (binding a specific inference server binary to the attestation) requires additional tooling on top of the hardware attestation — a launch policy or a measured boot chain that includes the application. This is achievable but requires explicit configuration beyond the default TEE deployment.

The protections these TEEs provide are strong against the specific threat model: a curious or compromised cloud provider's infrastructure staff cannot read plaintext patient data during inference within the protected boundary, and this protection is hardware-enforced rather than purely contractual. Side-channel residual risks (as described above) remain.

The deployment overhead is manageable (5–15% for CPU-side TEEs on modern hardware), and existing inference frameworks (PyTorch, TensorFlow) can run inside TEEs without significant modification. For GPU inference, Nvidia's Confidential Computing on H100 extends this protection to the GPU, though with less deployment maturity as of 2025–2026.

A critical architectural note: TEEs protect data *within* the isolated boundary. If TLS terminates outside the confidential VM (at a load balancer, API gateway, or reverse proxy), if the request passes through logging infrastructure on the parent instance before reaching the enclave, or if telemetry captures query content before it enters the TEE, the provider can still see plaintext at those points — the TEE's protection begins where the data enters the isolated boundary, not at the client. The correct deployment pattern terminates TLS *inside* the confidential VM or enclave, with the TLS private key provisioned via attestation-gated key management (e.g., KMS in the AWS case, or equivalent). Deploying an inference service inside a TEE without ensuring the full data path enters the TEE is a partial deployment that may create compliance-documentation risk without the actual technical protection.

HE is not practical for this scenario unless the AI task is a simple logistic regression or decision tree. LLM-based clinical note analysis under FHE is not deployable at any reasonable latency.

### Scenario 2: Financial Services — Fraud Detection on PII-Rich Transaction Records

**Threat model:** Bank running fraud detection; transaction records contain customer PII. Model is a proprietary gradient boosted tree or small neural network. Concerns: regulatory requirements (GDPR, CCPA), model IP protection, query privacy.

**Recommended approach: HE for simple models; TEEs for complex models.**

For gradient boosted trees and logistic regression models over tabular features (fraud detection is often this), Zama's Concrete ML provides a deployable path. Published benchmarks show decision tree and logistic regression inference in seconds to minutes under FHE. For a fraud detection pipeline where latency requirements are seconds-to-minutes rather than milliseconds, this is practical.

If the model complexity requires a neural network that HE can't handle at acceptable latency, TEEs are again the fallback. MPC is worth evaluating if both the bank (holding transaction data) and the model provider (holding weights) are willing to run co-located or low-latency infrastructure — the communication overhead of MPC makes it impractical over wide-area networks for real-time fraud detection.

### Scenario 3: Legal — Privileged Documents Submitted to AI Review Tool

**Threat model:** Law firm sending privileged client communications to an AI review tool. Attorney-client privilege creates strong legal obligations; no regulatory framework mandates a specific technical approach, but technical confidentiality strengthens the privilege argument.

**Recommended approach: TEEs, or strong contractual/audit controls if TEE deployment is not feasible.**

The honest pragmatic choice: if the AI review vendor does not offer a TEE-based deployment and cannot support one, the alternative is strong contractual obligations (BAA-equivalent for legal data), documented access controls at the vendor, and periodic audit rights. This is not a technical guarantee — it is a legal and operational one. For matters where privilege risk is extreme, the honest advice is to run the AI inference on-premises rather than in a cloud API.

### When to Accept Contractual Controls Instead

Not every use case requires cryptographic or hardware-enforced confidentiality. The honest framing is a cost-benefit calculation:

**Factors favoring technical controls (TEEs/HE/MPC):**
- Regulatory environment explicitly requires technical safeguards (HIPAA Security Rule, EU AI Act Article 10 data governance requirements)
- Data sensitivity is high and breach consequences are severe (patient data, privileged legal communications)
- Multiple parties have conflicting interests in data access (MPC scenario)
- Model IP is valuable and must be protected from the data provider

**Factors where contractual/audit controls may suffice:**
- Provider is a large, regulated entity with documented security practices and liability exposure
- Data sensitivity is moderate (business queries without PII)
- Cost and latency constraints make TEE/HE/MPC deployment impractical
- Applicable regulatory framework does not mandate technical controls

The risk of defaulting to contractual controls for high-sensitivity data is that a breach at the provider creates liability that no contract can remedy after the fact. Technical controls (TEEs, HE, MPC) eliminate specific provider-side risks — provider infrastructure staff seeing plaintext, a breach exposing query data — but they do not remove all risks. Residual risks include side-channel attacks on access patterns, implementation bugs in the TEE-protected code, key management failures, and compromise of the client endpoint before data is encrypted. The choice is between a provider who *contractually* cannot read your data, and a provider whose infrastructure is *technically constrained* from reading your plaintext during the protected portion of the data path — a meaningful difference, but not a guarantee of zero risk. Contractual controls redistribute liability; technical controls shift the residual attack surface to a smaller and harder-to-exploit target set.

## 6. Summary: Capability and Limitation Table

| Technique | Protects From | Key Limitation | Practical Today? |
|-----------|--------------|----------------|------------------|
| TEE (AWS Nitro / Azure Confidential VM) | Host OS, hypervisor, infrastructure staff | Side-channels; enclave-internal bugs; GPU gap (improving) | Yes — GPU/CPU inference at near-normal latency |
| Homomorphic Encryption (CKKS / TFHE) | Computation provider sees only ciphertext | 10,000–1,000,000× overhead for large models; LLM scale not practical | Yes for logistic regression, small CNNs; No for LLMs |
| Secure MPC (CrypTen / SPDZ) | Both parties' private inputs | Communication overhead; requires coordinated infrastructure | Yes for structured data / small models; impractical at LLM scale over WAN |
| Contractual + audit | Legal/compliance framing | No technical guarantee; breach liability remains | Yes, but provides no cryptographic protection |

## 7. The Trajectory

The gap between what is technically possible and what is deployable is closing, but unevenly. TEEs are mature and practical for CPU-side inference today; the GPU extension is the near-term frontier. Homomorphic encryption for ML is on a fast improvement trajectory — Zama's Concrete ML demonstrates that the developer experience barrier is falling, and hardware acceleration (FHE-specific ASICs are a research and early product area) will eventually change the latency picture. MPC frameworks like CrypTen make the technique accessible to ML practitioners, but network communication remains the dominant cost.

For practitioners deploying AI in regulated environments today, the decision tree is relatively clear: if you need hardware-enforced confidentiality and run complex models, TEEs are the answer. If you run simple models and need provable cryptographic guarantees, HE is feasible. If you have a two-party scenario where both parties want mutual privacy, MPC is worth the infrastructure cost. If none of these are feasible, honest risk assessment and contractual controls are the fallback — and the practitioner should document clearly what those controls do and do not guarantee.

The post on differential privacy in this series showed that "differentially private" means something precise and often weaker than advertised. The techniques in this post have the same property: "running in a TEE" means something precise — hardware memory isolation and remote attestation — and does not mean "cryptographically guaranteed to be invisible to all adversaries." Making the distinction between what techniques guarantee and what they don't is the foundation of responsible deployment.

---

*Previously in the computational privacy track: [Differential Privacy in Practice](./differential-privacy-epsilon-guarantees-ai-training) · [Federated Learning Poisoning](./federated-learning-poisoning-the-aggregation-attack-surface). Also relevant: [Gradient Inversion Attacks](./gradient-inversion-attacks-reconstructing-private-training-data) · [RAG Privacy Attacks](./rag-privacy-attacks-retrieval-data-exfiltration).*
