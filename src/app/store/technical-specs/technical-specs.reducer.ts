import { createFeature, createReducer, on } from '@ngrx/store';
import { TechnicalSpec, TechnicalSpecArtifact, TechnicalSpecEntry } from '../../models/technical-spec.model';
import { TechnicalSpecsActions } from './technical-specs.actions';

export interface TechnicalSpecsState {
  connectionId: string | null; // which connection the specs belong to
  specs: TechnicalSpec[];
  loading: boolean;
  error: string | null;
}

const initialState: TechnicalSpecsState = {
  connectionId: null,
  specs: [],
  loading: false,
  error: null,
};

function upsertSpec(specs: TechnicalSpec[], spec: TechnicalSpec): TechnicalSpec[] {
  const idx = specs.findIndex(s => s.id === spec.id);
  return idx >= 0 ? specs.map(s => (s.id === spec.id ? spec : s)) : [...specs, spec];
}

function upsertEntry(entries: TechnicalSpecEntry[], entry: TechnicalSpecEntry): TechnicalSpecEntry[] {
  const idx = entries.findIndex(e => e.id === entry.id);
  return idx >= 0 ? entries.map(e => (e.id === entry.id ? entry : e)) : [...entries, entry];
}

function upsertArtifact(artifacts: TechnicalSpecArtifact[], artifact: TechnicalSpecArtifact): TechnicalSpecArtifact[] {
  const idx = artifacts.findIndex(a => a.id === artifact.id);
  return idx >= 0 ? artifacts.map(a => (a.id === artifact.id ? artifact : a)) : [...artifacts, artifact];
}

// Patch a single spec (identified by id) within the list via a producer.
function patchSpec(specs: TechnicalSpec[], specId: string, fn: (s: TechnicalSpec) => TechnicalSpec): TechnicalSpec[] {
  return specs.map(s => (s.id === specId ? fn(s) : s));
}

export const technicalSpecsFeature = createFeature({
  name: 'technicalSpecs',
  reducer: createReducer(
    initialState,
    on(TechnicalSpecsActions.load, (state, { connectionId }) => ({ ...state, loading: true, error: null, connectionId })),
    on(TechnicalSpecsActions.loadSuccess, (state, { connectionId, specs }) => ({
      ...state, connectionId, specs, loading: false, error: null,
    })),
    on(TechnicalSpecsActions.loadFailure, (state, { error }) => ({ ...state, loading: false, error })),
    on(TechnicalSpecsActions.clear, () => ({ ...initialState })),

    on(TechnicalSpecsActions.createSpecSuccess, TechnicalSpecsActions.updateSpecSuccess, (state, { spec }) => ({
      ...state, specs: upsertSpec(state.specs, spec), error: null,
    })),
    on(TechnicalSpecsActions.deleteSpecSuccess, (state, { specId }) => ({
      ...state, specs: state.specs.filter(s => s.id !== specId),
    })),

    // Child mutations return the child; patch the embedded array on its parent spec.
    on(TechnicalSpecsActions.createEntrySuccess, TechnicalSpecsActions.updateEntrySuccess, (state, { entry }) => ({
      ...state,
      specs: patchSpec(state.specs, entry.technicalSpecificationId, s => ({
        ...s, entries: upsertEntry(s.entries, entry),
      })),
      error: null,
    })),
    on(TechnicalSpecsActions.deleteEntrySuccess, (state, { specId, entryId }) => ({
      ...state,
      specs: patchSpec(state.specs, specId, s => ({ ...s, entries: s.entries.filter(e => e.id !== entryId) })),
    })),

    on(TechnicalSpecsActions.createArtifactSuccess, TechnicalSpecsActions.updateArtifactSuccess, (state, { artifact }) => ({
      ...state,
      specs: patchSpec(state.specs, artifact.technicalSpecificationId, s => ({
        ...s, artifacts: upsertArtifact(s.artifacts, artifact),
      })),
      error: null,
    })),
    on(TechnicalSpecsActions.deleteArtifactSuccess, (state, { specId, artifactId }) => ({
      ...state,
      specs: patchSpec(state.specs, specId, s => ({ ...s, artifacts: s.artifacts.filter(a => a.id !== artifactId) })),
    })),

    on(TechnicalSpecsActions.mutationFailure, (state, { error }) => ({ ...state, error })),
  ),
});
