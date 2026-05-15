import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { tap, withLatestFrom } from 'rxjs/operators';
import { LayoutActions } from './layout.actions';
import { selectLayoutState } from './layout.selectors';

@Injectable()
export class LayoutEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);

  persistLayout$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          LayoutActions.setRootPath,
          LayoutActions.setGlobalUc,
          LayoutActions.addPanel,
          LayoutActions.removePanel,
          LayoutActions.updatePanel,
          LayoutActions.updatePanels,
          LayoutActions.togglePin,
          LayoutActions.pinUc,
        ),
        withLatestFrom(this.store.select(selectLayoutState)),
        tap(([, state]) => {
          try {
            localStorage.setItem('uc-layout', JSON.stringify(state));
          } catch {}
        }),
      ),
    { dispatch: false },
  );
}
