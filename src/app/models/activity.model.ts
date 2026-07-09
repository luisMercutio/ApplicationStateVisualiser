// A single "Claude done" notification mirrored from the self-hosted ntfy topic.
// The Claude Code Stop hook POSTs these (title + human-readable body) whenever a
// turn ends; the server subscribes to ntfy and streams them to the app over the
// /api/activity WebSocket. Read-only and in-memory — nothing is persisted.
export interface ActivityMessage {
  id: string;
  time: number;      // ntfy publish time, unix seconds
  title: string;     // e.g. "Claude done (Windows): ApplicationStateVisualiser"
  message: string;   // multi-line body: host / tmux / dir
  tags: string[];    // ntfy tags, e.g. ["desktop_computer", "white_check_mark"]
  priority: number;  // ntfy priority 1..5 (3 = default)
}
