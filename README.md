# Application State Visualiser

An interactive dashboard for **watching an application get designed and built by Claude Code** — and the **ground-truth home** for the agent/command methodology that does the building.

It has two jobs:

1. **Visualise** the design artifacts a target project generates under `.claude/architecture/` — use cases, class diagrams, API contracts, frontend state, mockups, tests, and the **Business Rule dependency net**.
2. **Own the methodology.** The Claude Code agents and slash commands that drive development live here in [`.claude/`](.claude/) — auto-discovered by Claude Code, edited in-app, and **synced out** to the projects they build. Keeping them here means the methodology is versioned alongside the tool that shows what it produces.

> Internal package name: `uc-arch-viewer`.

---

## Quick start

```bash
npm install
npm run dev        # Express API on :3001  +  Angular dev server on :4201
```

Open **http://localhost:4201**, then in the folder picker enter the path to a project that has a `.claude/architecture/` folder (e.g. a project built with these agents). Both processes must run — `npm run dev` starts them together via `concurrently`.

- `npm start` / `ng serve` — Angular only (needs the API running separately)
- `node server.js` — the API only
- `npm run build` — production build into `dist/`

---

## How it works

The Angular app is a **viewer**; the data lives in the *target project*, not in this repo.

```
Browser (Angular 21 + NgRx, :4201)
   │  HTTP
   ▼
Express server.js (:3001)
   │  reads/writes
   ▼
<targetProject>/.claude/architecture/**      ← the artifacts to visualise
<thisRepo>/.claude/{agents,commands,schemas,scripts}  ← the methodology
```

- **`server.js`** — a small read/write file API. Reads are sandboxed to `<root>/.claude/architecture` (or this repo's own `.claude/`); writes are guarded the same way. Endpoints: `GET/PUT /api/file`, `GET /api/tree`, `GET /api/mockup`, `GET/PUT /api/br-positions`, `GET /api/resources/tree`, `GET/PUT /api/resources/file`, `POST /api/sync-methodology`, and layout CRUD under `/api/layouts`.
- **Angular app** — a grid of draggable [gridster] panels, each rendering one artifact for the currently selected Use Case. State is NgRx (`layout`, `uc`, `files`, `layouts`, `resources`, `br`). The active project root and panel layout persist in `localStorage`; named layouts persist server-side under `layouts/`.

### Panels / views

| Panel | Shows |
|---|---|
| **UC Tracker** | the `usecases.md` chain; click a row to set the active UC |
| **Suggestion** | a UC's `suggestion.md` design brief |
| **Class Diagram / Frontend State** | Mermaid diagrams from `ClassDiagram.md` / `FrontendState.md` |
| **API Contract / Selectors** | `openapi.yaml` endpoints / `selectors.yaml` |
| **Tests / Contract** | `testState.md` / `contract-validation.json` |
| **Mockup** | `mockups/*.html` in a sandboxed iframe |
| **Diffs** | per-UC delta views (DB, API, store, selectors, tests, mockups) |
| **BR Net** | the **Business Rule dependency graph** (see below) |
| **Agents & Commands** | browse + edit the methodology files in `.claude/`, and sync them to a project |

### The Business Rule net

Each UC's `business-rules.json` (produced by the `br-synthesizer` agent during `/uc-generate`) turns every Business Rule into a first-class node: its specification, `dependsOn` prerequisite edges, and `touches` anchors into the other artifacts.

The **BR Net** panel renders these as a graph — earliest / most-foundational rules at the top, dependents cascading down-and-right. Click a rule to:

- colour its connected sub-net,
- open a detail drawer (spec, depends-on / required-by, and its **test-case library**),
- **cross-highlight** the matching entities in the Class Diagram, slices in Frontend State, its section in Tests, and the mockups it touches.

Node coordinates are auto-computed, then **persisted separately** in `br-positions.json` (owned by the viewer), so re-running `/uc-generate` never clobbers hand-tuned layout. Seed data for a project with none can be generated deterministically:

```bash
node .claude/scripts/backfill-business-rules.mjs --root "C:/path/to/projectB"
```

---

## The methodology (agents & command flows)

This is the part that actually builds applications. It is spec-first: a feature is a numbered **Use Case (UC)** that flows from a written suggestion → generated architecture artifacts → real code.

**Three workflow families:**

- **UC Spec Pipeline** — design & build a feature: `/uc-suggest` → `/uc-generate` → `/uc-develop`, plus positioning (`/uc-shift`, `/uc-insert`, `/uc-retrospec`) and maintenance (`/uc-patch`, `/uc-reconcile`, `/uc-prep`, `/uc-status`, `/uc-cleanup`).
- **Change Request loop** — fix a bug and feed the lesson back into the agents: `/cr-start` → `/cr-capture` → `/cr-propagate` → `/cr-clean`.
- **Work Queue** — batch loose tasks through, some in parallel: `/queue-add` → `/queue-refine` → `/queue-plan` → `/queue-run` → `/queue-judge`.

**Agents** (in [`.claude/agents/`](.claude/agents/)) do the specialised work: `backend-architect` / `frontend-architect` (design), `contract-validator` (API↔frontend contract), `br-synthesizer` (Business Rule data), `postman-builder`, `backend-developer` / `frontend-developer` (code), `backend-tester` / `frontend-tester` (tests), `obsidian-scribe` (docs).

### `/flows` — the built-in guide

Don't memorise the above. Run **`/flows`** in Claude Code for a short overview, then pick a workflow to go deep on when each is used and exactly what it changes. `/flows <topic>` (e.g. `/flows queue`, `/flows uc-generate`) jumps straight in. See also [`.claude/CHEATSHEET.md`](.claude/CHEATSHEET.md).

---

## Using the methodology in another project

Claude Code only auto-discovers agents/commands from a project's own `.claude/` (or `~/.claude/`). It will **not** read them from a sibling repo. So this repo is the canonical source, and you push it out:

- **In-app:** open the **Agents & Commands** panel → the sync button → enter the target project folder. It copies `.claude/agents` + `.claude/commands` into `<target>/.claude/`.
- **API:** `POST /api/sync-methodology { "target": "C:/path/to/projectB" }`.

Edit the agents/commands **here**, then re-sync. (Two files are local forks maintained on top of upstream: `commands/uc-generate.md` adds the `br-synthesizer` step, and `agents/br-synthesizer.md` is new — preserve both when re-importing from an upstream project.)

---

## Repo layout

```
server.js                     Express file / layout / methodology / sync API (:3001)
layouts/                      saved panel layouts (JSON)
.claude/                      ← the methodology (ground truth; auto-discovered by Claude Code)
  agents/                       Claude Code sub-agents
  commands/                     slash commands (uc-*, cr-*, queue-*, flows)
  schemas/                      JSON Schemas (business-rules.schema.json)
  scripts/                      backfill-business-rules.mjs
  CHEATSHEET.md
src/app/
  components/                   folder-picker, toolbar, panel-grid, panel, views/*, dialogs
  services/                     file.service.ts (API client), mermaid.service.ts
  store/                        NgRx: layout · uc · files · layouts · resources · br
  models/                       panel.model.ts · uc.model.ts · business-rule.model.ts
```

## Tech

Angular 21 (standalone components) · NgRx 21 · Angular Material · angular-gridster2 · Mermaid · marked + DOMPurify · js-yaml · Express. Tests: Karma/Jasmine (`ng test`).
