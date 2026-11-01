import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_CONFIG,
  PRESETS,
  RESTRICTION_STORAGE_KEY,
  matchConfig,
  presetById,
  settingsFor,
  type ConfigId,
  type PresetId,
  type RestrictionKey,
  type RestrictionSettings,
} from './presets';
import type { MockClipboardEvent } from './testHook';

interface RestrictionContextValue {
  configId: ConfigId;
  settings: RestrictionSettings;
  selectConfig: (id: PresetId) => void;
  toggle: (key: RestrictionKey) => void;
  events: MockClipboardEvent[];
  logEvent: (event: Omit<MockClipboardEvent, 'id' | 'at'>) => void;
  clearEvents: () => void;
}

const RestrictionContext = createContext<RestrictionContextValue | null>(null);

function loadStoredSettings(): { settings: RestrictionSettings; id: PresetId } {
  try {
    const raw = window.localStorage.getItem(RESTRICTION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: PresetId };
      if (parsed?.id && PRESETS.some((preset) => preset.id === parsed.id)) {
        return { settings: settingsFor(parsed.id), id: parsed.id };
      }
    }
  } catch {
    /* ignore malformed storage */
  }
  return { settings: settingsFor(DEFAULT_CONFIG), id: DEFAULT_CONFIG };
}

export function RestrictionProvider({ children }: { children: ReactNode }) {
  const initial = useRef(loadStoredSettings());
  const [settings, setSettings] = useState<RestrictionSettings>(initial.current.settings);
  const [configId, setConfigId] = useState<ConfigId>(initial.current.id);
  const [events, setEvents] = useState<MockClipboardEvent[]>([]);
  const eventId = useRef(0);

  const persist = useCallback((next: RestrictionSettings, id: PresetId) => {
    try {
      window.localStorage.setItem(RESTRICTION_STORAGE_KEY, JSON.stringify({ id, settings: next }));
    } catch {
      /* storage may be unavailable in private mode */
    }
  }, []);

  const selectConfig = useCallback(
    (id: PresetId) => {
      const next = settingsFor(id);
      setSettings(next);
      setConfigId(id);
      persist(next, id);
    },
    [persist],
  );

  const toggle = useCallback(
    (key: RestrictionKey) => {
      setSettings((current) => {
        const next = { ...current, [key]: !current[key] };
        const id = matchConfig(next);
        setConfigId(id);
        if (id !== 'custom') persist(next, id);
        return next;
      });
    },
    [persist],
  );

  const logEvent = useCallback((event: Omit<MockClipboardEvent, 'id' | 'at'>) => {
    eventId.current += 1;
    const entry: MockClipboardEvent = { ...event, id: eventId.current, at: Date.now() };
    setEvents((current) => [entry, ...current].slice(0, 40));
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);

  const value = useMemo<RestrictionContextValue>(
    () => ({ configId, settings, selectConfig, toggle, events, logEvent, clearEvents }),
    [configId, settings, selectConfig, toggle, events, logEvent, clearEvents],
  );

  // Documented test hook used by the Playwright suite.
  useEffect(() => {
    window.__clipboardAssistantMock = {
      getConfig: () => ({ configId, settings }),
      setConfig: (id: PresetId) => selectConfig(id),
      getEvents: () => events,
      clearEvents,
    };
    return () => {
      delete window.__clipboardAssistantMock;
    };
  }, [configId, settings, selectConfig, events, clearEvents]);

  return <RestrictionContext.Provider value={value}>{children}</RestrictionContext.Provider>;
}

export function useRestrictions(): RestrictionContextValue {
  const value = useContext(RestrictionContext);
  if (!value) throw new Error('useRestrictions must be used inside a RestrictionProvider');
  return value;
}

export { presetById };
