import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { MatSnackBar } from '@angular/material/snack-bar';
import { switchMap, mergeMap, map, catchError, tap } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';
import { ConnectionsActions } from './connections.actions';
import { DbService } from '../../services/db.service';

@Injectable()
export class ConnectionsEffects {
  private actions$ = inject(Actions);
  private db = inject(DbService);
  private snackBar = inject(MatSnackBar);

  loadConnections$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectionsActions.loadConnections),
      switchMap(() =>
        forkJoin({
          status: this.db.status(),
          connections: this.db.list().pipe(catchError(() => of([]))),
          active: this.db.getActive().pipe(catchError(() => of({ activeId: null }))),
        }).pipe(
          map(({ status, connections, active }) =>
            ConnectionsActions.loadConnectionsSuccess({
              connections,
              activeId: active.activeId,
              storeReady: status.ready,
              storeError: status.error,
            }),
          ),
          catchError(err =>
            of(ConnectionsActions.loadConnectionsFailure({ error: err.error?.error ?? err.message ?? 'Load failed' })),
          ),
        ),
      ),
    ),
  );

  createConnection$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectionsActions.createConnection),
      mergeMap(({ input }) =>
        this.db.create(input).pipe(
          map(connection => ConnectionsActions.createConnectionSuccess({ connection })),
          catchError(err => of(ConnectionsActions.createConnectionFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateConnection$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectionsActions.updateConnection),
      mergeMap(({ id, input }) =>
        this.db.update(id, input).pipe(
          map(connection => ConnectionsActions.updateConnectionSuccess({ connection })),
          catchError(err => of(ConnectionsActions.updateConnectionFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteConnection$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectionsActions.deleteConnection),
      mergeMap(({ id }) =>
        this.db.remove(id).pipe(
          map(() => ConnectionsActions.deleteConnectionSuccess({ id })),
          catchError(err => of(ConnectionsActions.deleteConnectionFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  setActive$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectionsActions.setActive),
      switchMap(({ id }) =>
        this.db.setActive(id).pipe(
          map(({ activeId }) => ConnectionsActions.setActiveSuccess({ activeId })),
          catchError(err => of(ConnectionsActions.setActiveFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  // Feedback + refresh: after a create/delete the list is already patched in the
  // reducer, but a create returns the server-shaped row so we just toast.
  createdOrUpdated$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectionsActions.createConnectionSuccess, ConnectionsActions.updateConnectionSuccess),
      tap(({ connection }) => this.snackBar.open(`Saved "${connection.name}"`, '', { duration: 2500 })),
    ), { dispatch: false },
  );

  deleted$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ConnectionsActions.deleteConnectionSuccess),
      tap(() => this.snackBar.open('Connection deleted', '', { duration: 2500 })),
    ), { dispatch: false },
  );

  failures$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        ConnectionsActions.createConnectionFailure,
        ConnectionsActions.updateConnectionFailure,
        ConnectionsActions.deleteConnectionFailure,
        ConnectionsActions.setActiveFailure,
      ),
      tap(({ error }) => this.snackBar.open(error, 'Dismiss', { duration: 4500 })),
    ), { dispatch: false },
  );
}

function errMsg(err: unknown): string {
  const e = err as { error?: { error?: string }; message?: string };
  return e?.error?.error ?? e?.message ?? 'Request failed';
}
