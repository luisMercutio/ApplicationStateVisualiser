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

@Injectable()
export class AppDataEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private db = inject(DbService);
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
        }).pipe(
          map(({ epics, rules, agentInfo }) => AppDataActions.loadSuccess({ connectionId, epics, rules, agentInfo })),
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
