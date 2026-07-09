// A free-form idea kept against an application: a title, a description, and an
// OPTIONAL set of Business Rule references (free-form ids/slugs — may be empty).
// Stored in the active connection's OWN database (the `notes` table), like Epics
// and Business Rules. Mirrors the db-store.js DTO (related_brs is a JSON column
// there, a plain string[] here).
export interface Note {
  id: string;
  title: string;
  description: string | null;
  relatedBrs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteInput {
  title: string;
  description?: string | null;
  relatedBrs?: string[];
}
