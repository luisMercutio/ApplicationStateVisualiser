// Agent + command files, served straight from .claude/ on disk (the source of
// truth Claude Code reads). The app creates, edits, renames and deletes them as
// direct filesystem operations. `kind` selects the .claude subdirectory.

export type MethodologyKind = 'agent' | 'command';

export interface MethodologyFileMeta {
  kind: MethodologyKind;
  name: string;          // filename incl. .md, e.g. "backend-architect.md"
  updatedAt: string;
}

export interface MethodologyFile extends MethodologyFileMeta {
  content: string;
}
