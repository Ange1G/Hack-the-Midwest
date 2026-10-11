# Task: Knowledge / documents connector

**Status:** Implemented (see `implementation.md`).

## Problem

Agents can call HTTP, MCP, and databases, but users cannot attach their own notes, runbooks, or policy text without standing up an MCP server or database.

## Goals

1. New connector type `knowledge` in the primitives registry.
2. User supplies titled text documents (JSON paste of plain text/markdown). Documents are stored per owner and connector.
3. Runner exposes `<connector>__search` (keyword) and `<connector>__read` tools with bounded snippets.
4. Tenant isolation: an agent may only search documents on attached knowledge connectors it owns.

## Constraints

- Treat document text as untrusted (same as other tool output).
- Size caps: documents per connector, bytes per document, total bytes per connector, total bytes per run, characters per search hit and per read.
- Retrieval is keyword ranking (BM25-style) inside the runner over a snapshot. Embeddings are a later option.
- No binary uploads, no file execution.
- No credentials for this type.

## Acceptance criteria

1. Create a knowledge connector, add documents, attach it to an agent.
2. A run can search and read; calls appear in `result.tool_calls` with `kind: "knowledge"`.
3. Another user's knowledge connector or document id is treated as missing (404).
4. Oversized documents and over-limit connectors are rejected with 422 and a field path.
5. Document endpoints on a non-knowledge connector return 422 `connector_not_knowledge`.

## Out of scope

Vector database, PDF/OCR, public sharing, agent write-back into the corpus, multipart upload.
