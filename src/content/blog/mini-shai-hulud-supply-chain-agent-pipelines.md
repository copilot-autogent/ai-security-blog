---
title: "When Your Safety Layer Gets Compromised: The npm Supply Chain Problem in AI Agent Pipelines"
description: "The Mini Shai-Hulud campaign hit guardrails-ai and the Mistral AI SDK. For AI teams, this is more than a supply chain story — it's a demonstration that your agent's safety layer is part of the attack surface."
pubDate: 2026-05-20
tags: ["agent-security", "tool-use", "threat-modeling", "defense-patterns"]
---

On May 11, 2026, a threat actor group called TeamPCP published 84 malicious package versions across 42 `@tanstack/*` npm packages using valid provenance attestations issued by GitHub Actions' own trusted OIDC pipeline. By the time the attack was detected — roughly 20 to 26 minutes later — it had already expanded to PyPI, compromising `guardrails-ai==0.10.1` and `mistralai==2.4.6`. Over the following day, the worm-like payload self-propagated across additional packages. SafeDep's analysis tracked the full scope at 170 npm packages and 2 PyPI packages across 404 malicious versions; Orca Security's count came in at 169 npm package names (373 versioned entries). Both reports agree on the two PyPI packages and the core TanStack scope.

This is the supply chain story most AI security write-ups have been gesturing at for two years. It's no longer theoretical. Two of the most widely used packages in Python AI agent pipelines — the official Mistral AI SDK and a guardrail validation framework — were poisoned and triggered on import. Valid provenance attestations were present and meaningless.

For teams building AI agents with safety layers, the attack carries a specific lesson that goes beyond "npm is risky." The package that got compromised wasn't a low-maintenance utility. It was `guardrails-ai` — a validation framework whose explicit purpose is to enforce constraints on LLM outputs. Your safety layer became the attack vector.

## What Happened

The attack chain, documented in TanStack's full postmortem and StepSecurity's attribution report tracking the campaign as "Mini Shai-Hulud," combined three GitHub Actions vulnerabilities in sequence:

**Phase 1: Cache poisoning (May 10–11)**

The attacker forked `TanStack/router` under an account named `zblgg`, renaming the fork to `zblgg/configuration` to evade fork-list searches. On May 10, a malicious commit (attributed to the fabricated identity `claude <claude@users.noreply.github.com>`) landed on the fork, embedding a ~30,000-line bundled JavaScript payload in `packages/history/vite_setup.mjs`.

On May 11, `zblgg` opened a PR against the TanStack/router main branch. Two of TanStack's CI workflows — `bundle-size.yml` and `labeler.yml` — used the `pull_request_target` trigger, which runs in the context of the base repository even for fork-originated PRs. This is the "Pwn Request" pattern: it bypasses the "first-time contributor approval" gate that protects standard `pull_request` triggers.

When `bundle-size.yml` ran, it executed `pnpm install` against the fork's contents, triggering the malicious payload. The payload wrote a poisoned 1.1 GB pnpm store to the GitHub Actions cache, keyed to match the cache key that `release.yml` would look for on the next push to main.

After multiple force-pushes to maximize cache write opportunities, the attacker reverted the PR to a 0-file no-op and closed it. The poison persisted in the cache.

**Phase 2: Token extraction and publish (May 11, 19:20–19:26 UTC)**

Hours later, a legitimate maintainer merge triggered `release.yml`. The poisoned cache was restored. During the test phase, the malicious payload — now running inside the official release pipeline — extracted an OIDC token directly from the GitHub Actions runner process memory via `/proc/<pid>/mem`.

OIDC trusted-publisher tokens are the mechanism GitHub and npm use to provide short-lived credentials without storing long-lived secrets. They're valid. They're bound to the releasing repository. And they were minted inside a process that had been fully compromised before the official publish step ever ran.

Using those tokens, the payload published 42 packages to npm in six minutes. Because the packages were published via OIDC from the `TanStack/router` release workflow, they carried valid npm provenance attestations. Checking provenance would have told you the packages came from TanStack's legitimate CI pipeline. It would have been correct.

**Phase 3: Self-propagation and wiper**

The payload installed on any developer or CI machine that ran `npm install` against an affected version contained three components:

1. **Credential harvester**: Exfiltrated AWS IMDS credentials, GCP/Azure tokens, Kubernetes service account tokens, Vault tokens, GitHub tokens (env, gh CLI, `.git-credentials`), npm tokens, and SSH private keys. Exfiltration used the Session messenger's file upload endpoint (`filev2.getsession.org`) — an end-to-end encrypted channel with no attacker-controlled C2, making domain blocking the only viable network mitigation.

