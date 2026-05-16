import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { MatSnackBar } from '@angular/material/snack-bar';
import { switchMap, mergeMap, map, catchError, withLatestFrom, tap, filter } from 'rxjs/operators';
import { of, EMPTY } from 'rxjs';
import { LayoutsActions } from './layouts.actions';
import { LayoutActions } from '../layout/layout.actions';
import { FileService } from '../../services/file.service';
import { selectRootPath } from '../layout/layout.selectors';
import { selectPanels } from '../layout/layout.selectors';

@Injectable()
export class LayoutsEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private fileService = inject(FileService);
  private snackBar = inject(MatSnackBar);

  loadLayouts$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LayoutsActions.loadLayouts),
      switchMap(() =>
        this.fileService.listLayouts().pipe(
          map(names => LayoutsActions.loadLayoutsSuccess({ names })),
          catchError(() => of(LayoutsActions.loadLayoutsSuccess({ names: [] }))),
        ),
      ),
    ),
  );

  loadOnRootChange$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LayoutActions.setRootPath),
      filter(({ rootPath }) => !!rootPath),
      map(() => LayoutsActions.loadLayouts()),
    ),
  );

  applyLayout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LayoutsActions.applyLayout),
      switchMap(({ name }) =>
        this.fileService.getLayout(name).pipe(
          map(panels => LayoutActions.updatePanels({ panels })),
          catchError(() => EMPTY),
        ),
      ),
    ),
  );

  saveLayout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LayoutsActions.saveLayout),
      withLatestFrom(this.store.select(selectPanels)),
      switchMap(([{ name }, panels]) =>
        this.fileService.saveLayout(name, panels).pipe(
          map(() => LayoutsActions.saveLayoutSuccess({ name })),
          catchError(err => of(LayoutsActions.saveLayoutFailure({ error: err.message ?? 'Save failed' }))),
        ),
      ),
    ),
  );

  saveSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LayoutsActions.saveLayoutSuccess),
      tap(({ name }) => this.snackBar.open(`Layout "${name}" saved`, '', { duration: 2500 })),
      map(() => LayoutsActions.loadLayouts()),
    ),
  );

  saveFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LayoutsActions.saveLayoutFailure),
      tap(({ error }) => this.snackBar.open(`Save failed: ${error}`, 'Dismiss', { duration: 4000 })),
    ), { dispatch: false },
  );

  deleteLayout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LayoutsActions.deleteLayout),
      mergeMap(({ name }) =>
        this.fileService.deleteLayout(name).pipe(
          map(() => LayoutsActions.deleteLayoutSuccess({ name })),
          catchError(err => of(LayoutsActions.deleteLayoutFailure({ error: err.message ?? 'Delete failed' }))),
        ),
      ),
    ),
  );

  deleteSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LayoutsActions.deleteLayoutSuccess),
      tap(({ name }) => this.snackBar.open(`Layout "${name}" deleted`, '', { duration: 2500 })),
      map(() => LayoutsActions.loadLayouts()),
    ),
  );

  deleteFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LayoutsActions.deleteLayoutFailure),
      tap(({ error }) => this.snackBar.open(`Delete failed: ${error}`, 'Dismiss', { duration: 4000 })),
    ), { dispatch: false },
  );
}