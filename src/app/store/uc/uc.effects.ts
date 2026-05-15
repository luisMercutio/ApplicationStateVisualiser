import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { switchMap, map, catchError, withLatestFrom } from 'rxjs/operators';
import { of } from 'rxjs';
import { UcActions } from './uc.actions';
import { FileService } from '../../services/file.service';
import { selectRootPath } from '../layout/layout.selectors';

@Injectable()
export class UcEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private fileService = inject(FileService);

  loadUsecases$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UcActions.loadUsecases),
      withLatestFrom(this.store.select(selectRootPath)),
      switchMap(([, rootPath]) => {
        if (!rootPath) return of(UcActions.loadUsecasesFailure({ error: 'No root path' }));
        return this.fileService.getFile(rootPath, 'usecases.md').pipe(
          map(content => {
            const usecases = parseUsecasesMd(content);
            return UcActions.loadUsecasesSuccess({ usecases });
          }),
          catchError(err => of(UcActions.loadUsecasesFailure({ error: err.message }))),
        );
      }),
    ),
  );
}

function parseUsecasesMd(md: string) {
  const lines = md.split('\n');
  const tableLines = lines.filter(l => l.trim().startsWith('|') && !l.includes('---'));
  const dataLines = tableLines.slice(1);
  return dataLines
    .map(line => {
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length < 4) return null;
      return {
        id: cols[0],
        title: cols[1],
        status: cols[2] as any,
        updated: cols[3],
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}