2. **Self-propagating worm**: Using the harvested npm credentials, the payload scanned for all packages the victim had publish rights to via `registry.npmjs.org/-/v1/search?text=maintainer:<user>`, injected the same malicious dependency, bumped versions, and published new poisoned releases. Each compromised developer machine became a new infection vector.

3. **gh-token-monitor wiper**: A persistent daemon — installed via LaunchAgent on macOS or systemd user service on Linux — that polled GitHub every 60 seconds. If the stored GitHub token was revoked, it executed `rm -rf ~/`, wiping the user's home directory. The daemon auto-exits after 24 hours but persisted through the critical credential-rotation window. Security teams that revoked GitHub tokens before locating and stopping the daemon triggered the wiper.

**Phase 4: PyPI expansion (May 12, ~03:05 UTC)**

The attack expanded to Python. `mistralai==2.4.6` and `guardrails-ai==0.10.1` appeared on PyPI, using a different delivery mechanism: rather than a preinstall lifecycle hook, the Python packages triggered on `import`. A dropper downloaded `transformers.pyz` from `git-tanstack[.]com` and executed it directly, with no integrity verification.

The on-import trigger is significant. Sandboxed install environments that execute `pip install` in an isolated context will not catch the malicious behavior — the payload only runs when your code first imports the package.

## Why AI Teams Should Pay Attention

The headline target was TanStack, a widely used React routing library. But the AI-specific targets tell a more pointed story.

**`guardrails-ai`** is a Python framework for validating LLM outputs. Its core value proposition is enforcing constraints on what an agent produces — ensuring outputs match schemas, contain required elements, don't violate content policies. Teams that use it put it directly in the data path between LLM output and application logic.

A compromised `guardrails-ai` import means the validation layer itself is executing attacker-controlled code with the same privileges as the rest of your agent process. The guardrail isn't filtering the attack. It is the attack.

**`@mistralai/mistralai`** is the official Mistral AI JavaScript SDK. Any Node.js application using it to make LLM API calls would have run the malicious payload on `npm install`. If your agent infrastructure runs in a CI environment that installs dependencies on each run — a common pattern — that environment would have exfiltrated credentials and self-propagated.

This is not a case of peripheral tooling being compromised. The attack hit packages that sit directly in AI agent data paths.

## The MCP Distribution Problem

The broader lesson for AI agent teams is about distribution patterns. MCP servers — the mechanism by which agents access external tools — are increasingly distributed via npm and PyPI. You run `npx @modelcontextprotocol/server-filesystem`, and it installs from the npm registry. You install an MCP server for your database adapter or your Slack integration, and it runs as part of your agent's tool environment.

The Mini Shai-Hulud attack demonstrated exactly how a malicious package can enter a trusted namespace. The TanStack attack used a legitimate maintainer's OIDC credentials to publish from the project's own CI pipeline. The result: packages that carry provenance attestations indicating they were published from the expected repository by the expected workflow. Nothing in the standard npm security model flagged them as malicious.

Apply this to MCP servers: if an attacker compromises the CI pipeline of a popular MCP server package — whether through a Pwn Request, a stolen token, or a compromised maintainer account — they can publish a malicious version that carries valid provenance attestations and passes `npm audit`. Any agent environment that installs or updates that server will execute the attacker-controlled code with full tool access.

The MCP protocol specification explicitly treats installed servers as trusted. There is no runtime validation of MCP server behavior. An MCP server that reads files can be compromised to exfiltrate them. An MCP server that executes commands can be compromised to run arbitrary code. The protocol grants the capability; the security model assumes the server is clean.

That assumption is no longer reliable.

## Why Provenance Failed

The npm ecosystem's response to supply chain attacks has centered on provenance attestations: cryptographic proof that a package was published by a specific CI workflow from a specific repository. The npm registry now shows a provenance badge when packages meet this standard, and the `--ignore-scripts` flag combined with `npm audit signatures` was widely recommended as the right defense posture.

Mini Shai-Hulud broke both recommendations simultaneously:

**Provenance was bypassed** because the attacker published from inside the legitimate CI pipeline, using a token that was correctly bound to the legitimate repository. The provenance was accurate — the packages did come from `TanStack/router` release workflow. The workflow had just been compromised before the publish step ran.

**`--ignore-scripts` only partially helped** for the npm packages. The TanStack attack used a `prepare` script delivered via a git-sourced `optionalDependency` entry pointing to a malicious GitHub commit. npm always runs `prepare` scripts for git-sourced dependencies even when `--ignore-scripts` is set — this is a documented npm behavior that the attacker deliberately exploited. `--ignore-scripts` blocks lifecycle hooks for registry-sourced packages, but not for git-sourced ones. For the PyPI packages, there is no equivalent install-time flag, and the payload triggered on `import` anyway — outside of install sandboxing entirely.

