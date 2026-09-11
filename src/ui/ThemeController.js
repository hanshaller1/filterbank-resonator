const STORAGE_KEY = 'syntakt-theme-v1';
const THEMES = {
  graphite: { bg: '#101216', panel: '#191d23', panelSecondary: '#11151a', border: '#303741', text: '#e9edf2', muted: '#9aa7b4', accent: '#eaa66c', accentMuted: '#b86f3c', control: '#11151a', active: '#16382a', meter: '#65c391', warning: '#e0b04d', visualizer: '#0d1116', sources: ['#73a9c9', '#d29a6a', '#7fba9b', '#ba88b5', '#b7ad69', '#9b9fb7'] },
  midnight: { bg: '#0d121a', panel: '#151d27', panelSecondary: '#101720', border: '#2c3a4a', text: '#e2eaf2', muted: '#93a8bd', accent: '#79a8c9', accentMuted: '#416b8d', control: '#0f1721', active: '#17362f', meter: '#70b5a0', warning: '#c9a765', visualizer: '#0b1119', sources: ['#77afd2', '#d19a72', '#83b99f', '#bd8bb3', '#b9b173', '#9ca9bd'] },
  slate: { bg: '#171b20', panel: '#242a31', panelSecondary: '#1a2027', border: '#414c58', text: '#edf1f4', muted: '#aeb9c4', accent: '#aeb9c4', accentMuted: '#6f8395', control: '#171d23', active: '#214137', meter: '#78c39a', warning: '#d4b36b', visualizer: '#141a20', sources: ['#78a6c6', '#d3a47b', '#86b79f', '#bd91b8', '#bbb37f', '#a5adbd'] },
  forest: { bg: '#0f1513', panel: '#19221e', panelSecondary: '#111a16', border: '#304238', text: '#e4ede7', muted: '#9eb1a5', accent: '#a6c59d', accentMuted: '#60866d', control: '#101914', active: '#1d3d2f', meter: '#7bc29c', warning: '#cfb678', visualizer: '#0c1410', sources: ['#76adc0', '#d1a275', '#83bd96', '#bd8caf', '#b7ae72', '#9da9a0'] },
  warmStudio: { bg: '#171311', panel: '#251e1a', panelSecondary: '#1b1613', border: '#4a3a30', text: '#f0e8df', muted: '#b9a99b', accent: '#ddb17c', accentMuted: '#9e6948', control: '#191411', active: '#3a2e22', meter: '#a7c18f', warning: '#e0b269', visualizer: '#15100d', sources: ['#72a7bd', '#d99868', '#87b693', '#b7889d', '#c2ae70', '#a09aa3'] }
};
export class ThemeController {
  constructor(select) {
    this.select = select; this.events = new AbortController();
    this.select?.addEventListener('change', () => this.set(this.select.value), { signal: this.events.signal });
    let selected = 'graphite';
    try { selected = localStorage.getItem(STORAGE_KEY) || selected; } catch {}
    this.set(THEMES[selected] ? selected : 'graphite');
  }
  dispose() { this.events.abort(); }
  set(name) {
    name = THEMES[name] ? name : 'graphite';
    const theme = THEMES[name] || THEMES.graphite;
    document.documentElement.dataset.theme = name;
    for (const [key, value] of Object.entries({ bgMain: theme.bg, panel: theme.panel, panelSecondary: theme.panelSecondary, border: theme.border, textPrimary: theme.text, textSecondary: theme.muted, accent: theme.accent, accentMuted: theme.accentMuted, controlBg: theme.control, controlActive: theme.active, meter: theme.meter, warning: theme.warning, visualizerBg: theme.visualizer })) document.documentElement.style.setProperty('--' + key.replace(/[A-Z]/g, match => '-' + match.toLowerCase()), value);
    theme.sources.forEach((value, index) => document.documentElement.style.setProperty('--analyzer-' + (index + 1), value));
    if (this.select) this.select.value = name;
    try { localStorage.setItem(STORAGE_KEY, name); } catch {}
    window.dispatchEvent(new CustomEvent('syntakt-theme-change', { detail: name }));
  }
}
export { THEMES, STORAGE_KEY };
