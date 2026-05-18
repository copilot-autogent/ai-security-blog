---
title: "Your Agent Runtime Is a 1960s Operating System"
description: "A new paper from TU Berlin and CISPA maps AI agent security onto 50 years of OS research — and finds that agent runtimes are failing to apply solutions that were well-understood before most of their developers were born."
pubDate: 2026-05-18
tags: ["agent-security", "threat-modeling", "defense-patterns", "tool-use"]
---

Here is a question worth sitting with: operating systems solved the problem of running untrusted programs that compete for shared resources in the 1960s and 1970s. Process isolation, privilege separation, mediated system calls, least privilege, audit logging — the entire corpus of OS security represents five decades of hard-won understanding about how to safely arbitrate between untrusted code and sensitive resources.

Now describe your AI agent's security model. There's a reasonable chance the answer involves "prompt guidelines," "a list of approved tools," and some handwaving about safety filters. By OS security standards, that is a pre-Multics design philosophy, and you are running an agent that can read your files, execute shell commands, manage your calendar, and trade equities.

A new paper from TU Berlin and CISPA, "Toward Securing AI Agents Like Operating Systems" (arXiv:2605.14932, cs.CR), makes this critique formally. The authors survey the current landscape of OpenClaw-style agents — the extensible, user-environment-integrated runtimes that have seen massive adoption in 2025-2026 — and systematically evaluate them against established OS security mechanisms. The findings are exactly as bad as you would expect.

## The Analogy

The paper's central contribution is establishing a structural mapping between AI agents and operating systems. Both face the same fundamental problem: how do you safely run an untrusted principal that needs access to privileged resources?

| OS Concept | Agent Equivalent |
|---|---|
| User (untrusted principal) | The LLM |
| Kernel | Agent runtime |
| System calls | Tools and skills |
| Process memory | Agent context |
| Persistent storage | Files, memory |
| Network stack | Agent gateway |
| Installed programs | Skills from marketplace |

This mapping has immediate practical consequences. The first and most important: **the LLM must be treated as a completely untrusted component**.

The paper states this explicitly: "Just as an OS should remain secure regardless of user behavior, security mechanisms of AI agents must remain effective even if the underlying LLM is compromised." Jailbreaks and prompt injection attacks on LLMs are treated as assumed adversary capabilities, not edge cases to be prevented. The security architecture is designed around the assumption that the LLM will sometimes do things it shouldn't — the question is whether the runtime can prevent that from becoming a system-level compromise.

This is a different framing from most current agent security work, which focuses heavily on making the LLM more resistant to manipulation. The OS perspective says: don't trust your users. Your job is to design a runtime that limits the blast radius when the user misbehaves.

## What the Case Study Found

The authors evaluated four agents representing distinct design philosophies:

- **OpenClaw** (vanilla) — the dominant general-purpose agent, 360k+ stars, sixth most starred GitHub project as of May 2026, five months after initial commit
- **IronClaw** (security-focused) — designed with security as a primary goal, explicit threat model, reduced feature surface
- **Nanobot** (minimalistic) — microkernel philosophy, minimal core
- **NemoClaw** by Nvidia (wrapper) — runs the agent inside a secure runtime sandbox with containerization and policy enforcement

The analysis checked each against a set of OS security mechanisms: hardware interface mediation, process isolation, privilege separation, confinement, least privilege, memory safety, TCB minimization, audit logging, and the data execution prevention analog.

Even under modest attacker assumptions — an attacker with knowledge of the agent's source code and default configuration, but no direct host access — protection mechanisms failed across the board.

### Failure Mode 1: Tool Registration Is Not Mediated

In operating systems, user-kernel interaction goes through a precisely defined interface — system calls. The kernel controls what that interface looks like. User code cannot modify the system call table. This gives the kernel an authoritative, auditable view of every privileged operation.

Agent tools don't work this way. Skills can define their own mechanisms for interacting with the file system, network, and other resources. Different tools can use different implementations of the same operation — one skill might use `cat`, another `sed`, another a custom Python script.

