// Hardware identity is device-local and is never included in portable presets.
const KEY = 'syntakt-devices-v1';
export function loadDevices(storage) {
  try { const s = JSON.parse(storage.getItem(KEY) || '{}'); return { input: typeof s.input === 'string' ? s.input : '', output: typeof s.output === 'string' ? s.output : '', manualInput: s.manualInput === true }; } catch { return { input: '', output: '', manualInput: false }; }
}
export function saveDevices(storage, input, output, manualInput) {
  try { storage.setItem(KEY, JSON.stringify({ input, output, manualInput })); } catch {}
}