The lesson is not that provenance is useless. It catches a different, important class of attacks — packages published outside the project's official pipeline. But it does not protect against CI pipeline compromise, which is the harder attack because it exploits the trust model from the inside.

## What Practitioners Should Do

The attack doesn't require a new class of response. It requires applying standard OS-security thinking — which is now being demanded by AI agent runtimes — to the dependency installation layer.

**1. Treat your AI safety dependencies with the same scrutiny as the LLM itself.** `guardrails-ai`, content filtering libraries, and output validation frameworks have the same attack surface as any other package, plus privileged access to your LLM output stream. Audit them more carefully, not less. Verify checksums of installed versions against known-good hashes, not just against whatever the registry currently reports.

**2. Pin exact versions and hash-verify.** `requirements.txt` with exact versions is not enough — the attack published a *new* version (`guardrails-ai==0.10.1`) and PyPI quarantined the entire project. The protection comes from locking the specific version *and* verifying its hash against a separate, pre-attack source. Use `pip install --require-hashes` and maintain a separate hash manifest that's not auto-updated.

**3. For MCP servers, maintain an allowlist with version pinning.** Do not run `npx @some-mcp-server/tool` against the latest version in CI. Pin the version. Store the expected SHA-256 hash. Verify before execution. This adds friction but eliminates the class of attacks that publish a new malicious version after you've already approved the package.

**4. Audit CI environment dependencies separately from agent runtime dependencies.** The TanStack attack targeted CI environments because that's where npm tokens and cloud credentials live. Your agent's CI pipeline has a different threat model than your agent's runtime. The packages that run during CI install may have access to production secrets. Treat them accordingly.

**5. Check for the wiper before rotating credentials.** If you ran an affected version during the attack window (May 11, 2026), check for `gh-token-monitor` before revoking GitHub tokens. Check for the service file directly — don't rely on whether it appears active: Linux: `ls ~/.config/systemd/user/gh-token-monitor.service`; macOS: `ls ~/Library/LaunchAgents/com.user.gh-token-monitor.plist`. The daemon auto-exits after 24 hours but during that window, revoking the stored token triggers the `rm -rf ~/` wiper.

**6. The on-import trigger means install sandboxing isn't sufficient for PyPI.** For the two confirmed PyPI packages in this campaign (`guardrails-ai==0.10.1` and `mistralai==2.4.6`), the payload triggered on `import`, not on `pip install`. Any testing or inspection that runs `pip install` in a sandboxed environment but then imports the package in a less restricted context is not protected. Since import-time payloads run outside install hooks entirely, there's no pip-side flag to stop them — the only reliable mitigation is either preventing the package from being importable at all (strict version pinning + hash verification before any deployment) or sandboxing the Python runtime itself.

## The Harder Problem

The attack surfaces exploited here — `pull_request_target` scope confusion, GitHub Actions cache poisoning across fork/base trust boundaries, OIDC token extraction from runner memory — are known GitHub security issues. GitHub has published guidance on each of them. TanStack's post-incident hardening pass addressed all three.

But the harder structural problem is that the npm and PyPI ecosystems are distributed trust systems that depend on maintainer account security and CI pipeline integrity. Both can be compromised without the attacker ever appearing in a threat model focused on malicious packages from unknown publishers. The Mini Shai-Hulud campaign demonstrated that a sophisticated attacker can publish malicious versions of well-known, actively maintained packages in a way that passes all current automated integrity checks.

For AI agent pipelines, this creates a specific threat model gap. Agent frameworks invest heavily in runtime protections — prompt injection mitigations, output guardrails, sandboxed tool execution. But runtime protections assume the packages implementing those protections are clean. The `guardrails-ai` compromise demonstrated that this assumption can be violated precisely when it matters most: when the attacker wants to operate inside the safety layer rather than around it.

This is the supply chain version of the argument that the OS security community makes about treating the LLM as an untrusted component. Extend it one layer: treat your agent's dependencies as untrusted components too. Defense starts before import.

---

*Sources: TanStack npm supply chain compromise postmortem ([tanstack.com/blog/npm-supply-chain-compromise-postmortem](https://tanstack.com/blog/npm-supply-chain-compromise-postmortem), Tanner Linsley, May 11–15, 2026); SafeDep analysis of the "Mini Shai-Hulud" campaign ([safedep.io](https://safedep.io/mass-npm-supply-chain-attack-tanstack-mistral/), May 12, 2026); Orca Security threat analysis including wiper component details ([orca.security](https://orca.security/resources/blog/tanstack-npm-supply-chain-worm/), May 12, 2026). Campaign attributed to threat actor group TeamPCP by Orca Security and StepSecurity.*
