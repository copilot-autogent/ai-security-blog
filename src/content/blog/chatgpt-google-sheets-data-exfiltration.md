---
title: "Your Spreadsheet Is the Attack Surface: ChatGPT for Google Sheets Data Exfiltration"
description: "A single hidden prompt in an imported sheet can silently exfiltrate your entire Google Drive workbook collection, replace the ChatGPT sidebar with an attacker-controlled phishing interface, and bypass the extension's own human-approval safety setting. PromptArmor's analysis of the ChatGPT for Google Sheets add-on shows how LLM extensions inherit every permission you've granted — and hand them to whoever controls the data you import."
pubDate: 2026-06-03
tags: ["prompt-injection", "extensions", "data-exfiltration", "llm-security", "supply-chain"]
---

A user opens a financial model in Google Sheets, imports an external dataset to use as a reference, and asks the ChatGPT for Google Sheets sidebar to help merge the numbers. The operation completes. Twelve workbooks from across their Google Drive — including linked budget sheets they didn't know the chatbot could reach — have already been silently transmitted to an attacker's server. The ChatGPT sidebar is now an attacker-controlled phishing clone. The user's Google account credentials are being solicited.

This is not a theoretical scenario. PromptArmor published the full attack chain in May 2026 against the ChatGPT for Google Sheets add-on, which had accumulated 185,000+ downloads in under a month of availability.

## The Attack Chain

The attack is a textbook indirect prompt injection, but with a uniquely dangerous execution environment. The ChatGPT for Google Sheets extension can read cell data, run Apps Script, and open sidebars — capabilities scoped with Google Workspace permissions the user explicitly granted. When the LLM processes any cell content, including imported sheets, it processes potential attacker instructions with those same permissions.

The chain works like this:

1. A user imports an external sheet containing a hidden prompt injection — text written in white on white, invisible during normal use.
2. The user asks ChatGPT to help integrate that data into their model.
3. The injected instruction tells the LLM to load and execute an external Apps Script.
4. The script runs with the extension's full permissions: it reads the current workbook, identifies links to other workbooks in the stolen data, fetches those workbooks, and exfiltrates everything it finds.
5. The script opens a sidebar overlaying the real ChatGPT UI with an attacker-controlled clone, or pops a modal to harvest credentials.

In the published demo, the script exfiltrated 12 workbooks in a single chain — following hyperlinks discovered in stolen data to reach documents the user never mentioned and may not have remembered were linked.

Critically, the attack succeeds **even when the user has enabled "require human approval before edits"**. The human-approval setting gates ChatGPT's own edits; it does not prevent the LLM from loading an external script that makes the same edits through a different code path. Clicking the sidebar's stop button after the attack starts also doesn't halt scripts that are already executing.

## Why This Pattern Keeps Appearing

This is the second major exfiltration finding from PromptArmor involving Microsoft and OpenAI productivity extensions. Their earlier research on Microsoft Copilot Cowork documented a similar pattern: prompt injection via rendered content → LLM executes with application permissions → data leaves the user's environment without interaction.

The structural reason both attacks work is the same: **LLM extensions inherit ambient authority**. When an organization grants a Workspace extension permission to read spreadsheets and run scripts, they're granting that permission to the LLM's entire processing pipeline — including any content the LLM will encounter from untrusted sources. There is no distinction between "use these permissions to help the user" and "use these permissions to help the injected instruction." The model sees text; the extension acts.

This is the "LLM extensions are the new browser extensions" problem in concrete form. Browser extension security took years and multiple high-profile exploits before content isolation, permission scoping, and CSP norms became standard. LLM extensions are at the browser-extensions-circa-2008 stage: powerful, trusted, and largely unscoped in how they interact with attacker-controlled content.

## OpenAI's Response

PromptArmor disclosed responsibly on May 8, 2026. They received an automated acknowledgment and no substantive response across three follow-ups over three weeks. They published on May 27. On May 31, OpenAI responded:

> "We've taken immediate steps to protect users against potential attacks in this area by removing the model's ability to generate Apps Script code, which should eliminate the risk to users of ChatGPT for Google Sheets."

The fix — removing Apps Script generation from the extension — addresses the immediate attack vector. It doesn't address the underlying architecture: a model that processes untrusted data using the same permissions granted for trusted operations. The specific vector changes; the structural exposure is a product design decision that will require re-evaluation across every surface that follows the same pattern.

## What This Means for Extension Security

If you or your organization uses LLM-integrated extensions for productivity tools — Sheets, Excel, Docs, Outlook, Slack — the relevant questions are:

**What permissions has this extension been granted?** If it can read files, send emails, run code, or modify documents, those permissions extend to any content the LLM processes, including content from outside your organization.

**Does it process externally-sourced content?** Imported sheets, email attachments, shared documents, web search results, connected app data — any of these is a potential injection surface if the LLM can act on what it reads.

**What does the extension's documentation say about prompt injection risk?** OpenAI's documentation for ChatGPT for Excel and Google Sheets, per PromptArmor, described data-handling practices but did not disclose that the model could execute privileged scripts or that external data could manipulate those actions.

Organizations can restrict access to ChatGPT for Google Sheets via Workspace Settings → Permissions & Roles → ChatGPT for Excel and Google Sheets.

---

**Source:**
- *GPT for Google Sheets Exfiltrates Workbooks* — [PromptArmor](https://www.promptarmor.com/resources/gpt-for-google-sheets-data-exfiltration) (May 2026)
