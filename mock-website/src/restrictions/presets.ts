export type RestrictionKey = 'copy' | 'paste' | 'cut';
export type RestrictionSettings = Record<RestrictionKey, boolean>;
export type ConfigId = 'A' | 'B' | 'C' | 'D' | 'E' | 'custom';
export type PresetId = Exclude<ConfigId, 'custom'>;

export interface Preset {
  id: PresetId;
  name: string;
  summary: string;
  description: string;
  settings: RestrictionSettings;
}

export const RESTRICTION_STORAGE_KEY = 'lumen-mock:restriction-config';

export const PRESETS: Preset[] = [
  {
    id: 'A',
    name: 'Standard',
    summary: 'No restrictions',
    description: 'Copy, cut and paste behave exactly as they do in a normal browser form.',
    settings: { copy: false, paste: false, cut: false },
  },
  {
    id: 'B',
    name: 'Paste restricted',
    summary: 'Paste blocked',
    description: 'paste events on answer fields are intercepted and cancelled.',
    settings: { copy: false, paste: true, cut: false },
  },
  {
    id: 'C',
    name: 'Copy restricted',
    summary: 'Copy blocked',
    description: 'copy events on answer fields are intercepted and cancelled.',
    settings: { copy: true, paste: false, cut: false },
  },
  {
    id: 'D',
    name: 'Copy and paste restricted',
    summary: 'Copy + paste blocked',
    description: 'Both copy and paste events on answer fields are intercepted and cancelled.',
    settings: { copy: true, paste: true, cut: false },
  },
  {
    id: 'E',
    name: 'Combined restrictions',
    summary: 'Copy + paste + cut blocked',
    description: 'Copy, paste and cut events are all intercepted and cancelled (site default).',
    settings: { copy: true, paste: true, cut: true },
  },
];

export const DEFAULT_CONFIG: PresetId = 'E';

export function presetById(id: PresetId): Preset {
  const preset = PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`Unknown configuration: ${id}`);
  return preset;
}

export function settingsFor(id: PresetId): RestrictionSettings {
  return { ...presetById(id).settings };
}

export function matchConfig(settings: RestrictionSettings): ConfigId {
  const match = PRESETS.find(
    (preset) =>
      preset.settings.copy === settings.copy &&
      preset.settings.paste === settings.paste &&
      preset.settings.cut === settings.cut,
  );
  return match ? match.id : 'custom';
}

export const RESTRICTION_LABELS: Record<RestrictionKey, string> = {
  copy: 'Copy',
  paste: 'Paste',
  cut: 'Cut',
};
