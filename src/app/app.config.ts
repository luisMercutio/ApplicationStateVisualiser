import { ApplicationConfig, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { layoutFeature } from './store/layout/layout.reducer';
import { LayoutEffects } from './store/layout/layout.effects';
import { layoutsFeature } from './store/layouts/layouts.reducer';
import { LayoutsEffects } from './store/layouts/layouts.effects';
import { connectionsFeature } from './store/connections/connections.reducer';
import { ConnectionsEffects } from './store/connections/connections.effects';
import { appDataFeature } from './store/app-data/app-data.reducer';
import { AppDataEffects } from './store/app-data/app-data.effects';
import { technicalSpecsFeature } from './store/technical-specs/technical-specs.reducer';
import { TechnicalSpecsEffects } from './store/technical-specs/technical-specs.effects';
import { methodologyFeature } from './store/methodology/methodology.reducer';
import { MethodologyEffects } from './store/methodology/methodology.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    provideAnimationsAsync(),
    provideStore({
      [layoutFeature.name]: layoutFeature.reducer,
      [layoutsFeature.name]: layoutsFeature.reducer,
      [connectionsFeature.name]: connectionsFeature.reducer,
      [appDataFeature.name]: appDataFeature.reducer,
      [technicalSpecsFeature.name]: technicalSpecsFeature.reducer,
      [methodologyFeature.name]: methodologyFeature.reducer,
    }),
    provideEffects([LayoutEffects, LayoutsEffects, ConnectionsEffects, AppDataEffects, TechnicalSpecsEffects, MethodologyEffects]),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
  ],
};
