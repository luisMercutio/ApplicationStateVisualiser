import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { switchMap, map, catchError, withLatestFrom, filter } from 'rxjs/operators';
import { of } from 'rxjs';
import { FilesActions } from './files.actions';
import { FileService } from '../../services/file.service';
import { selectRootPath } from '../layout/layout.selectors';
import { selectCache } from './files.selectors';

@Injectable()
export class FilesEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private fileService = inject(FileService);

  loadFile$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FilesActions.loadFile),
      withLatestFrom(this.store.select(selectRootPath), this.store.select(selectCache)),
      filter(([{ path }, , cache]) => !(path in cache)),
      switchMap(([{ path }, rootPath]) => {
        if (!rootPath) {
          return of(FilesActions.loadFileFailure({ path, error: 'No root path configured' }));
        }
        return this.fileService.getFile(rootPath, path).pipe(
          map(content => FilesActions.loadFileSuccess({ path, content })),
          catchError(err => of(FilesActions.loadFileFailure({ path, error: err.message ?? 'File not found' }))),
        );
      }),
    ),
  );
}