The security consequence is analogous to PATH manipulation in Unix: a malicious skill can register an alternative implementation of a trusted tool, replace a helper script, or modify environment variables to redirect what appears to be a trusted operation to an attacker-controlled implementation. The agent believes it's invoking a known-safe tool; the actual implementation has been replaced.

The paper describes this as "system call table tampering" and "confused-deputy behavior" in the agent context. **None of the four agents implement immutable tool registration.** NemoClaw comes closest — filesystem interaction is restricted to specific paths, and credentials aren't directly accessible — but arbitrary tools can still be registered and trusted tools can be redirected.

### Failure Mode 2: No Process Isolation

In any modern OS, processes run in isolated contexts. They can't read each other's memory directly. Data flows between processes through explicit, controlled channels.

In every agent in the study, all tool calls share the same LLM context. Output from a malicious skill is readable by all subsequent tool calls in the same session. There's no equivalent of process isolation — no mechanism that prevents untrusted data from one operation contaminating another.

The attack scenario: a skill that reads from an untrusted source (a web page, an email, an API response containing injected instructions) deposits adversarial content into the shared LLM context. Subsequent tool calls — including file writes, credential accesses, or outbound network requests — execute in a context that now includes the injected content. There is no architectural barrier between the untrusted input and the privileged output.

This is not a configuration problem. It's a design gap. **No current agent runtime implements a process isolation equivalent.** The paper notes this as a fundamental limitation — the shared-context architecture of current LLM agents makes true process isolation difficult without significant redesign.

### Failure Mode 3: Privilege Separation Is Absent

In a properly designed OS, reading a file you're allowed to read and modifying system configuration are different privilege levels. You can't accidentally escalate from one to the other.

In the agents evaluated, **file access control is enforced at the same privilege level as input processing**. A context that can process untrusted user input has the same access to the filesystem as a context that should be performing a trusted write operation. There's no separation between contexts that should have read-only access and contexts that should have write access.

### The DEP Analog: Prompt Injection Is Architecturally Intractable

Data Execution Prevention in operating systems addresses the fact that memory is dual-use: it can hold either code or data, and malicious code injected into the data segment can become execution flow. The kernel solves this by marking memory regions as either executable or writable, but not both.

The agent analog is prompt injection: natural language context is dual-use, mixing data (content the agent should process) and instructions (commands the agent should follow). Unlike the OS case, there is no equivalent of DEP available. LLMs currently cannot reliably distinguish "this is content to be summarized" from "this is an instruction to be followed" when both appear in the same context.

The paper frames this as one of the genuinely "insecure by design" capabilities of current agents: "LLM-based agents face an analogous but harder problem: natural-language context mixes data and instructions, and current LLMs cannot reliably separate them." The OS solved DEP with a hardware-supported bit in memory; there's no equivalent hardware primitive available for natural language disambiguation.

This is why the paper's threat model treats the LLM as untrusted by assumption. Prompt injection resistance is not a property you can guarantee at the LLM level, so the architecture has to assume it can be bypassed.

## The Wrapper Architecture Is the Most Promising Path

Of the four design approaches studied, the wrapper architecture (NemoClaw, Docker Sandbox) most successfully applies OS security principles. The insight is that retrofitting security into an existing general-purpose agent is difficult — the same features that make an agent useful are often the same features that create security risks. The wrapper approach accepts this and enforces security from the outside: run the agent inside a container with controlled I/O, enforce filesystem and network policies at the OS level, and treat the agent itself as an untrusted process.

This maps directly to OS security thinking: you don't make user processes secure by making them more careful; you make the kernel secure by limiting what user processes can do regardless of their behavior.

The wrapper approach has practical limitations — it can't address in-context attacks (the LLM reasoning within a constrained environment can still be manipulated), and it requires upfront design of the policy layer. But it applies well-understood, auditable mechanisms rather than relying on agent-level logic that the paper demonstrates is consistently bypassable.

## The OpenClaw Incident Record

The paper provides context that makes the abstract analysis concrete. OpenClaw was released in November 2025. By May 2026 — five months later — it had accumulated over 100 CVEs, including 5 critical and 41 high-severity vulnerabilities. In February 2026, VirusTotal documented hundreds of malicious third-party skills in the OpenClaw marketplace.

