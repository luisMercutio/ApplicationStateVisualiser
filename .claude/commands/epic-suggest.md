Conduct a guided Epic suggestion session for $ARGUMENTS.

$ARGUMENTS may be a single Epic ID (`EPIC-011`) or an Epic ID followed by a baseline override (`EPIC-011 EPIC-001`). The baseline override anchors the suggestion at a specific predecessor instead of the immediately preceding Epic — use this when designing an Epic intended for `/epic-shift` to an earlier position.

## What you are doing

You are creating or updating the `suggestion.md` — the human-approved requirements document that drives all architecture generation for this Epic.

## Step 0 — Resolve the Epic folder and baseline override

Parse $ARGUMENTS:
- First token is the Epic ID. Extract the Epic number: strip `EPIC-` prefix, zero-pad to 3 digits → `epic-number` (e.g. `005`).
- Optional second token is the **baseline override** Epic ID (e.g. `EPIC-001`). If provided, extract its number → `baseline-number`. If absent, `baseline-number` = `epic-number - 1`.

Call this the **epic-number** (e.g. `005`).

Locate an existing folder by globbing `.claude/architecture/${epic-number}-*/`. If no match, also try `.claude/architecture/EPIC-${ARGUMENTS}/` (legacy). If found, call it `<epic-folder>`. If not found, `<epic-folder>` will be created in Step 5 once you know the title.

## Step 0.5 — Classify the change size (Epic vs single BR)

Before scoping anything, classify the change by size using the heuristic in `.claude/EPIC-METHODOLOGY.md`. The atomic unit is the Business Rule; an Epic groups a cohesive set of BRs. Decide which path this change should take:

**Create a new EPIC (large path)** when the change:
- introduces a new cohesive capability, AND
- needs **new scaffolding** — a new entity/table, a new endpoint group, a new NgRx slice, or a new route/page — OR
- decomposes into **≥ 3 Business Rules**, OR
- has cross-cutting UI (a new view/panel) or a new external integration.

**Add a single BUSINESS RULE (small path)** when the change:
- fits inside an **existing Epic**, AND
- introduces **no new** entity/table/endpoint-group/slice/route, AND
- is expressible as **1 (occasionally 2)** enforceable BR(s) — e.g. a new validation, a workflow tweak, a UI-copy or routing rule, a permission refinement.

If a "small" change starts to require new scaffolding or spills past two BRs, **escalate to the Epic path**. When genuinely on the fence, prefer the BR path and let it escalate — a BR is cheap to promote, an Epic is expensive to unwind.

State your classification to the user with a one-line rationale, then recommend the next command:
- **Epic path** → continue this suggestion session, and the user will run `/epic-generate $ARGUMENTS` once approved.
- **Single-BR path** → recommend `/br-add <existing-EPIC>` instead: "This looks like a single Business Rule that fits inside `<existing-EPIC>`. Consider `/br-add <existing-EPIC>` rather than creating a whole new Epic." If the user agrees, stop here and let them run `/br-add`. If the user still wants a full Epic (or you cannot identify a suitable existing Epic), continue this session on the Epic path.

## Step 1 — Check for an existing file

Look for `<epic-folder>/suggestion.md` (if folder was found above).
- If it **exists**: read it fully, summarise its current contents to the user, and tell them you are in **revision mode**.
- If it **does not exist**: confirm you are creating a new suggestion for $ARGUMENTS.

## Step 2 — Understand the previous Epic baseline

Use `baseline-number` (from Step 0) as the predecessor. If no override was given, `baseline-number` = `epic-number - 1`.

- If `baseline-number` would be `000` (i.e. this is EPIC-001 with no override) → baseline is blank.
- Otherwise: locate the baseline Epic folder by globbing `.claude/architecture/${baseline-number}-*/`, fallback to `.claude/architecture/EPIC-0${baseline-number-unpadded}/`.

If a previous Epic folder exists, read:
- `suggestion.md` — what was already scoped
- `ClassDiagram.md` — current cumulative DB state
- `FrontendState.md` — current cumulative NgRx state

Summarise the baseline in 3–5 bullet points so the user knows the starting point before you ask questions.

## Step 3 — Read the old application

Scan `.old/backend/src/` and `.old/frontend/src/` to understand the existing implementation. Look for:
- Controllers and their route paths
- JPA entities and their fields
- Angular page components, services, and NgRx feature slices

Produce a short candidate list of old-app functionality that could belong in this Epic. You will show this to the user in Step 4.

## Step 4 — Ask the user

Ask ALL of the following in a single message. Wait for their complete answers before writing anything.

