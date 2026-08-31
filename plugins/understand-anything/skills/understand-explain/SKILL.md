---
name: understand-explain
description: Deeply explain one specific code component such as a file, function,
  class, service, module, or subsystem using the Understand Anything graph plus source
  code. Use when the user points to a concrete component and asks what it does, why
  it exists, how it works internally, what calls it, what it depends on, or how it
  fits the architecture. Prefer `understand-chat` for broad cross-cutting questions.
---

# /understand-explain

## ChatGPT / Codex compatibility

- Treat slash-command syntax and `$ARGUMENTS` as upstream notation, not as a required invocation mechanism. Infer paths, queries, flags, and options from the current user request and substitute them directly. Natural-language invocation is supported.
- When the host exposes the installed Skill directory, use that real directory as `SKILL_DIR`; prefer the actual packaged plugin root derived from the installed Skill path before trying upstream platform-specific fallback paths.
- If an upstream step says to dispatch a named subagent but the host does not expose a subagent facility, read the referenced prompt under the plugin-level `agents/` directory and execute that role inline while preserving its input/output contract.
- Do not claim a dashboard, graph refresh, hook, or external API action succeeded unless the corresponding executable/file/API evidence exists in the current runtime.

Provide a thorough, in-depth explanation of a specific code component.

## Graph Structure Reference

The knowledge graph JSON has this structure:
- `project` — {name, description, languages, frameworks, analyzedAt, gitCommitHash}
- `nodes[]` — each has {id, type, name, filePath?, summary, tags[], complexity, languageNotes?}
  - Code node types: file, function, class, module, concept
  - Non-code node types: config, document, service, table, endpoint, pipeline, schema, resource
  - Domain/knowledge node types: domain, flow, step, article, entity, topic, claim, source
  - IDs use the node type as prefix, e.g. `file:path`, `function:path:name`, `config:path`, `article:path`
- `edges[]` — each has {source, target, type, direction, weight}
  - Key types: imports, contains, calls, depends_on, configures, documents, deploys, triggers, contains_flow, flow_step, related, cites
- `layers[]` — each has {id, name, description, nodeIds[]}
- `tour[]` — each has {order, title, description, nodeIds[]}

## How to Read Efficiently

1. Use Grep to search within the JSON for relevant entries BEFORE reading the full file
2. Only read sections you need — don't dump the entire graph into context
3. Node names and summaries are the most useful fields for understanding
4. Edges tell you how components connect — follow imports and calls for dependency chains

## Instructions

1. **Resolve the data directory `$UA_DIR`.** Run `UA_DIR=$([ -d .understand-anything ] && echo .understand-anything || echo .ua)` — this is the legacy `.understand-anything/` when it already exists, otherwise the new `.ua/`. Check that `$UA_DIR/knowledge-graph.json` exists. If not, tell the user to run `/understand` first.

2. **Check graph freshness before using graph-derived context**:
   - Read `project.gitCommitHash` from the graph metadata as `GRAPH_COMMIT_RAW`. Resolve it as a commit before using it in any Git diff, then compare it with `git rev-parse HEAD` and inspect project-scoped committed and working-tree changes from the project root:
     ```bash
     GRAPH_COMMIT=$(git rev-parse --verify --end-of-options "${GRAPH_COMMIT_RAW}^{commit}" 2>/dev/null)
     git rev-parse HEAD
     git diff --name-only "$GRAPH_COMMIT" HEAD -- .
     git diff --cached --name-only -- .
     git diff --name-only -- .
     git ls-files --others --exclude-standard -- .
     ```
   - The `-- .` pathspec is required: commits that only touch a sibling monorepo project must not make this graph stale. A hash mismatch alone is not stale when the project diff is empty.
   - Ignore the selected data directory (`.ua/` or legacy `.understand-anything/`) in every command's output because it contains generated graph artifacts, not project source drift.
   - If the committed diff or any working-tree command reports project files, warn before explaining that graph-derived context may omit those changes. Suggest: Run `/understand` to refresh the graph.
   - Run the commit diff only when `GRAPH_COMMIT_RAW` resolves successfully. If the graph commit or Git metadata is missing, invalid, or unavailable, give a brief best-effort warning and continue instead of blocking.

3. **Find the target node** — use Grep to search the knowledge graph for the component: "$ARGUMENTS"
   - For file paths (e.g., `src/auth/login.ts`): search for `"filePath"` matches
   - For function notation (e.g., `src/auth/login.ts:verifyToken`): search for the function name in `"name"` fields filtered by the file path
   - Note the exact node `id`, `type`, `summary`, `tags`, and `complexity`

4. **Find all connected edges** — Grep for the target node's ID in the edges section:
   - `"source"` matches → things this node calls/imports/depends on (outgoing)
   - `"target"` matches → things that call/import/depend on this node (incoming)
   - Note the connected node IDs and edge types

5. **Read connected nodes** — for each connected node ID from step 4, Grep for those IDs in the nodes section to get their `name`, `summary`, and `type`. This builds the component's neighborhood.

6. **Identify the layer** — Grep for the target node's ID in the `"layers"` section to find which architectural layer it belongs to and that layer's description.

7. **Read the actual source file** — Read the source file at the node's `filePath` for the deep-dive analysis.

8. **Explain the component in context**:
   - Its role in the architecture (which layer, why it exists)
   - Internal structure (functions, classes it contains — from `contains` edges)
   - External connections (what it imports, what calls it, what it depends on — from edges)
   - Data flow (inputs → processing → outputs — from source code)
   - Explain clearly, assuming the reader may not know the programming language
   - Highlight any patterns, idioms, or complexity worth understanding