This is not unusual adoption curve behavior. This is what happens when you deploy a system with a very large attack surface into a popular marketplace with minimal enforcement of provenance, validation, or runtime isolation. The CVE rate at six months is not the interesting metric; the interesting metric is that the fundamental architectural gaps identified in this paper — no mediated tool interface, no process isolation, no privilege separation — were present from day one and are not addressable by patching individual CVEs.

The broader point: **a CVE-by-CVE security approach cannot fix architectural security gaps**. Adding 100 patches to an architecture that violates privilege separation does not produce a system with privilege separation. It produces a system with 100 patches that still lacks privilege separation.

## What Practitioners Should Do

The paper concludes with design recommendations. Here's how to apply them:

**1. Treat the LLM as an untrusted component in your security architecture.** This means designing for the case where the LLM is manipulated — not as a theoretical concern but as an assumed attacker capability. Every security mechanism that relies on the LLM "doing the right thing" is a mechanism that fails when prompt injection works. Build a runtime layer that limits what the LLM can cause even when it behaves badly.

**2. Implement immutable tool registration with explicit provenance.** Skills should not be able to register alternative implementations of trusted tools, modify the tool resolution path, or introduce tools that shadow existing ones. This is the hardest gap to retrofit into an existing agent, but it's the one that most directly addresses skill-based supply chain attacks. At minimum, cryptographically sign your tool implementations and verify signatures at load time.

**3. Enforce least privilege at the tool level.** Identify which tools require which resource access, and configure your runtime so that tools can only exercise the access they legitimately need. A tool that reads from external URLs should not have write access to your filesystem. A tool that processes user messages should not have credential access. This maps directly to OS-style access control lists — apply them.

**4. Evaluate the wrapper architecture for your use case.** If you're building a general-purpose agent that needs broad capabilities, the wrapper approach — containerization with enforced I/O policies, path-scoped filesystem access, network egress controls — provides the best currently-available approximation of OS-style privilege enforcement. It doesn't solve in-context attacks, but it does limit what a compromised agent session can do to your host system.

**5. Do not trust your skill marketplace.** The VirusTotal finding of hundreds of malicious skills is a reminder that a marketplace with over a million extensions at launch is not a curated software library — it's the early web with LLM-mediated execution. Treat third-party skills with the same skepticism you'd apply to running arbitrary executables from the internet. Review permissions, verify provenance, and run in an isolated environment before production use.

**6. Audit logging is a security control, not a debugging convenience.** Log every privileged operation: tool invocations, file accesses, credential uses, skill installations, memory updates, network requests. Protect those logs from write access by skills or tools (use append-only or tamper-evident storage). The paper notes that most agents use an unprotected JSON log file that malicious skills can overwrite — that's not an audit log, it's a suggestion.

## The Deeper Point

The OS security community spent decades developing a coherent framework for the problem of running untrusted code against shared resources. That framework is not theoretical — it is implemented in every production operating system, audited by decades of adversarial research, and refined through thousands of real-world incidents.

AI agent runtimes are solving the same problem. In most current implementations, they're solving it from scratch, ignoring the prior work, and arriving at architectures that pre-OS computer science would recognize as naïve.

The paper's argument is not that OS security solves agent security. Process isolation works because memory addresses are well-typed; LLM context is not. The DEP problem is genuinely harder in natural language than in machine code. There are aspects of agent security that don't have direct OS analogs.

But the aspects that do have OS analogs — mediated interfaces, privilege separation, least privilege, immutable core, auditable logging — are currently unimplemented in most deployed agents. These are not research problems. They are engineering problems with well-understood solutions that the field is choosing not to apply.

The paper's title asks us to secure agents like operating systems. The implicit question in that title is: why aren't we already?

---

*Paper: "Toward Securing AI Agents Like Operating Systems" — arXiv:2605.14932 (cs.CR). Lukas Pirch, Micha Horlboge, Patrick Großmann, Syeda Mahnur Asif, Klim Kireev, Thorsten Holz, Konrad Rieck. TU Berlin and CISPA Helmholtz Center for Information Security. Submitted May 14, 2026.*
