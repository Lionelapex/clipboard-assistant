type Handler = () => void;
type StatusHandler = (status: { kind: 'success' | 'error' | 'info'; text: string; detail?: string }) => void;

const toggleHandlers = new Set<Handler>();
const openHandlers = new Set<Handler>();
const statusHandlers = new Set<StatusHandler>();

/** Registers a listener for the "toggle panel" command (keyboard shortcut). */
export function onTogglePanel(handler: Handler): () => void {
  toggleHandlers.add(handler);
  return () => {
    toggleHandlers.delete(handler);
  };
}

export function emitTogglePanel(): void {
  toggleHandlers.forEach((handler) => handler());
}

/** Registers a listener for "open panel" requests coming from the toolbar popup. */
export function onOpenPanel(handler: Handler): () => void {
  openHandlers.add(handler);
  return () => {
    openHandlers.delete(handler);
  };
}

export function emitOpenPanel(): void {
  openHandlers.forEach((handler) => handler());
}

/** Shows a status message in the floating panel, opening it if necessary. */
export function onFlashStatus(handler: StatusHandler): () => void {
  statusHandlers.add(handler);
  return () => {
    statusHandlers.delete(handler);
  };
}

export function emitFlashStatus(status: { kind: 'success' | 'error' | 'info'; text: string; detail?: string }): void {
  statusHandlers.forEach((handler) => handler(status));
}
