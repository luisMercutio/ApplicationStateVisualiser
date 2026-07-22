import { createActionGroup, emptyProps, props } from '@ngrx/store';
import {
  TechnicalSpec, TechnicalSpecArtifact, TechnicalSpecArtifactInput,
  TechnicalSpecEntry, TechnicalSpecEntryInput, TechnicalSpecInput,
} from '../../models/technical-spec.model';

// Technical Specifications for the ACTIVE application database. Every mutating
// action carries the connection id it targets (mirrors AppData) so effects never
// race against a change of active connection. Child (entry/artifact) mutations
// return the updated parent spec, which is upserted into state.
export const TechnicalSpecsActions = createActionGroup({
  source: 'TechnicalSpecs',
  events: {
    'Load': props<{ connectionId: string }>(),
    'Load Success': props<{ connectionId: string; specs: TechnicalSpec[] }>(),
    'Load Failure': props<{ error: string }>(),
    'Clear': emptyProps(), // no active connection

    'Create Spec': props<{ connectionId: string; input: TechnicalSpecInput }>(),
    'Create Spec Success': props<{ spec: TechnicalSpec }>(),
    'Update Spec': props<{ connectionId: string; specId: string; input: TechnicalSpecInput }>(),
    'Update Spec Success': props<{ spec: TechnicalSpec }>(),
    'Delete Spec': props<{ connectionId: string; specId: string }>(),
    'Delete Spec Success': props<{ specId: string }>(),

    'Create Entry': props<{ connectionId: string; specId: string; input: TechnicalSpecEntryInput }>(),
    'Create Entry Success': props<{ entry: TechnicalSpecEntry }>(),
    'Update Entry': props<{ connectionId: string; specId: string; entryId: string; input: TechnicalSpecEntryInput }>(),
    'Update Entry Success': props<{ entry: TechnicalSpecEntry }>(),
    'Delete Entry': props<{ connectionId: string; specId: string; entryId: string }>(),
    'Delete Entry Success': props<{ specId: string; entryId: string }>(),

    'Create Artifact': props<{ connectionId: string; specId: string; input: TechnicalSpecArtifactInput }>(),
    'Create Artifact Success': props<{ artifact: TechnicalSpecArtifact }>(),
    'Update Artifact': props<{ connectionId: string; specId: string; artifactId: string; input: TechnicalSpecArtifactInput }>(),
    'Update Artifact Success': props<{ artifact: TechnicalSpecArtifact }>(),
    'Delete Artifact': props<{ connectionId: string; specId: string; artifactId: string }>(),
    'Delete Artifact Success': props<{ specId: string; artifactId: string }>(),

    'Mutation Failure': props<{ error: string }>(),
  },
});
