import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { map, catchError, switchMap, withLatestFrom } from 'rxjs/operators';
import { of } from 'rxjs';
import { RulesActions } from './rules.actions';
import { FileService } from '../../services/file.service';
import { selectRootPath } from '../layout/layout.selectors';

@Injectable()
export class RulesEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private fileService = inject(FileService);

  loadRules$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RulesActions.loadRules),
      withLatestFrom(this.store.select(selectRootPath)),
      switchMap(([, root]) => {
        if (!root) return of(RulesActions.loadRulesFailure({ error: 'No root path configured' }));
        return this.fileService.getRulesIndex(root).pipe(
          map((entries) => RulesActions.loadRulesSuccess({ entries: entries ?? [] })),
          catchError((err) => of(RulesActions.loadRulesFailure({ error: err.message ?? 'Failed to load rules' }))),
        );
      }),
    ),
  );
}
