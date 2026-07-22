import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { MatSnackBar } from '@angular/material/snack-bar';
import { switchMap, mergeMap, map, catchError, tap } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';
import { ApplicationsActions } from './applications.actions';
import { DbService } from '../../services/db.service';

@Injectable()
export class ApplicationsEffects {
  private actions$ = inject(Actions);
  private db = inject(DbService);
  private snackBar = inject(MatSnackBar);

  loadApplications$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ApplicationsActions.loadApplications),
      switchMap(() =>
        forkJoin({
          status: this.db.status(),
          applications: this.db.listApplications().pipe(catchError(() => of({ applications: [] }))),
          active: this.db.getActive().pipe(catchError(() => of({ activeId: null }))),
        }).pipe(
          map(({ status, applications, active }) =>
            ApplicationsActions.loadApplicationsSuccess({
              applications: applications.applications,
              activeId: active.activeId,
              storeReady: status.ready,
              storeError: status.error,
            }),
          ),
          catchError(err =>
            of(ApplicationsActions.loadApplicationsFailure({ error: err.error?.error ?? err.message ?? 'Load failed' })),
          ),
        ),
      ),
    ),
  );

  createApplication$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ApplicationsActions.createApplication),
      mergeMap(({ input }) =>
        this.db.createApplication(input).pipe(
          map(application => ApplicationsActions.createApplicationSuccess({ application })),
          catchError(err => of(ApplicationsActions.createApplicationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateApplication$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ApplicationsActions.updateApplication),
      mergeMap(({ id, input }) =>
        this.db.updateApplication(id, input).pipe(
          map(application => ApplicationsActions.updateApplicationSuccess({ application })),
          catchError(err => of(ApplicationsActions.updateApplicationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteApplication$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ApplicationsActions.deleteApplication),
      mergeMap(({ id }) =>
        this.db.deleteApplication(id).pipe(
          map(() => ApplicationsActions.deleteApplicationSuccess({ id })),
          catchError(err => of(ApplicationsActions.deleteApplicationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  setActive$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ApplicationsActions.setActive),
      switchMap(({ id }) =>
        this.db.setActive(id).pipe(
          map(({ activeId }) => ApplicationsActions.setActiveSuccess({ activeId })),
          catchError(err => of(ApplicationsActions.setActiveFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  // Feedback + refresh: after a create/delete the list is already patched in the
  // reducer, but a create returns the server-shaped row so we just toast.
  createdOrUpdated$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ApplicationsActions.createApplicationSuccess, ApplicationsActions.updateApplicationSuccess),
      tap(({ application }) => this.snackBar.open(`Saved "${application.name}"`, '', { duration: 2500 })),
    ), { dispatch: false },
  );

  deleted$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ApplicationsActions.deleteApplicationSuccess),
      tap(() => this.snackBar.open('Application deleted', '', { duration: 2500 })),
    ), { dispatch: false },
  );

  failures$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        ApplicationsActions.createApplicationFailure,
        ApplicationsActions.updateApplicationFailure,
        ApplicationsActions.deleteApplicationFailure,
        ApplicationsActions.setActiveFailure,
      ),
      tap(({ error }) => this.snackBar.open(error, 'Dismiss', { duration: 4500 })),
    ), { dispatch: false },
  );
}

function errMsg(err: unknown): string {
  const e = err as { error?: { error?: string }; message?: string };
  return e?.error?.error ?? e?.message ?? 'Request failed';
}
