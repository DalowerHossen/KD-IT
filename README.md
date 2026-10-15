// path: README.md

# KD SOLUTION IT

KD SOLUTION IT is an enterprise multi-tenant SaaS platform for invoicing, payments, payroll, accounting, and business operations, designed for the Asian market with English-only product artifacts and USD-only accounting.

## Current repository phase

The repository contains the authoritative planning baseline. Product implementation is organized into exactly sixteen sequential chats. One chat completes one step, creates one handoff, creates one conventional commit, and pushes the Arena-assigned tracked integration baseline branch.

## Read in this order

1. [Requirements Addendum](REQUIREMENTS_ADDENDUM.md)
2. [16-Step Implementation Plan](IMPLEMENTATION_PLAN.md)
3. [Requirements Traceability](REQUIREMENTS_TRACEABILITY.md)
4. [Payment Provider Research Protocol](PROVIDER_RESEARCH_PROTOCOL.md)
5. [New-Chat Instructions](CHAT_INSTRUCTIONS.md)
6. [Execution Status](EXECUTION_STATUS.md)
7. [Master Prompt](MASTER_PROMPT.md)
8. [Complete Feature List](FEATURE_LIST.md)

The addendum is authoritative when an older statement conflicts with a newer product-owner requirement. Non-conflicting requirements in the master prompt and complete feature list remain mandatory.

## Starting implementation

Open a new chat and paste the Chat 01 block from `CHAT_INSTRUCTIONS.md`. After Step 01 is committed and pushed, use Chat 02 in a new chat. Continue in numeric order through Chat 16. Do not run steps concurrently against the same integration baseline.

## Permanent Claude context

Use Claude Code or a Claude session with live GitHub repository access. The root [`CLAUDE.md`](CLAUDE.md) file is the permanent bootstrap and instructs Claude to read the current branch, authoritative documents, execution status, and committed handoffs at the start of every session. Do not maintain duplicate uploaded copies of changing repository files in Claude Project Context.

## Reconciled scope

- 4,187 namespaced rows from `FEATURE_LIST.md`
- 21 latest-requirement identifiers from `REQUIREMENTS_ADDENDUM.md`
- 16 separately implemented payment adapters
- Google Drive file storage when connected, encrypted Supabase Storage when it is not connected
- Supabase PostgreSQL as the permanent source of truth for structured and textual data
- Netlify primary deployment with Docker and VPS parity

Implementation evidence is recorded in `docs/handoffs/STEP_XX_COMPLETED.md` as each step is accepted.
