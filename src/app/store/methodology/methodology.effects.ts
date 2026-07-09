import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { mergeMap, map, catchError, withLatestFrom, filter } from 'rxjs/operators';
import { of } from 'rxjs';
import { MethodologyActions, methodologyKey } from './methodology.actions';
import { DbService } from '../../services/db.service';
import { methodologyFeature } from './methodology.reducer';

@Injectable()
export class MethodologyEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private db = inject(DbService);

  loadFiles$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MethodologyActions.loadFiles),
      mergeMap(() =>
        this.db.listMethodology().pipe(
          map(({ files }) => MethodologyActions.loadFilesSuccess({ files })),
          catchError((err) => of(MethodologyActions.loadFilesFailure({ error: errMsg(err) }))),
        ),
      ),
    ),
  );

  loadFile$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MethodologyActions.loadFile),
      withLatestFrom(this.store.select(methodologyFeature.selectOriginal)),
      filter(([{ kind, name }, original]) => !(methodologyKey(kind, name) in original)),
      mergeMap(([{ kind, name }]) =>
        this.db.getMethodology(kind, name).pipe(
          map((file) => MethodologyActions.loadFileSuccess({ key: methodologyKey(kind, name), content: file.content })),
          catchError((err) => of(MethodologyActions.loadFileFailure({ key: methodologyKey(kind, name), error: errMsg(err) }))),
        ),
      ),
    ),
  );

  saveFile$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MethodologyActions.saveFile),
      mergeMap(({ kind, name, content }) =>
        this.db.saveMethodology(kind, name, content).pipe(
          map(() => MethodologyActions.saveFileSuccess({ key: methodologyKey(kind, name), content })),
          catchError((err) => of(MethodologyActions.saveFileFailure({ key: methodologyKey(kind, name), error: errMsg(err) }))),
        ),
      ),
    ),
  );
}

function errMsg(err: unknown): string {
  const e = err as { error?: { error?: string }; message?: string };
  return e?.error?.error ?? e?.message ?? 'Request failed';
}
