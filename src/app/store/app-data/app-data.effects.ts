import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { MatSnackBar } from '@angular/material/snack-bar';
import { switchMap, mergeMap, map, catchError, tap, withLatestFrom } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';
import { AppDataActions } from './app-data.actions';
import { ConnectionsActions } from '../connections/connections.actions';
import { selectActiveId } from '../connections/connections.selectors';
import { DbService } from '../../services/db.service';
import { FileService } from '../../services/file.service';
import { AppBusinessRule } from '../../models/app-data.model';

@Injectable()
export class AppDataEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private db = inject(DbService);
  private file = inject(FileService);
  private snackBar = inject(MatSnackBar);

  // When the active connection changes, (re)load its epics + business rules.
  reloadOnActiveChange$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectionsActions.setActiveSuccess, ConnectionsActions.loadConnectionsSuccess),
      withLatestFrom(this.store.select(selectActiveId)),
      map(([, activeId]) => (activeId ? AppDataActions.load({ connectionId: activeId }) : AppDataActions.clear())),
    ),
  );

  load$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.load),
      switchMap(({ connectionId }) =>
        forkJoin({
          epics: this.db.listEpics(connectionId).pipe(map(r => r.epics)),
          rules: this.db.listBusinessRules(connectionId).pipe(map(r => r.rules)),
          agentInfo: this.db.listAgentInfo(connectionId).pipe(map(r => r.info)),
          notes: this.db.listNotes(connectionId).pipe(map(r => r.notes)),
        }).pipe(
          map(({ epics, rules, agentInfo, notes }) => AppDataActions.loadSuccess({ connectionId, epics, rules, agentInfo, notes })),
          catchError((err) => of(AppDataActions.loadFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  createEpic$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.createEpic),
      mergeMap(({ connectionId, input }) =>
        this.db.createEpic(connectionId, input).pipe(
          map((epic) => AppDataActions.createEpicSuccess({ epic })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateEpic$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.updateEpic),
      mergeMap(({ connectionId, epicId, input }) =>
        this.db.updateEpic(connectionId, epicId, input).pipe(
          map((epic) => AppDataActions.updateEpicSuccess({ epic })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteEpic$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.deleteEpic),
      mergeMap(({ connectionId, epicId }) =>
        this.db.deleteEpic(connectionId, epicId).pipe(
          map(() => AppDataActions.deleteEpicSuccess({ epicId })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  createRule$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.createRule),
      mergeMap(({ connectionId, input }) =>
        this.db.createBusinessRule(connectionId, input).pipe(
          map((rule) => AppDataActions.createRuleSuccess({ rule })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateRule$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.updateRule),
      mergeMap(({ connectionId, ruleId, input }) =>
        this.db.updateBusinessRule(connectionId, ruleId, input).pipe(
          map((rule) => AppDataActions.updateRuleSuccess({ rule })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteRule$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.deleteRule),
      mergeMap(({ connectionId, ruleId }) =>
        this.db.deleteBusinessRule(connectionId, ruleId).pipe(
          map(() => AppDataActions.deleteRuleSuccess({ ruleId })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  // "Submit with Claude": save the rule (create when adding, update when editing)
  // with needsToBeEstablished=true, then hand it to a fresh claude session. The
  // saved rule is pushed to the store via the ordinary rule-success actions so the
  // list stays in sync even if the claude spawn fails; the spawn result only drives
  // the snackbar notice.
  submitToClaude$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.submitToClaude),
      mergeMap(({ connectionId, ruleId, input }) => {
        const withFlag = { ...input, needsToBeEstablished: true };
        const save$ = ruleId
          ? this.db.updateBusinessRule(connectionId, ruleId, withFlag).pipe(map(rule => ({ rule, existing: true })))
          : this.db.createBusinessRule(connectionId, withFlag).pipe(map(rule => ({ rule, existing: false })));
        return save$.pipe(
          switchMap(({ rule, existing }) => {
            const saved = existing
              ? AppDataActions.updateRuleSuccess({ rule })
              : AppDataActions.createRuleSuccess({ rule });
            return this.file.submitToClaude({ brName: rule.name, rule: rule.rule, description: brContext(rule) }).pipe(
              mergeMap(({ session }) => of(saved, AppDataActions.submitToClaudeSuccess({ rule, session }))),
              // The rule is already saved; surface the spawn failure but keep the store synced.
              catchError((err) => of(saved, AppDataActions.mutationFailure({ error: errMsg(err) }))),
            );
          }),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        );
      }),
    ),
  );

  claudeStarted$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.submitToClaudeSuccess),
      tap(({ session }) => this.snackBar.open(`Claude session started: ${session}`, 'Dismiss', { duration: 4500 })),
    ), { dispatch: false },
  );

  // Spawn a new epic and move the dragged rule into it, in one flow.
  moveRuleToNewEpic$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.moveRuleToNewEpic),
      mergeMap(({ connectionId, ruleId, input, epicTitle }) =>
        this.db.createEpic(connectionId, { title: epicTitle }).pipe(
          switchMap((epic) =>
            this.db.updateBusinessRule(connectionId, ruleId, { ...input, epicId: epic.id }).pipe(
              map((rule) => AppDataActions.moveRuleToNewEpicSuccess({ epic, rule })),
            ),
          ),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  createNote$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.createNote),
      mergeMap(({ connectionId, input }) =>
        this.db.createNote(connectionId, input).pipe(
          map((note) => AppDataActions.createNoteSuccess({ note })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateNote$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.updateNote),
      mergeMap(({ connectionId, noteId, input }) =>
        this.db.updateNote(connectionId, noteId, input).pipe(
          map((note) => AppDataActions.updateNoteSuccess({ note })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteNote$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.deleteNote),
      mergeMap(({ connectionId, noteId }) =>
        this.db.deleteNote(connectionId, noteId).pipe(
          map(() => AppDataActions.deleteNoteSuccess({ noteId })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  createAgentInfo$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.createAgentInfo),
      mergeMap(({ connectionId, input }) =>
        this.db.createAgentInfo(connectionId, input).pipe(
          map((info) => AppDataActions.createAgentInfoSuccess({ info })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateAgentInfo$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.updateAgentInfo),
      mergeMap(({ connectionId, infoId, input }) =>
        this.db.updateAgentInfo(connectionId, infoId, input).pipe(
          map((info) => AppDataActions.updateAgentInfoSuccess({ info })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteAgentInfo$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.deleteAgentInfo),
      mergeMap(({ connectionId, infoId }) =>
        this.db.deleteAgentInfo(connectionId, infoId).pipe(
          map(() => AppDataActions.deleteAgentInfoSuccess({ infoId })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  failures$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.mutationFailure, AppDataActions.loadFailure),
      tap(({ error }) => this.snackBar.open(error, 'Dismiss', { duration: 4500 })),
    ), { dispatch: false },
  );
}

function errMsg(err: unknown): string {
  const e = err as { error?: { error?: string }; message?: string };
  return e?.error?.error ?? e?.message ?? 'Request failed';
}

/**
 * Compose the seed context handed to a Claude session for a Business Rule. The
 * server prepends the rule statement, so this returns everything ELSE that gives
 * Claude the BR's context — rationale, category, features, dependencies and the
 * file anchors it touches. Returns null when the rule carries no extra context.
 */
function brContext(rule: AppBusinessRule): string | null {
  const parts: string[] = [];
  if (rule.rationale) parts.push(`Rationale: ${rule.rationale}`);
  if (rule.category) parts.push(`Category: ${rule.category}`);
  if (rule.features?.length) parts.push(`Features: ${rule.features.join(', ')}`);
  if (rule.modifiesFeatures?.length) parts.push(`Modifies features: ${rule.modifiesFeatures.join(', ')}`);
  if (rule.dependsOn?.length) parts.push(`Depends on: ${rule.dependsOn.join(', ')}`);
  const touches = Object.entries(rule.touches ?? {}).filter(([, v]) => Array.isArray(v) && v.length);
  if (touches.length) {
    parts.push('Touches:\n' + touches.map(([k, v]) => `  ${k}: ${v.join(', ')}`).join('\n'));
  }
  return parts.length ? parts.join('\n') : null;
}
