Conduct a guided use-case suggestion session for $ARGUMENTS.

$ARGUMENTS may be a single UC ID (`UC-011`) or a UC ID followed by a baseline override (`UC-011 UC-001`). The baseline override anchors the suggestion at a specific predecessor instead of the immediately preceding UC — use this when designing a UC intended for `/uc-shift` to an earlier position.

## What you are doing

You are creating or updating the `suggestion.md` — the human-approved requirements document that drives all architecture generation for this use case.

## Step 0 — Resolve the UC folder and baseline override

Parse $ARGUMENTS:
- First token is the UC ID. Extract the UC number: strip `UC-` prefix, zero-pad to 3 digits → `uc-number` (e.g. `005`).
- Optional second token is the **baseline override** UC ID (e.g. `UC-001`). If provided, extract its number → `baseline-number`. If absent, `baseline-number` = `uc-number - 1`.

Call this the **uc-number** (e.g. `005`).

Locate an existing folder by globbing `.claude/architecture/${uc-number}-*/`. If no match, also try `.claude/architecture/UC-${ARGUMENTS}/` (legacy). If found, call it `<uc-folder>`. If not found, `<uc-folder>` will be created in Step 5 once you know the title.

## Step 1 — Check for an existing file

Look for `<uc-folder>/suggestion.md` (if folder was found above).
- If it **exists**: read it fully, summarise its current contents to the user, and tell them you are in **revision mode**.
- If it **does not exist**: confirm you are creating a new suggestion for $ARGUMENTS.

## Step 2 — Understand the previous UC baseline

Use `baseline-number` (from Step 0) as the predecessor. If no override was given, `baseline-number` = `uc-number - 1`.

- If `baseline-number` would be `000` (i.e. this is UC-001 with no override) → baseline is blank.
- Otherwise: locate the baseline UC folder by globbing `.claude/architecture/${baseline-number}-*/`, fallback to `.claude/architecture/UC-0${baseline-number-unpadded}/`.

If a previous UC folder exists, read:
- `suggestion.md` — what was already scoped
- `ClassDiagram.md` — current cumulative DB state
- `FrontendState.md` — current cumulative NgRx state

Summarise the baseline in 3–5 bullet points so the user knows the starting point before you ask questions.

## Step 3 — Read the old application

Scan `.old/backend/src/` and `.old/frontend/src/` to understand the existing implementation. Look for:
- Controllers and their route paths
- JPA entities and their fields
- Angular page components, services, and NgRx feature slices

Produce a short candidate list of old-app functionality that could belong in this UC. You will show this to the user in Step 4.

## Step 4 — Ask the user

Ask ALL of the following in a single message. Wait for their complete answers before writing anything.

1. **Title** — What is the short title for this use case?
2. **Scope** — What feature or behavior should this UC cover? (1–3 sentences)
3. **Old-app mapping** — Which items from your candidate list (Step 3) does it correspond to?
4. **Exclusions** — What is explicitly NOT in scope for this UC?
5. **Business rules** — List each business rule. Show any BRs you found in the old app as candidates; the user may accept, reject, or add new ones.
6. **DB entities** — Which entities are touched or created? Any unique keys, constraints, or relationships to specify?
7. **Endpoints** — Any endpoint paths, HTTP methods, or auth rules to prescribe?
8. **Components** — Which Angular page-level components are involved?

## Step 5 — Derive folder name and write the suggestion file

### Derive the folder name (new UCs only)

If no existing `<uc-folder>` was found in Step 0:

1. Take the user's title from Step 4 (e.g. "Manage Objects & Locations").
2. Derive a kebab-case slug: take the first 4–5 significant words, lowercase, hyphens between words. Drop articles ("a", "an", "the") and conjunctions ("and", "or") unless they are the only option. Keep "&" as "and". Examples:
   - "Authentication & User Management" → `auth-and-user-mgmt`
   - "Manage Objects" → `manage-objects`
   - "Application Bootstrap" → `app-bootstrap`
   - "Pre-Setup Guard & Password Hardening" → `pre-setup-guard`
   - "Availability Calendar" → `availability-calendar`
3. Combined folder name: `<uc-number>-<slug>` (e.g. `005-manage-objects`, `001-auth-and-user-mgmt`).
4. Set `<uc-folder>` = `.claude/architecture/<uc-number>-<slug>/`.

Create the directory `<uc-folder>` if it does not exist.

### Write suggestion.md

Write `<uc-folder>/suggestion.md` with this exact structure:

```
---
type: uc-suggestion
uc: UC-<uc-number>
baseline: UC-<baseline-number>
status: Draft
updated: <today YYYY-MM-DD>
---

# UC-<uc-number>: <Title> — Design Suggestions

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
- The file is written with `status: Draft` at `<uc-folder>/suggestion.md`
- To approve it, edit the frontmatter to `status: Approved`
- They can re-run `/uc-suggest $ARGUMENTS` at any time to revise
- Once approved, run `/uc-generate $ARGUMENTS` to produce all architecture artifacts

## Past CR Lessons

The following questions were derived from change requests. Ask these during the suggestion
session when the UC touches the relevant domain:

- **Read-only summary / dashboard endpoints:** For any endpoint whose path contains
  `today`, `overview`, `summary`, or `dashboard`, ask explicitly: which roles or authority
  levels may call it? Do not assume it shares the authority of the write/management
  endpoints in the same controller domain.
  _(source: CR-today-access-denied)_

- **APP_INITIALIZER / startup sequence:** If this UC introduces or modifies an APP_INITIALIZER,
  ask: for each async step it performs, which layer owns it — the initializer or a route guard?
  Route guards are reactive (fire per-navigation) and can only redirect; they cannot proactively
  restore state. Any step that must complete before the router activates — such as restoring an
  auth session from a stored refresh token — must be stated as an explicit BR on the initializer,
  not delegated to a guard.
  _(source: CR-clean-up-login-prompt-when-refresh-token-already-exists)_

- **Global navigation / app shell chrome:** When a UC introduces a page or authenticated view, ask:
  does it need application-level navigation, brand, or signed-in identity? If so, it MUST consume the
  global header (UC-003 `AppHeaderComponent`) — feature pages never roll their own app-level
  navbar/toolbar. Confirm which foundational shell UCs precede this one; if the page needs a new
  global destination, add it to the header nav registry rather than the page.
  _(source: CR-strip-duplicate-page-navbars)_
