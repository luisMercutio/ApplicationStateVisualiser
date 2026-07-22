import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { MethodologyFileMeta, MethodologyKind } from '../../models/methodology-file.model';

// Editing agent + command files backed by the MASTER database. A file is keyed
// by `${kind}/${name}` (its `key`) throughout the store; the kind/name pair is
// carried on the actions that need to reach the API.
export const MethodologyActions = createActionGroup({
  source: 'Methodology',
  events: {
    'Load Files': emptyProps(),
    'Load Files Success': props<{ files: MethodologyFileMeta[] }>(),
    'Load Files Failure': props<{ error: string }>(),
    'Select File': props<{ key: string }>(),
    'Load File': props<{ kind: MethodologyKind; name: string }>(),
    'Load File Success': props<{ key: string; content: string }>(),
    'Load File Failure': props<{ key: string; error: string }>(),
    'Set Draft': props<{ key: string; content: string }>(),
    'Save File': props<{ kind: MethodologyKind; name: string; content: string }>(),
    'Save File Success': props<{ key: string; content: string }>(),
    'Save File Failure': props<{ key: string; error: string }>(),
    'Create File': props<{ kind: MethodologyKind; name: string; content: string }>(),
    'Create File Failure': props<{ error: string }>(),
    'Delete File': props<{ kind: MethodologyKind; name: string }>(),
    'Delete File Success': props<{ key: string }>(),
    'Delete File Failure': props<{ key: string; error: string }>(),
    'Rename File': props<{ kind: MethodologyKind; name: string; newName: string }>(),
    'Rename File Success': props<{ oldKey: string }>(),
    'Rename File Failure': props<{ key: string; error: string }>(),
  },
});

/** The stable store key for a methodology file. */
export function methodologyKey(kind: MethodologyKind, name: string): string {
  return `${kind}/${name}`;
}
