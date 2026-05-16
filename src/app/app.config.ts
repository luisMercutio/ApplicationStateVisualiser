import { ApplicationConfig, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { layoutFeature } from './store/layout/layout.reducer';
import { LayoutEffects } from './store/layout/layout.effects';
import { ucFeature } from './store/uc/uc.reducer';
import { UcEffects } from './store/uc/uc.effects';
import { filesFeature } from './store/files/files.reducer';
import { FilesEffects } from './store/files/files.effects';
import { layoutsFeature } from './store/layouts/layouts.reducer';
import { LayoutsEffects } from './store/layouts/layouts.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    provideAnimationsAsync(),
    provideStore({
      [layoutFeature.name]: layoutFeature.reducer,
      [ucFeature.name]: ucFeature.reducer,
      [filesFeature.name]: filesFeature.reducer,
      [layoutsFeature.name]: layoutsFeature.reducer,
    }),
    provideEffects([LayoutEffects, UcEffects, FilesEffects, LayoutsEffects]),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
  ],
};
