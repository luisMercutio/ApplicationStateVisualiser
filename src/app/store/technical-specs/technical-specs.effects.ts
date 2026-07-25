import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { MatSnackBar } from '@angular/material/snack-bar';
import { switchMap, mergeMap, map, catchError, tap, withLatestFrom } from 'rxjs/operators';
import { of } from 'rxjs';
import { TechnicalSpecsActions } from './technical-specs.actions';
import { ApplicationsActions } from '../applications/applications.actions';
import { selectActiveId } from '../applications/applications.selectors';
import { DbService } from '../../services/db.service';

@Injectable()
export class TechnicalSpecsEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private db = inject(DbService);
  private snackBar = inject(MatSnackBar);

  // When the active connection changes, (re)load its technical specs.
  reloadOnActiveChange$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ApplicationsActions.setActiveSuccess, ApplicationsActions.loadApplicationsSuccess),
      withLatestFrom(this.store.select(selectActiveId)),
      map(([, activeId]) => (activeId ? TechnicalSpecsActions.load({ connectionId: activeId }) : TechnicalSpecsActions.clear())),
    ),
  );

  load$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TechnicalSpecsActions.load),
      switchMap(({ connectionId }) =>
        this.db.listTechnicalSpecs(connectionId).pipe(
          map((r) => TechnicalSpecsActions.loadSuccess({ connectionId, specs: r.specs })),
          catchError((err) => of(TechnicalSpecsActions.loadFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  createSpec$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TechnicalSpecsActions.createSpec),
      mergeMap(({ connectionId, input }) =>
        this.db.createTechnicalSpec(connectionId, input).pipe(
          map((spec) => TechnicalSpecsActions.createSpecSuccess({ spec })),
          catchError((err) => of(TechnicalSpecsActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateSpec$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TechnicalSpecsActions.updateSpec),
      mergeMap(({ connectionId, specId, input }) =>
        this.db.updateTechnicalSpec(connectionId, specId, input).pipe(
          map((spec) => TechnicalSpecsActions.updateSpecSuccess({ spec })),
          catchError((err) => of(TechnicalSpecsActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteSpec$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TechnicalSpecsActions.deleteSpec),
      mergeMap(({ connectionId, specId }) =>
        this.db.deleteTechnicalSpec(connectionId, specId).pipe(
          map(() => TechnicalSpecsActions.deleteSpecSuccess({ specId })),
          catchError((err) => of(TechnicalSpecsActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  createEntry$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TechnicalSpecsActions.createEntry),
      mergeMap(({ connectionId, specId, input }) =>
        this.db.createSpecEntry(connectionId, specId, input).pipe(
          map((entry) => TechnicalSpecsActions.createEntrySuccess({ entry })),
          catchError((err) => of(TechnicalSpecsActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateEntry$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TechnicalSpecsActions.updateEntry),
      mergeMap(({ connectionId, specId, entryId, input }) =>
        this.db.updateSpecEntry(connectionId, specId, entryId, input).pipe(
          map((entry) => TechnicalSpecsActions.updateEntrySuccess({ entry })),
          catchError((err) => of(TechnicalSpecsActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteEntry$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TechnicalSpecsActions.deleteEntry),
      mergeMap(({ connectionId, specId, entryId }) =>
        this.db.deleteSpecEntry(connectionId, specId, entryId).pipe(
          map(() => TechnicalSpecsActions.deleteEntrySuccess({ specId, entryId })),
          catchError((err) => of(TechnicalSpecsActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  createArtifact$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TechnicalSpecsActions.createArtifact),
      mergeMap(({ connectionId, specId, input }) =>
        this.db.createSpecArtifact(connectionId, specId, input).pipe(
          map((artifact) => TechnicalSpecsActions.createArtifactSuccess({ artifact })),
          catchError((err) => of(TechnicalSpecsActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  updateArtifact$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TechnicalSpecsActions.updateArtifact),
      mergeMap(({ connectionId, specId, artifactId, input }) =>
        this.db.updateSpecArtifact(connectionId, specId, artifactId, input).pipe(
          map((artifact) => TechnicalSpecsActions.updateArtifactSuccess({ artifact })),
          catchError((err) => of(TechnicalSpecsActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  deleteArtifact$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TechnicalSpecsActions.deleteArtifact),
      mergeMap(({ connectionId, specId, artifactId }) =>
        this.db.deleteSpecArtifact(connectionId, specId, artifactId).pipe(
          map(() => TechnicalSpecsActions.deleteArtifactSuccess({ specId, artifactId })),
          catchError((err) => of(TechnicalSpecsActions.mutationFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  failures$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TechnicalSpecsActions.mutationFailure, TechnicalSpecsActions.loadFailure),
      tap(({ error }) => this.snackBar.open(error, 'Dismiss', { duration: 4500 })),
    ), { dispatch: false },
  );
}

function errMsg(err: unknown): string {
  const e = err as { error?: { error?: string }; message?: string };
  return e?.error?.error ?? e?.message ?? 'Request failed';
}
