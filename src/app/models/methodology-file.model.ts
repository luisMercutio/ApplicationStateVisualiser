// Agent + command files, stored in and served from the MASTER database. The app
// edits them in place (write-through keeps the on-disk .claude/ copy in sync so
// Claude Code still sees them). `kind` selects the .claude subdirectory.

export type MethodologyKind = 'agent' | 'command';

export interface MethodologyFileMeta {
  kind: MethodologyKind;
  name: string;          // filename incl. .md, e.g. "backend-architect.md"
  updatedAt: string;
}

export interface MethodologyFile extends MethodologyFileMeta {
  content: string;
}
