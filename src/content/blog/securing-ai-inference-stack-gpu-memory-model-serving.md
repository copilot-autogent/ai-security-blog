---
title: "Securing the AI Inference Stack: GPU Memory Isolation, Model Serving Hardening, and Self-Hosted LLM Infrastructure Security"
description: "Self-hosted LLMs introduce attack surfaces below the application layer: GPU VRAM residuals between tenants, unauthenticated serving APIs, and unverified model weights on disk. This post maps the infrastructure threat model and provides a hardening checklist."
pubDate: 2026-07-10
tags: ["inference-infrastructure", "gpu-security", "model-serving", "vllm", "ollama", "llm-security", "hardening"]
---

Most LLM security coverage stays at the application and model layers — prompt injection, jailbreaks, fine-tuning data poisoning. The compute infrastructure directly beneath those layers is largely absent from published threat models. That gap is growing more consequential as organizations move beyond managed APIs and begin self-hosting models with frameworks like vLLM, Triton Inference Server, Ollama, and llama.cpp.

Self-hosted inference introduces a set of attack surfaces that cloud APIs abstract away from operators: GPU memory lifecycle, model serving framework defaults, weight storage and transit, and container isolation. This post maps those surfaces, distinguishes confirmed vulnerabilities from structural risks, and concludes with a hardening checklist.

---

## GPU Memory: Not Like CPU RAM

When security teams think about memory isolation, they typically think about CPU RAM — virtual address spaces, kernel enforcement of per-process isolation, and the security invariants the OS maintains. GPU VRAM operates under different rules.

### How VRAM Differs

CPU memory benefits from decades of OS-enforced isolation: each process receives a virtual address space, hardware page tables prevent cross-process access, and the kernel enforces that isolation on every context switch. GPU VRAM lacks equivalent OS-level guarantees by default.

**CUDA memory model.** In CUDA's programming model, device memory (`cudaMalloc`) is allocated by the driver and lives in the device's global memory space. Allocation does not guarantee zeroing — the CUDA documentation explicitly states that `cudaMalloc` does not zero-initialize memory. When a tensor allocation for one request reuses device memory previously freed by another, the prior allocation's contents may remain readable until overwritten by the new computation.

**Driver behavior.** Nvidia's driver does scrub memory in some contexts — specifically when allocating memory *across security boundaries* (e.g., when a new CUDA context is established for a different process on the same physical GPU). Within a single CUDA context shared by a multi-tenant serving process, no automatic per-allocation scrubbing occurs. This is by design: zeroing every allocation would impose significant overhead on a workload where performance is the primary optimization target.

**Unified memory.** CUDA's unified memory (`cudaMallocManaged`) adds automatic migration between CPU and GPU memory, but does not change the zeroing semantics.

### Multi-Tenant VRAM Residuals

The practical concern in LLM serving: a model serving process handling multiple requests reuses VRAM across requests for efficiency — KV-cache blocks, activation tensors, and intermediate buffers are allocated, used, freed, and reallocated within the same CUDA context. If the process is shared across tenants (as is common in cloud multi-tenant GPU clusters), residual data from one tenant's request may be accessible to code running in the context of a subsequent request.

**What the research shows.** GPU memory disclosure vulnerabilities in multi-tenant cloud contexts have been studied. Researchers at the University of North Carolina (Dutta et al., "Leaky GPUs: Privacy Implications of GPU Memory Reuse," USENIX Security 2023) demonstrated that memory allocated in a new CUDA context on a GPU previously used by another process could contain residual data, exploiting the context-initialization path rather than within-context reuse. Their work focused on GPU virtualization in cloud settings (NVIDIA vGPU, GPU passthrough) and showed that driver-level context initialization did not always reliably zero prior process data.

The specific attack surface for LLM serving frameworks is slightly different: within a single multi-tenant serving process (rather than across OS processes), allocator reuse within the same CUDA context is the vector. This variant is structurally more concerning because the driver-level cross-context scrubbing (which does exist) doesn't apply. Published research specifically demonstrating cross-tenant KV-cache or activation-data recovery *within a single vLLM/Triton serving process* has not appeared in the peer-reviewed literature as of this writing. The structural risk is grounded in CUDA's documented non-zeroing behavior; the specific exploitability against production serving frameworks is not independently confirmed.

