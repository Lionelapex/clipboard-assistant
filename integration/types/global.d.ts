export {};

declare global {
  interface Window {
    __clipboardAssistantMock?: {
      getConfig: () => {
        configId: 'A' | 'B' | 'C' | 'D' | 'E' | 'custom';
        settings: { copy: boolean; paste: boolean; cut: boolean };
      };
      setConfig: (id: 'A' | 'B' | 'C' | 'D' | 'E') => void;
      getEvents: () => Array<{
        id: number;
        type: 'copy' | 'paste' | 'cut' | 'programmatic-input';
        blocked: boolean;
        field: string;
        at: number;
      }>;
      clearEvents: () => void;
    };
  }
}
