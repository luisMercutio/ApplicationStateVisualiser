import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { MatSnackBar } from '@angular/material/snack-bar';
import { switchMap, mergeMap, map, catchError, tap, withLatestFrom } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';
import { AppDataActions } from './app-data.actions';
import { ApplicationsActions } from '../applications/applications.actions';
import { selectActiveId } from '../applications/applications.selectors';
import { DbService } from '../../services/db.service';

@Injectable()
export class AppDataEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private db = inject(DbService);
  private snackBar = inject(MatSnackBar);

  // When the active application changes, (re)load its epics + business rules.
  reloadOnActiveChange$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ApplicationsActions.setActiveSuccess, ApplicationsActions.loadApplicationsSuccess),
      withLatestFrom(this.store.select(selectActiveId)),
      map(([, activeId]) => (activeId ? AppDataActions.load({ applicationId: activeId }) : AppDataActions.clear())),
    ),
  );

  load$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.load),
      switchMap(({ applicationId }) =>
        forkJoin({
          epics: this.db.listEpics(applicationId).pipe(map(r => r.epics)),
          rules: this.db.listBusinessRules(applicationId).pipe(map(r => r.rules)),
          agentInfo: this.db.listAgentInfo(applicationId).pipe(map(r => r.info)),
          notes: this.db.listNotes(applicationId).pipe(map(r => r.notes)),
        }).pipe(
          map(({ epics, rules, agentInfo, notes }) => AppDataActions.loadSuccess({ applicationId, epics, rules, agentInfo, notes })),
          catchError((err) => of(AppDataActions.loadFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  createEpic$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.createEpic),
      mergeMap(({ applicationId, input }) =>
        this.db.createEpic(applicationId, input).pipe(
          map((epic) => AppDataActions.createEpicSuccess({ epic })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateEpic$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.updateEpic),
      mergeMap(({ applicationId, epicId, input }) =>
        this.db.updateEpic(applicationId, epicId, input).pipe(
          map((epic) => AppDataActions.updateEpicSuccess({ epic })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteEpic$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.deleteEpic),
      mergeMap(({ applicationId, epicId }) =>
        this.db.deleteEpic(applicationId, epicId).pipe(
          map(() => AppDataActions.deleteEpicSuccess({ epicId })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  createRule$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.createRule),
      mergeMap(({ applicationId, input }) =>
        this.db.createBusinessRule(applicationId, input).pipe(
          map((rule) => AppDataActions.createRuleSuccess({ rule })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateRule$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.updateRule),
      mergeMap(({ applicationId, ruleId, input }) =>
        this.db.updateBusinessRule(applicationId, ruleId, input).pipe(
          map((rule) => AppDataActions.updateRuleSuccess({ rule })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteRule$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.deleteRule),
      mergeMap(({ applicationId, ruleId }) =>
        this.db.deleteBusinessRule(applicationId, ruleId).pipe(
          map(() => AppDataActions.deleteRuleSuccess({ ruleId })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  createNote$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.createNote),
      mergeMap(({ applicationId, input }) =>
        this.db.createNote(applicationId, input).pipe(
          map((note) => AppDataActions.createNoteSuccess({ note })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateNote$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.updateNote),
      mergeMap(({ applicationId, noteId, input }) =>
        this.db.updateNote(applicationId, noteId, input).pipe(
          map((note) => AppDataActions.updateNoteSuccess({ note })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteNote$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.deleteNote),
      mergeMap(({ applicationId, noteId }) =>
        this.db.deleteNote(applicationId, noteId).pipe(
          map(() => AppDataActions.deleteNoteSuccess({ noteId })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  createAgentInfo$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.createAgentInfo),
      mergeMap(({ applicationId, input }) =>
        this.db.createAgentInfo(applicationId, input).pipe(
          map((info) => AppDataActions.createAgentInfoSuccess({ info })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateAgentInfo$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.updateAgentInfo),
      mergeMap(({ applicationId, infoId, input }) =>
        this.db.updateAgentInfo(applicationId, infoId, input).pipe(
          map((info) => AppDataActions.updateAgentInfoSuccess({ info })),
          catchError((err) => of(AppDataActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteAgentInfo$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AppDataActions.deleteAgentInfo),
      mergeMap(({ applicationId, infoId }) =>
        this.db.deleteAgentInfo(applicationId, infoId).pipe(
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