1. **Title** — What is the short title for this Epic?
2. **Scope** — What feature or behavior should this Epic cover? (1–3 sentences)
3. **Old-app mapping** — Which items from your candidate list (Step 3) does it correspond to?
4. **Exclusions** — What is explicitly NOT in scope for this Epic?
5. **Business rules** — List each business rule. Show any BRs you found in the old app as candidates; the user may accept, reject, or add new ones.
6. **DB entities** — Which entities are touched or created? Any unique keys, constraints, or relationships to specify?
7. **Endpoints** — Any endpoint paths, HTTP methods, or auth rules to prescribe?
8. **Components** — Which Angular page-level components are involved?

## Step 5 — Derive folder name and write the suggestion file

### Derive the folder name (new Epics only)

If no existing `<epic-folder>` was found in Step 0:

1. Take the user's title from Step 4 (e.g. "Manage Objects & Locations").
2. Derive a kebab-case slug: take the first 4–5 significant words, lowercase, hyphens between words. Drop articles ("a", "an", "the") and conjunctions ("and", "or") unless they are the only option. Keep "&" as "and". Examples:
   - "Authentication & User Management" → `auth-and-user-mgmt`
   - "Manage Objects" → `manage-objects`
   - "Application Bootstrap" → `app-bootstrap`
   - "Pre-Setup Guard & Password Hardening" → `pre-setup-guard`
   - "Availability Calendar" → `availability-calendar`
3. Combined folder name: `<epic-number>-<slug>` (e.g. `005-manage-objects`, `001-auth-and-user-mgmt`).
4. Set `<epic-folder>` = `.claude/architecture/<epic-number>-<slug>/`.

Create the directory `<epic-folder>` if it does not exist.

### Write suggestion.md

Write `<epic-folder>/suggestion.md` with this exact structure:

```
---
type: epic-suggestion
epic: EPIC-<epic-number>
baseline: EPIC-<baseline-number>
status: Draft
updated: <today YYYY-MM-DD>
---

# EPIC-<epic-number>: <Title> — Design Suggestions

## Module Assignment

| | |
|---|---|
| **Application** | `staff` |
| **Domain** | `<domain-name>` (eager or lazy) |
| **Shared-lib** | `<shared components, or none>` |

## Database Entities

(mermaid erDiagram block)

## Endpoints & DTOs

| Method | Path | Auth | Notes |
|---|---|---|---|

### Key DTOs

**`<RequestDtoName>`** — `field: type (constraint)`, ...

### Business Rules

| ID | Rule |
|---|---|
| BR-001 | <rule text> |

## Frontend Components

| Component | Status | Notes |
|---|---|---|
| `<Name>Component` | NEW | ... |

### Services / Infrastructure

| Artifact | Type | Notes |
|---|---|---|

### Routes

| Path | Guard | Component |
|---|---|---|
```

## Step 6 — Tell the user what to do next

After writing the file, inform the user:
- The file is written with `status: Draft` at `<epic-folder>/suggestion.md`
- To approve it, edit the frontmatter to `status: Approved`
- They can re-run `/epic-suggest $ARGUMENTS` at any time to revise
- Once approved, run `/epic-generate $ARGUMENTS` to produce all architecture artifacts
- (If this was really a single-rule change, `/br-add <EPIC>` is the lighter alternative — see Step 0.5.)

## Past CR Lessons

The following questions were derived from change requests. Ask these during the suggestion
session when the Epic touches the relevant domain:

- **Read-only summary / dashboard endpoints:** For any endpoint whose path contains
  `today`, `overview`, `summary`, or `dashboard`, ask explicitly: which roles or authority
  levels may call it? Do not assume it shares the authority of the write/management
  endpoints in the same controller domain.
  _(source: CR-today-access-denied)_

- **APP_INITIALIZER / startup sequence:** If this Epic introduces or modifies an APP_INITIALIZER,
  ask: for each async step it performs, which layer owns it — the initializer or a route guard?
  Route guards are reactive (fire per-navigation) and can only redirect; they cannot proactively
  restore state. Any step that must complete before the router activates — such as restoring an
  auth session from a stored refresh token — must be stated as an explicit BR on the initializer,
  not delegated to a guard.
  _(source: CR-clean-up-login-prompt-when-refresh-token-already-exists)_

- **Global navigation / app shell chrome:** When an Epic introduces a page or authenticated view, ask:
  does it need application-level navigation, brand, or signed-in identity? If so, it MUST consume the
  global header (EPIC-003 `AppHeaderComponent`) — feature pages never roll their own app-level
  navbar/toolbar. Confirm which foundational shell Epics precede this one; if the page needs a new
  global destination, add it to the header nav registry rather than the page.
  _(source: CR-strip-duplicate-page-navbars)_
