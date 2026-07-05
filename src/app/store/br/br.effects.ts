import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { forkJoin, of } from 'rxjs';
import { map, catchError, switchMap, withLatestFrom, debounceTime, filter } from 'rxjs/operators';
import { BrActions } from './br.actions';
import { FileService } from '../../services/file.service';
import { selectRootPath } from '../layout/layout.selectors';
import { selectBrPositions } from './br.selectors';
import { BusinessRule, BrDocument } from '../../models/business-rule.model';
import { FileTreeNode } from '../../models/uc.model';

function findBrFiles(nodes: FileTreeNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.type === 'directory') out.push(...findBrFiles(n.children ?? []));
    else if (n.name === 'business-rules.json') out.push(n.path);
  }
  return out;
}

@Injectable()
export class BrEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private fileService = inject(FileService);

  loadGraph$ = createEffect(() =>
    this.actions$.pipe(
      ofType(BrActions.loadGraph),
      withLatestFrom(this.store.select(selectRootPath)),
      switchMap(([, root]) => {
        if (!root) return of(BrActions.loadGraphFailure({ error: 'No root path configured' }));
        return this.fileService.getTree(root).pipe(
          switchMap(({ tree }) => {
            const paths = findBrFiles(tree);
            const docs$ = paths.length
              ? forkJoin(
                  paths.map((p) =>
                    this.fileService.getFile(root, p).pipe(
                      map((txt) => JSON.parse(txt) as BrDocument),
                      catchError(() => of(null)),
                    ),
                  ),
                )
              : of([] as (BrDocument | null)[]);
            return forkJoin({
              docs: docs$,
              positions: this.fileService.getBrPositions(root).pipe(catchError(() => of({}))),
            });
          }),
          map(({ docs, positions }) => {
            const rules: BusinessRule[] = [];
            for (const d of docs) if (d?.rules) rules.push(...d.rules);
            rules.sort((a, b) => a.seq - b.seq);
            return BrActions.loadGraphSuccess({ rules, positions });
          }),
          catchError((err) => of(BrActions.loadGraphFailure({ error: err.message ?? 'Failed to load BR graph' }))),
        );
      }),
    ),
  );

  persistPositions$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(BrActions.setPosition, BrActions.relayout),
        debounceTime(500),
        withLatestFrom(this.store.select(selectRootPath), this.store.select(selectBrPositions)),
        filter(([, root]) => !!root),
        switchMap(([, root, positions]) =>
          this.fileService.saveBrPositions(root!, positions).pipe(catchError(() => of(null))),
        ),
      ),
    { dispatch: false },
  );
}