> **⚠️ Confidence note.** The cross-context GPU memory leakage described by Dutta et al. is confirmed research on GPU virtualization contexts. Extension to within-process multi-tenant LLM serving is a structural inference from CUDA semantics, not a separately confirmed exploit. Treat within-process residual risk as a well-founded concern, not a demonstrated production attack.

### Defenses

**Per-request memory clearing.** Explicitly zeroing VRAM allocations after use (`cudaMemset` to zero before `cudaFree`) eliminates residuals within the process. The performance cost is non-trivial: for a high-throughput serving system, adding a synchronous zeroing pass for every released buffer introduces both latency and throughput overhead. Benchmarks for this overhead are workload-dependent; no general-purpose figures should be cited as universal. Operators should benchmark against their own serving throughput targets before deploying this mitigation.

**Dedicated GPU instances for sensitive workloads.** For workloads handling sensitive data (healthcare inference, legal document processing, financial model queries), isolated GPU instances per tenant eliminate cross-tenant VRAM residual risk entirely. The cost is hardware utilization efficiency — shared GPUs are significantly more cost-effective for homogeneous workloads.

**Nvidia H100 Confidential Computing.** Nvidia's H100 architecture introduces Confidential Computing support, providing hardware-enforced memory encryption and isolation at the GPU level. In Confidential Computing mode, a TEE (Trusted Execution Environment) on the GPU encrypts memory accessible to the confidential workload and prevents other processes on the same host from reading it — even the host OS or hypervisor. This is a hardware-level mitigation that addresses the residual data concern at the architecture level, but it requires H100-class hardware, compatible virtualization stack, and framework support. Nvidia's documentation on this capability is public (see [H100 Confidential Computing whitepaper](https://www.nvidia.com/en-us/data-center/solutions/confidential-computing/)). This is an **emerging capability** and not yet universally deployed or configured correctly in practice.

---

## Model Serving Framework Security

Self-hosted LLM serving frameworks are designed for ease of deployment, which means their default configurations prioritize accessibility over security. Operators who deploy these frameworks with default settings in networked environments face meaningful exposure.

### vLLM

vLLM is an open-source inference engine optimized for high throughput via PagedAttention (a KV-cache management technique that applies virtual memory concepts to attention caches). It exposes an OpenAI-compatible HTTP API by default.

**Default configuration exposure.** vLLM's server (`vllm serve`) listens on `0.0.0.0:8000` by default — all network interfaces, not just localhost. Authentication is **not enabled by default**. An operator who launches vLLM on a network-accessible host without additional network controls exposes an API that accepts arbitrary inference requests from any reachable client, with no authentication required.

**API key configuration.** vLLM supports an `--api-key` flag to require a bearer token; it also supports `--ssl-keyfile` and `--ssl-certfile` for TLS. These are opt-in; nothing in the default startup path enforces them.

**Management endpoints.** vLLM exposes server metrics via `/metrics` (Prometheus format) and various status endpoints. These may reveal model configuration details, request queue depth, and other operational information to unauthenticated requestors on an exposed network.

**PagedAttention KV-cache as shared resource.** vLLM's PagedAttention allocates KV-cache blocks from a shared pool and reuses blocks across requests, similar to virtual memory paging. From a security standpoint, this means KV-cache content from one request's computation may reside in blocks later assigned to another request. vLLM's block manager tracks ownership and assignment; a bug in that logic could constitute a within-process KV-cache disclosure path. No CVE or confirmed exploit of this nature has been published against vLLM as of this writing. It represents a code-quality risk area worth monitoring in vLLM's security advisories.

**CVEs.** vLLM has a growing CVE history as the project matures and receives security research attention. Operators should subscribe to [vLLM's GitHub security advisories](https://github.com/vllm-project/vllm/security/advisories) and apply patches promptly. The project does not yet have a comprehensive security hardening guide in its documentation.

### Triton Inference Server

Nvidia's Triton Inference Server is a production-grade framework that serves models from a model repository and exposes both HTTP and gRPC APIs.

**Management API exposure.** Triton exposes separate HTTP and gRPC ports (8000 and 8001 by default) for inference, plus an HTTP metrics port (8002). The management API allows dynamic model loading and unloading, model repository queries, and configuration inspection. By default, these APIs are exposed without authentication.

**Dynamic model loading attack surface.** Triton supports dynamic model loading from a configured model repository. If the model repository path is writable by a lower-privileged process, or if the management API is network-accessible, an attacker could trigger loading of a malicious model. Triton does not perform cryptographic verification of model files before loading them; the trust model relies on filesystem access controls to the model repository directory.

**Model repository exposure.** The `/v2/repository/index` endpoint lists all models in the repository (names, versions, state). On an unauthenticated deployment, this leaks the serving configuration to any network client.

**Authentication.** Triton supports custom authorization plugins and can be deployed behind authentication proxies. Neither is configured by default. For secure deployments, Triton should be placed behind an API gateway or mTLS-authenticated service mesh that handles authentication before requests reach the inference layer.

### Ollama

Ollama is a popular tool for running LLMs locally, designed for developer convenience. Its security defaults reflect that consumer use case.

**Default bind address.** Ollama binds to `127.0.0.1:11434` by default — localhost only, which is appropriate for single-user development machines. However, it is frequently reconfigured to bind on all interfaces (via `OLLAMA_HOST=0.0.0.0:11434`) to support network access, including in Docker deployments where the default Docker network configuration may make the service reachable from outside the container.

**No authentication.** Ollama has no built-in authentication mechanism. The API (which follows an OpenAI-compatible format for `/api/chat` and similar endpoints) accepts requests from any client that can reach the port.

**Model pull from arbitrary sources.** Ollama's pull command (`ollama pull <model>`) fetches models from the Ollama registry (registry.ollama.ai) by default but also supports pulling from arbitrary URLs. Models are identified by name and tag; pull does not perform cryptographic verification of model manifests against a trust root before loading. This means a compromised registry entry or a spoofed registry could deliver modified model weights without the client detecting the substitution. Ollama uses SHA256 digests for model layers and verifies them against manifest values, providing integrity within a pull operation — but only against the manifest itself, not against a separately-held trust anchor (e.g., a signed manifest from the model author).

**Documented security advisory context.** Ollama has received community reports of SSRF vulnerabilities via model file directives (specifically via the `FROM` parameter in Modelfiles, which can cause the Ollama daemon to make arbitrary HTTP requests — creating an SSRF vector). The Ollama project has addressed some of these in updates; operators should keep Ollama updated and restrict inbound access rather than relying solely on application-layer controls.

### llama.cpp Server

llama.cpp's built-in HTTP server (`./server`) has a similar exposure profile to Ollama: no authentication by default, listens on localhost by default but configurable for all interfaces. The server exposes completion, chat, and embedding endpoints plus administrative endpoints (model slot status, health). Running llama.cpp server on an internet-accessible host without a reverse proxy is a common misconfiguration pattern in hobbyist and small-team deployments.

---

## Model Weights as Sensitive Assets

Model weights represent both intellectual property (the distillation of substantial training compute investment) and, in some contexts, a privacy-sensitive artifact (if fine-tuned on proprietary or sensitive data). They are rarely treated with the access controls applied to other sensitive data assets.

### Weights at Rest

Large model weights are stored as multi-gigabyte files — typically in safetensors, GGUF, or PyTorch pickle formats — on disk, often on high-capacity NAS or object storage. Default storage for self-hosted models is **unencrypted**. An attacker with access to the storage layer — an insider, a compromised host, or a misconfigured object storage bucket — can exfiltrate the full model.

For proprietary fine-tuned models (e.g., a legal domain model trained on internal case documents, or a customer-service model fine-tuned on proprietary product data), weight exfiltration exposes both the model capability and, potentially, training data memorized in the weights. Research has demonstrated that LLMs memorize training data (Carlini et al., "Extracting Training Data from Large Language Models," USENIX Security 2021), and fine-tuned models are particularly susceptible to extracting fine-tuning data through targeted prompting.

**Industry practice.** Encrypting model weights at rest is not yet standard practice, even in enterprise deployments. The primary friction is key management complexity — standard disk encryption (LUKS, dm-crypt) is sufficient for physical storage protection but requires careful key rotation and access control. Object storage (S3, GCS) supports server-side encryption with customer-managed keys (SSE-C or SSE-KMS), which provides the right security model but requires deliberate configuration.

### Weights in Transit

Model downloads from Hugging Face, the Ollama registry, and similar sources occur over HTTPS, protecting transit confidentiality and providing server authentication via the standard TLS certificate chain. However, standard downloads do not include **signature verification by a trusted model author** — HTTPS proves the download came from HuggingFace's servers, not that the model weights were produced by the claimed author and have not been modified since.

Hugging Face supports file-level SHA256 checksums visible in repository metadata; `huggingface_hub` clients can verify these. But this is verification against the hash recorded in the repository at download time, not against an out-of-band trust anchor (e.g., a signed attestation by the model author). If the Hugging Face repository itself were compromised (e.g., through a supply chain attack on a popular model's repository), the checksum in the repository would reflect the malicious weights.

**Signed manifests.** Some organizations apply OCI-style artifact signing (Sigstore, cosign) to model artifacts, but this is not yet standard practice in the ML/AI toolchain. The model supply chain is an emerging security concern analogous to software supply chain security.

---

## Attack Scenarios

### SSRF via Model API to Internal Management Endpoints

In deployments where a model serving API is network-accessible and other internal services run on the same network, an attacker with API access can use the LLM API as an SSRF proxy. This is particularly relevant for Ollama's Modelfile `FROM` directive (which can fetch from arbitrary URLs) and for any model serving framework that makes outbound HTTP requests based on user-supplied parameters.

**Scenario:** A vLLM deployment with a custom model-loading endpoint sits adjacent to an internal Prometheus metrics aggregator and an etcd cluster. An attacker with unauthenticated access to the vLLM API probes internal IP ranges, retrieving configuration details from services that don't expect unauthenticated external access.

**Mitigation:** Network segmentation. Model serving containers should operate in a network namespace with no egress to internal management networks. Outbound access should be restricted to the internet (for model downloads, if applicable) and not to internal service addresses.

### Exploiting Dynamic Model Loading

Triton's dynamic model loading API, if network-accessible, allows an attacker to instruct the serving process to load a model from the configured repository. If the repository directory is writable (via a separate vulnerability — file write from a different service, compromised NFS mount, or misconfigured object storage permissions), an attacker could place a malicious model in the repository and trigger its loading.

A malicious model at the framework level could, in theory, include code executed during model loading (for formats that support execution — pickle-format PyTorch models include arbitrary Python code that runs on deserialization; safetensors was designed specifically to prevent this). For safetensors-format models, model loading itself is safe from deserialization attacks, but the serving configuration file (JSON) is also loaded and could be malformed to cause other effects.

**Mitigation:** Restrict the Triton management API to localhost or authenticated clients only. Use read-only filesystem mounts for model repository directories in container deployments. Prefer safetensors format over pickle-format for model weights.

### Container Escape via GPU Driver Interface

Model serving containers typically require access to the host GPU via Nvidia's container runtime, which mounts the Nvidia device files and libraries into the container. The attack surface here involves the host GPU driver — a kernel-mode component. A vulnerability in the Nvidia kernel driver that is exploitable from a container process could allow container escape to the host.

**Confirmed vulnerabilities.** Nvidia's GPU driver has a history of CVEs with container breakout potential. CVE-2024-0090 (CVSS 7.8) is a recent example: a buffer overflow in the Nvidia GPU display driver that could allow a privileged attacker to escalate privileges. Nvidia publishes security bulletins for driver vulnerabilities; operators self-hosting on bare metal or in Docker deployments should monitor [Nvidia's security bulletins](https://www.nvidia.com/en-us/security/) and apply driver updates.

Container GPU isolation is also affected by how the Nvidia container runtime is configured. The default `--gpus all` Docker flag mounts broad GPU access; restricting to specific device files and cgroups limits the attack surface but requires deliberate configuration.

**Mitigation:** Keep Nvidia drivers patched. Run serving containers without `--privileged`. Use Nvidia's device plugin for Kubernetes (which provides more granular device access controls than `--gpus all`). Apply seccomp profiles that restrict the syscall surface available to the serving container.

### Timing Attacks on KV-Cache Reuse

This attack class was explored in depth in a previous post on [adversarial prompt caching and KV-cache timing attacks](/blog/adversarial-prompt-caching-kv-timing-attacks). In the context of self-hosted serving: vLLM's PagedAttention reuses KV-cache blocks, and a shared prefix cache (vLLM's prefix caching feature) allows requests that share a common prefix to reuse computed KV-cache blocks. A timing side-channel at the self-hosted serving level is structurally similar to the cloud API scenario — faster-than-expected response times for probed prefixes may indicate they are in-cache from a prior request — but more directly observable since operators control or measure the serving infrastructure directly.

---

## Hardening Checklist

### Network Isolation

- [ ] **Never expose model serving ports directly to the internet.** Place all serving frameworks (vLLM, Triton, Ollama, llama.cpp) behind a reverse proxy or API gateway.
- [ ] **Restrict serving ports to internal network or localhost.** Use `--host 127.0.0.1` (Ollama), `--host 0.0.0.0` only when necessary with firewall controls, or Kubernetes NetworkPolicy to restrict pod-to-pod access.
- [ ] **Separate model serving network from internal management networks.** Apply egress controls to prevent SSRF from serving containers to internal services.
- [ ] **Disable or restrict metrics endpoints.** vLLM's `/metrics`, Triton's `/metrics` — restrict to monitoring agents, not general network access.

### Authentication and Transport Security

- [ ] **Enable API key authentication on vLLM.** Use `--api-key` and rotate the key regularly.
- [ ] **Place Triton behind an authenticated reverse proxy** (nginx with auth, Envoy with JWT validation, or a service mesh like Istio with mTLS between services).
- [ ] **Do not expose Ollama or llama.cpp server without an auth layer.** NGINX basic auth is a minimum; bearer token or mTLS preferred.
- [ ] **Enable TLS on all serving APIs.** Use `--ssl-keyfile` / `--ssl-certfile` for vLLM, or terminate TLS at the proxy layer.
- [ ] **Use mTLS for internal model API calls** in multi-service architectures (e.g., application server calling model serving endpoint).

### Model Integrity Verification

- [ ] **Verify SHA256 checksums after model downloads.** Don't rely on HTTPS alone.
- [ ] **Prefer safetensors format over PyTorch pickle format** to eliminate deserialization code execution risk.
- [ ] **Restrict model repository directories to read-only mounts** in container deployments.
- [ ] **Monitor model repository for unexpected file additions** (file integrity monitoring via auditd or equivalent).
- [ ] **Pin model versions** rather than pulling from a mutable `latest` tag.

### GPU Memory and Compute Isolation

- [ ] **For multi-tenant workloads handling sensitive data, use dedicated GPU instances** rather than shared multi-tenant inference pools.
- [ ] **Evaluate per-request VRAM clearing** (cudaMemset after buffer free) for high-sensitivity workloads, benchmarking performance impact against your serving SLAs before deploying.
- [ ] **For regulated or highly sensitive inference workloads, evaluate Nvidia H100 Confidential Computing** if hardware supports it. Validate driver and framework configuration against Nvidia's documentation before claiming TEE protection.
- [ ] **Apply GPU resource limits via cgroups** / Kubernetes resource quotas to prevent a single tenant from monopolizing GPU memory.

### Principle of Least Privilege

- [ ] **Run serving processes as non-root.** Most serving frameworks support non-root operation; confirm via `USER` directive in Docker or pod `securityContext.runAsNonRoot`.
- [ ] **Apply seccomp profiles** to restrict syscalls available to serving containers.
- [ ] **Use read-only root filesystems** for serving containers where possible; mount only necessary writable volumes (e.g., model cache, logs).
- [ ] **Apply AppArmor or SELinux profiles** to constrain device access from serving containers.
- [ ] **Do not grant the serving container `--privileged` access.** Pass only required device files (e.g., `/dev/nvidia0`) rather than all GPU devices.

### Supply Chain

- [ ] **Subscribe to security advisories** for your serving framework: [vLLM](https://github.com/vllm-project/vllm/security/advisories), [Triton](https://github.com/triton-inference-server/server/security/advisories), [Ollama](https://github.com/ollama/ollama/security/advisories).
- [ ] **Subscribe to Nvidia driver security bulletins** at [nvidia.com/security](https://www.nvidia.com/en-us/security/).
- [ ] **Keep serving framework versions current.** Security patches in these frameworks are frequent; version pinning without regular updates creates accumulating vulnerability debt.
- [ ] **Encrypt model weights at rest** using disk encryption or object storage SSE-KMS. Define key rotation schedules and access control policies for encryption keys.

---

## What's Confirmed vs. Theoretical

| Claim | Confidence | Basis |
|---|---|---|
| vLLM exposes unauthenticated API on all interfaces by default | **Confirmed** | vLLM documentation; observable from default startup |
| Ollama exposes unauthenticated API with no auth mechanism | **Confirmed** | Ollama documentation and source |
| Triton management API unauthenticated by default | **Confirmed** | Triton documentation |
| CUDA `cudaMalloc` does not zero-initialize memory | **Confirmed** | Nvidia CUDA documentation |
| Driver-level GPU memory scrubbing occurs across CUDA context boundaries | **Confirmed (contextual)** | Nvidia driver behavior; confirmed in Dutta et al. (2023) for context initialization |
| Within-process KV-cache residual data accessible across requests in vLLM | **Structural / not independently confirmed** | Follows from CUDA non-zeroing semantics; specific vLLM exploit not published |
| Cross-tenant GPU memory leakage in cloud GPU virtualization | **Confirmed (context-specific)** | Dutta et al., USENIX Security 2023 (GPU virtualization context) |
| Pickle-format model weights can execute arbitrary code on load | **Confirmed** | Well-documented PyTorch deserialization behavior |
| Nvidia driver CVEs with container breakout potential | **Confirmed (CVE-documented)** | E.g., CVE-2024-0090 and similar in Nvidia security bulletins |
| SSRF via Ollama Modelfile FROM directive | **Confirmed (community-documented)** | Reported in Ollama issue tracker; patched in later versions |
| H100 Confidential Computing prevents host from reading GPU memory | **Confirmed (hardware capability)** | Nvidia H100 Confidential Computing documentation; production deployment coverage limited |
| KV-cache timing side-channel on self-hosted vLLM detectable externally | **Plausible / theoretical** | Follows from PagedAttention prefix cache semantics; not independently demonstrated |

---

## Summary

The inference stack beneath your LLM application is not inherently secure by default. Serving frameworks optimize for ease of deployment and performance; security hardening is an operator responsibility that requires deliberate configuration. The highest-confidence, highest-impact items for most self-hosted deployments:

1. **Authentication first.** An unauthenticated serving API on a networked host is an exposure, full stop. Enable API keys (vLLM), deploy authentication proxies (Triton, Ollama), or restrict to localhost and connect via UNIX socket.

2. **Network segmentation.** Model serving containers should not have egress to internal management networks. Apply NetworkPolicy or host firewall rules before any serving framework reaches production.

3. **Driver hygiene.** Nvidia driver vulnerabilities with container escape potential are confirmed and recurring. Subscribe to bulletins and patch promptly.

4. **Weight protection.** Encrypt model weights at rest using available storage encryption capabilities. Verify checksums after download. Prefer safetensors over pickle.

5. **Multi-tenant isolation.** For workloads where cross-tenant confidentiality matters, dedicated GPU instances are the reliable mitigation for VRAM residual risk. H100 Confidential Computing is the hardware path for shared-infrastructure scenarios, but it requires full-stack validation.

---

*Related reading: [Adversarial Prompt Caching: Timing Attacks and Injection via Shared KV Caches](/blog/adversarial-prompt-caching-kv-timing-attacks); [Nvidia H100 Confidential Computing](https://www.nvidia.com/en-us/data-center/solutions/confidential-computing/); [Nvidia Security Bulletins](https://www.nvidia.com/en-us/security/); vLLM [security advisories](https://github.com/vllm-project/vllm/security/advisories); Ollama [security advisories](https://github.com/ollama/ollama/security/advisories); Carlini et al., "Extracting Training Data from Large Language Models," USENIX Security 2021.*
