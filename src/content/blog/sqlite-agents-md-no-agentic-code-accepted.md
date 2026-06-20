---
title: "SQLite AGENTS.md: No Agentic Code Accepted"
description: "D. Richard Hipp's three-sentence policy in SQLite's AGENTS.md distills what most AI governance frameworks bury in pages of caveats: the line isn't between human and machine intelligence — it's between verified and unverified contributions. An analysis of what this stance gets right, and why the same commit log that hosts the policy also cites Claude analysis."
pubDate: 2026-06-20
tags: ["secure-development", "agentic-ai", "responsible-ai", "ai-governance", "supply-chain"]
---

The SQLite project recently added an [AGENTS.md](https://github.com/sqlite/sqlite/blob/master/AGENTS.md) to its GitHub mirror. If you've been paying attention to which major open-source projects are publishing guidance for AI coding agents, this one is worth reading closely. Three sentences from its "Project nature" section do more work than most corporate AI policies:

> "SQLite does not accept agentic code. However the project will accept agentic bug reports that include a reproducible test case. Patches or pull requests demonstrating a possible fix, for documentation purposes, are welcomed."

That's the entire policy. No lengthy exceptions framework, no approval workflow diagrams, no tiered risk matrices. D. Richard Hipp — drh, SQLite's creator and primary author since 2000 — drew a line and explained the exception in two sentences.

Understanding why this is the right line, and what it reveals about AI-assisted development more broadly, requires understanding what SQLite actually is and what Hipp has spent over two decades building.

## SQLite Is Not a Normal Project

SQLite is the most widely deployed database engine in the world — embedded in billions of devices, from iPhones to aircraft avionics to web browsers and Android's core system libraries. It ships as a single C amalgamation file: `sqlite3.c`, over 230,000 lines that incorporate generated headers and auxiliary code alongside roughly 150,000 lines of hand-written source. That file is used in production systems where a silent regression can ground aircraft, corrupt financial records, or silently lose user data.

The codebase has a testing infrastructure that is, by most measures, unusual. The SQLite team maintains roughly 100 million lines of test code against that production source — a ratio that is not a typo. The [test harness](https://sqlite.org/testing.html) includes mutation testing, boundary value analysis, branch coverage verification, and scenario testing under simulated I/O failures. SQLite's published testing claims achieve 100% branch (MC/DC) coverage of the production code.

This context matters enormously for evaluating the AGENTS.md policy. A project with this testing discipline isn't rejecting agentic code because it's philosophically opposed to AI. It's rejecting unverified contributions — and agentic code, without human review of the generation process and its reasoning, is structurally unverifiable in the way SQLite requires.

## The Bug Forum Exception Is Principled, Not Tokenistic

The policy's exception — agentic bug reports are accepted if they include a reproducible test case — is not a concession. It's a restatement of the same underlying principle.

SQLite's [forum](https://sqlite.org/forum) is its primary bug-reporting channel. Search it for posts with the characteristic signatures of automated test-case generators — unusual SQL expressions, boundary-probing queries, off-normal type interactions — and you'll find them. They have been showing up for years, long before AGENTS.md existed, from fuzz testing tools and increasingly from LLM-assisted exploration. The AGENTS.md is, in part, a formal acknowledgment of something already happening: automated and AI-assisted tools are surfacing real SQLite edge cases, and those reports are worth investigating.

The key condition is "a reproducible test case." This is not a bureaucratic requirement. It's an epistemic one. A bug report without a reproducible test case is an assertion. A bug report with a reproducible test case is evidence. SQLite's policy draws exactly that line: evidence-based contributions are welcome regardless of their origin; assertion-based contributions require the human developer to accept responsibility for the claim.

This is, stated plainly, the *evidence-before-assertion* principle applied to contribution policy. It's how safety-critical software development has always worked. The AGENTS.md is new. The principle is not.

## The Patch Clause and What It Reveals About Verification

The third sentence is the most interesting: "Patches or pull requests demonstrating a possible fix, for documentation purposes, are welcomed."

"For documentation purposes" is a phrase that might read as dismissive — a polite way of saying "we won't use your code." It's actually a precise description of how drh uses AI-generated output in practice.

Consider a commit from June 19, 2026, one day before this writing, authored by drh himself: *"Additional changes based on Claude analysis."* The commit appears in the same repository that hosts the no-agentic-code AGENTS.md. That commit message is the only direct evidence available about drh's workflow on this change — it doesn't fully document what the interaction looked like. But it does confirm the pattern: AI analysis was used as input, and drh authored the resulting commit. The code that went into SQLite bears his authorship. Whatever Claude contributed was the analysis; what drh contributed was the verified implementation.

This is what "for documentation purposes" means in practice. An AI-generated patch demonstrates a possible approach. A human author reads that demonstration, understands it, verifies it against the test harness, and decides what to actually ship. The AI contribution is documentation of an approach; the human contribution is the verified implementation.

This is a precise operationalization of *human-review-before-merge*. Not as a box-checking exercise — not as "someone glanced at the diff" — but as the genuine transfer of understanding and responsibility from the AI's suggestion to a human author who is prepared to stand behind it.

## Why This Matters for Projects That Aren't SQLite

SQLite's policy is easy to implement at SQLite scale: the project has effectively one primary human author, a codebase under active development for nearly three decades, and an engineering culture where every change must survive a 100M-line test suite before it ships. Most projects don't have this infrastructure.

But the underlying design pattern — **accept AI contributions as evidence and documentation, not as shippable code** — is applicable at any scale. It shows up in different forms:

**Reproducibility as the gating condition.** The SQLite bug-report policy requires reproducible test cases because reproducibility is the precondition for verification. For any AI-assisted contribution, the question to ask isn't "does this look right" but "can we verify this independently of the AI's reasoning?" If the answer is no, the contribution is an assertion, not evidence.

**Human authorship as responsibility transfer.** When drh commits "Additional changes based on Claude analysis," he's not laundering AI output through a human name. He's doing what the author credit represents: accepting responsibility for having understood and verified the change. Author credit in a safety-critical codebase is a claim about who can answer for the code — who was in the loop, who checked the reasoning, who can trace a regression back to its source.

**The documentation framing as an invitation.** Welcoming AI-generated patches "for documentation purposes" is a better interface design than either rejecting AI patches entirely or accepting them as first-class contributions. It lets AI tools contribute to problem-solving — generating candidate approaches, exploring solution spaces, producing starting points — while keeping the verification loop human. This is the structure that makes AI assistance additive rather than substitutive for the critical path.

## The Governance Signal

There is a broader observation here worth making explicitly.

SQLite's AGENTS.md is one data point in what is becoming a clearer pattern: the organizations getting AI governance right in 2026 are not the ones with the most elaborate frameworks. They're the ones that have internalized a small number of durable principles deeply enough to apply them consistently.

SQLite's principles are visible in the three sentences of the policy:
- Don't accept what you can't verify (*no agentic code*)
- Accept what enables verification (*reproducible test cases*)
- Use AI output as input to human judgment, not as a replacement for it (*for documentation purposes*)

None of these principles require a dedicated AI ethics committee, a multi-tier review board, or a supplier risk management process. They require a clear model of what verification means for a given codebase and the discipline to hold that line.

Most AI governance frameworks are written for organizations that don't yet know what they're trying to protect. SQLite's AGENTS.md was written by someone who has known for over two decades exactly what he's trying to protect, and who has the test suite to prove it.

---

*The SQLite AGENTS.md is [readable in full](https://github.com/sqlite/sqlite/blob/master/AGENTS.md) in the GitHub mirror of the canonical [Fossil repository](https://sqlite.org/src). The SQLite forum, where agentic bug reports are accepted under the policy described above, is at [sqlite.org/forum](https://sqlite.org/forum).*
