import type { ConfigId, PresetId, RestrictionSettings } from './presets';

export interface MockClipboardEvent {
  id: number;
  type: 'copy' | 'paste' | 'cut' | 'programmatic-input';
  blocked: boolean;
  field: string;
  at: number;
}

/** Test hook exposed on window (integration/configuration documents its use). */
export interface MockTestHook {
  getConfig: () => { configId: ConfigId; settings: RestrictionSettings };
  setConfig: (id: PresetId) => void;
  getEvents: () => MockClipboardEvent[];
  clearEvents: () => void;
}

declare global {
  interface Window {
    __clipboardAssistantMock?: MockTestHook;
  }
}

export {};
