import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { mergeMap, map, catchError, withLatestFrom, filter } from 'rxjs/operators';
import { of } from 'rxjs';
import { ResourcesActions } from './resources.actions';
import { FileService } from '../../services/file.service';
import { resourcesFeature } from './resources.reducer';

@Injectable()
export class ResourcesEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private fileService = inject(FileService);

  loadTree$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ResourcesActions.loadTree),
      mergeMap(() =>
        this.fileService.getResourcesTree().pipe(
          map(({ tree }) => ResourcesActions.loadTreeSuccess({ tree })),
          catchError((err) => of(ResourcesActions.loadTreeFailure({ error: err.message ?? 'Failed to load resources' }))),
        ),
      ),
    ),
  );

  loadFile$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ResourcesActions.loadFile),
      withLatestFrom(this.store.select(resourcesFeature.selectOriginal)),
      filter(([{ path }, original]) => !(path in original)),
      mergeMap(([{ path }]) =>
        this.fileService.getResourceFile(path).pipe(
          map((content) => ResourcesActions.loadFileSuccess({ path, content })),
          catchError((err) => of(ResourcesActions.loadFileFailure({ path, error: err.message ?? 'File not found' }))),
        ),
      ),
    ),
  );

  saveFile$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ResourcesActions.saveFile),
      mergeMap(({ path, content }) =>
        this.fileService.saveResourceFile(path, content).pipe(
          map(() => ResourcesActions.saveFileSuccess({ path, content })),
          catchError((err) => of(ResourcesActions.saveFileFailure({ path, error: err.message ?? 'Save failed' }))),
        ),
      ),
    ),
  );
}
