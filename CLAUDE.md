# ApplicationStateVisualiser

Angular 21 client (port 4201) + Express/MariaDB server (`server.js`, port 3001) for
visualising the "state" — Epics and Business Rules — of registered applications. The
server owns **Store A** (`app_state_visualiser`: connection registry + methodology files)
and opens pools to each registered target application database. `npm run dev` runs both
the API and the Angular dev server together.

## Business Rules live in the database — not in files

This project follows a BR-first methodology, but **this repo stores its own Business
Rules in the database**, not in a `business-rules.json`. There is **no**
`.claude/architecture/` tree here and the file-based `/br-add` command does **not**
apply. Do not create or edit a `business-rules.json` for a change in this repo.

The app dogfoods itself: its own Epics and Business Rules live in the
**ApplicationStateManager** connection (the `applicationstatemanager` database),
reached through the running server's REST API. The same API backs the in-app
**Business Rules** page.

### Recording a BR for a code change

When you change application code, add or update the matching Business Rule in the DB
(treat it as part of the change, not optional):

1. Confirm the server is up — `curl http://localhost:3001/api/ping`
   (start it with `npm run dev`, or just `npm run server` for the API alone).
2. Get the connection id — `curl http://localhost:3001/api/db/connections`, pick the
   entry named **ApplicationStateManager**.
3. Pick the epic and next `seq` —
   `curl http://localhost:3001/api/db/connections/<id>/epics` and
   `curl http://localhost:3001/api/db/connections/<id>/business-rules`.
4. Create it (or update an existing one with `PUT …/business-rules/<brId>`):

   ```bash
   curl -X POST http://localhost:3001/api/db/connections/<id>/business-rules \
     -H 'Content-Type: application/json' \
     -d '{
       "name": "BR-0NN",
       "epicId": "<epic-uuid>",
       "seq": "NN",
       "rule": "One enforceable sentence describing the behaviour.",
       "category": "ui",
       "features": ["…"],
       "dependsOn": ["BR-0MM"],
       "touches": { "frontend": ["src/app/…"] }
     }'
   ```

BR fields mirror the existing rows: `name` (`BR-0NN`, unique per app), `epicId`, `seq`,
`rule`, optional `rationale`, `category`, `features[]`, `modifiesFeatures[]`,
`dependsOn[]` (references other BRs **by name**), `touches{}` (free-form file anchors),
`delta{}`. Server-side shapes and validation live in `db-store.js`
(`normaliseBr` / `createBusinessRule`); the HTTP routes are in `server.js` under
`/api/db/connections/:id/business-rules`.

You can also add or edit BRs from the app UI: open the **Business Rules** page with
**ApplicationStateManager** selected as the active database.

> A `PreToolUse` hook (`.claude/settings.json`) reminds you of this on every code edit.
