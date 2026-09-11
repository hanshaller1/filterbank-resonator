import { DeviceManager } from './audio/DeviceManager.js';
import { FreezeSyncPanel } from './ui/FreezeSyncPanel.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { UI } from './ui/UI.js';
import { VisualizationPanel } from './ui/VisualizationPanel.js';
import { FloatingWindowController } from './ui/FloatingWindowController.js';
import { FilterResponseVisualization } from './ui/FilterResponseVisualization.js';
import { EQResponseVisualization } from './ui/EQResponseVisualization.js';
import { DriveCurveVisualization } from './ui/DriveCurveVisualization.js';
import { CompressorVisualization } from './ui/CompressorVisualization.js';
import { WavefolderVisualization, TransientVisualization, ClipperVisualization } from './ui/ModuleVisualizations.js';
import { MacroPanel } from './ui/MacroPanel.js';
import { ModulationPanelV2 } from './ui/ModulationPanelV2.js';
import { ProcessingList } from './ui/ProcessingList.js';
import { SnapshotPanel } from './ui/SnapshotPanel.js';
import { PresetPanel } from './ui/PresetPanel.js';
import { SectionCollapseController } from './ui/SectionCollapseController.js';
import { ThemeController } from './ui/ThemeController.js';
import { addComponentTooltips } from './ui/ComponentTooltips.js';
import { PresetStore, SessionPersistence, loadSession } from './state/PresetStore.js';
import { loadDevices, saveDevices } from './state/DeviceState.js';

import { AppState, readLegacyState } from './state/AppState.js';
import { PARAMETERS, fromControl, fromNormalized } from './state/parameters.js';
const store = new AppState();
store.restoreState(loadSession(localStorage, () => readLegacyState(localStorage)));
const ui = new UI(store);
const devices = new DeviceManager();
const engine = new AudioEngine(devices, store);
const freezeSyncPanel = new FreezeSyncPanel(store, engine, document.getElementById('freezeSyncSettings'));
const processingList = new ProcessingList(store, engine);
const macroPanel = new MacroPanel(store, document.getElementById('macroPanel'), document.getElementById('performanceMode'));
const modulationPanel = new ModulationPanelV2(store, document.getElementById('modulationPanel'));
let effectiveVisualSettings = { ...store.state.parameters };
engine.onModulationVisuals = value => {
  modulationPanel.updateVisuals(value); visualization?.setModulationVisuals(value); visualization2?.setModulationVisuals(value);
  effectiveVisualSettings = { ...store.state.parameters };
  for (const [id, normalized] of Object.entries(value?.values || {})) {
    if (PARAMETERS[id]?.type === 'number' && Number.isFinite(normalized)) effectiveVisualSettings[id] = fromNormalized(PARAMETERS[id], normalized);
  }
  compressorVisualization?.setSettings(effectiveVisualSettings);
  transientVisualization?.setSettings(effectiveVisualSettings);
  clipperVisualization?.setSettings(effectiveVisualSettings);
};
const snapshotPanel = new SnapshotPanel(store, document.getElementById('snapshotPanel'));
const presetPanel = new PresetPanel(store, new PresetStore(localStorage), document.getElementById('presetPanel'), (text, error) => ui.setMessage(text, error));
addComponentTooltips(document);
const sessionPersistence = new SessionPersistence(store, localStorage, text => ui.setMessage(text, true));
const sectionCollapse = new SectionCollapseController(document, localStorage);
const themeController = new ThemeController(ui.elements.themeSelect);
const analyzerOne = document.getElementById('visualizationPanel');
const analyzerTwo = analyzerOne.cloneNode(true);
analyzerTwo.id = 'visualizationPanel2'; analyzerTwo.dataset.analyzerId = '2'; analyzerTwo.setAttribute('aria-label', 'Floating Analyzer 2');
for (const element of analyzerTwo.querySelectorAll('[id]')) element.id = element.id + '2';
analyzerTwo.querySelector('.analyzer-title strong').textContent = 'Analyzer 2';
document.body.append(analyzerTwo);
const analyzerWindow = new FloatingWindowController({
  panel: ui.elements.visualizationPanel,
  handle: ui.elements.visualizationHandle,
  openButton: ui.elements.openAnalyzer,
  closeButton: ui.elements.closeAnalyzer,
  minimizeButton: ui.elements.minimizeAnalyzer,
  selector: ui.elements.visualizationType,
  storageKey: 'syntakt-analyzer-window-1-v2'
});
const analyzerWindow2 = new FloatingWindowController({
  panel: analyzerTwo, handle: analyzerTwo.querySelector('#visualizationHandle2'), openButton: ui.elements.openAnalyzer2,
  closeButton: analyzerTwo.querySelector('#closeAnalyzer2'), minimizeButton: analyzerTwo.querySelector('#minimizeAnalyzer2'),
  selector: analyzerTwo.querySelector('#visualizationType2'), storageKey: 'syntakt-analyzer-window-2-v2', defaultOpen: false
});
const visualization = new VisualizationPanel(
  ui.elements.visualizationCanvas,
  ui.elements.visualizationType,
  ui.elements.visualizationDescription,
  { panel: ui.elements.visualizationPanel, analyzerId: '1' }
);
const visualization2 = new VisualizationPanel(analyzerTwo.querySelector('#visualizationCanvas2'), analyzerTwo.querySelector('#visualizationType2'), analyzerTwo.querySelector('#visualizationDescription2'), { panel: analyzerTwo, analyzerId: '2' });
const filterResponse = new FilterResponseVisualization(ui.elements.filterResponseCanvas);
const eqResponse = new EQResponseVisualization(ui.elements.eqResponseCanvas);
const driveCurve = new DriveCurveVisualization(document.getElementById('driveCurveCanvas'));
const compressorVisualization = new CompressorVisualization(document.getElementById('compressorCanvas'), ui.elements.compressorReductionValue);
const wavefolderVisualization = new WavefolderVisualization(document.getElementById('wavefolderCanvas'));
const transientVisualization = new TransientVisualization(document.getElementById('transientCanvas'), document.getElementById('transientVisualValue'));
const clipperVisualization = new ClipperVisualization(document.getElementById('clipperCanvas'), document.getElementById('clipperVisualValue'));
engine.onInputEnded = () => { stop(); ui.setMessage('Audioeingang wurde getrennt. Gerät auswählen und Audio neu starten.', true); refreshDevices().catch(error => ui.setMessage(errorMessage(error), true)); };
const deviceState = loadDevices(localStorage);
let selectedInputId = deviceState.input;
let selectedOutputId = deviceState.output;
let inputSelectionMade = deviceState.manualInput;
let meterFrame = 0;

function isElektronDevice(device) {
  return /elektron|syntakt|digitakt|digitone|model\s*:?\s*cycles/i.test(device.label || '');
}

function errorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Zugriff verweigert. Erlaube Chrome den Audiozugriff für diese Anwendung.';
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'Das ausgewählte Audiogerät ist nicht verfügbar.';
  return `Audiofehler: ${error?.message || 'Unbekannter Fehler'}`;
}

async function refreshDevices() {
  const available = await devices.listDevices();
  if (selectedInputId && !available.inputs.some(d => d.deviceId === selectedInputId)) {
    selectedInputId = '';
    inputSelectionMade = false;
  }
  if (!inputSelectionMade) {
    selectedInputId = available.inputs.find(isElektronDevice)?.deviceId || available.inputs[0]?.deviceId || '';
  }
  if (!selectedOutputId || !available.outputs.some(d => d.deviceId === selectedOutputId)) selectedOutputId = available.outputs[0]?.deviceId || '';
  ui.fillDevices(ui.elements.inputDevice, available.inputs, selectedInputId);
  ui.fillDevices(ui.elements.outputDevice, available.outputs, selectedOutputId);
  ui.elements.currentInput.textContent = available.inputs.find(d => d.deviceId === selectedInputId)?.label || 'Nicht ausgewählt';
  ui.elements.currentOutput.textContent = available.outputs.find(d => d.deviceId === selectedOutputId)?.label || 'Standardausgang';
  saveDevices(localStorage, selectedInputId, selectedOutputId, inputSelectionMade);
}

async function prepareDevices() {
  try { await devices.requestPermission(); if (controlsController.signal.aborted) return; await refreshDevices(); if (selectedInputId) await start(); else ui.setMessage('Kein Audioeingang verfügbar.'); }
  catch (error) { ui.setMessage(errorMessage(error), true); }
}

async function start() {
  if (controlsController.signal.aborted) return;
  try {
    if (engine.active && engine.context?.state === 'suspended') { await engine.context.resume(); ui.setStatus(true, engine.context.state); return; }
    if (!await engine.start(selectedInputId, selectedOutputId)) return;
    ui.elements.sampleRate.textContent = `${engine.context.sampleRate} Hz`;
    ui.setStatus(true, engine.context.state);
    processingList.render();
    ui.setMessage('Audio ist aktiv.');
    await refreshDevices();
  } catch (error) { engine.stop(); ui.setStatus(false, engine.context?.state || '—'); ui.setMessage(errorMessage(error), true); }
}

function stop() { engine.stop(); freezeSyncPanel.update(null); ui.setStatus(false, engine.context?.state || '—'); ui.setMessage('Audio gestoppt.'); ui.setMeters({ input: 0, output: 0 }); compressorVisualization.render(0, false); transientVisualization.render({}, false); clipperVisualization.render({}, false); driveCurve.render(null, false); visualization.render(null, null); visualization2.render(null, null); }

function renderState() {
  const settings = ui.render();
  effectiveVisualSettings = { ...settings };
  filterResponse.render(settings);
  eqResponse.render(settings);
  compressorVisualization.setSettings(settings);
  compressorVisualization.render(engine.getGainReduction().compressor, settings.compressorEnabled);
  transientVisualization.setSettings(settings); transientVisualization.render({}, settings.transientEnabled);
  clipperVisualization.setSettings(settings); clipperVisualization.render({}, settings.clipperEnabled);
  wavefolderVisualization.render(null, settings, settings.wavefolderEnabled);
  driveCurve.render(engine.getTransferCurve(), settings.driveEnabled);
  visualization.setProcessingSettings(settings);
  visualization2.setProcessingSettings(settings);
}
const unsubscribeUI = store.subscribe(renderState);
renderState();
ui.elements.inputDevice.addEventListener('change', event => { selectedInputId = event.target.value; inputSelectionMade = true; saveDevices(localStorage, selectedInputId, selectedOutputId, true); if (engine.active) start(); });
ui.elements.outputDevice.addEventListener('change', async event => {
  const previousOutputId = selectedOutputId;
  selectedOutputId = event.target.value;
  try { const changed = await engine.setOutputDevice(selectedOutputId); if (!changed) ui.setMessage('Direkte Ausgangsauswahl wird von diesem Chrome nicht unterstützt; Standardausgang bleibt aktiv.'); else ui.setMessage('Ausgang geändert.'); await refreshDevices(); }
  catch (error) { selectedOutputId = previousOutputId; ui.elements.outputDevice.value = previousOutputId; ui.setMessage(errorMessage(error), true); }
});
const controlsController = new AbortController();
const listen = (target, type, handler) => target.addEventListener(type, handler, { signal: controlsController.signal });
listen(window, 'syntakt-theme-change', renderState);
listen(window, 'resize', renderState);
for (const p of Object.values(PARAMETERS)) {
  if (p.id === 'freezeManualBpm') continue;
  const control = document.getElementById(p.control);
  if (!control) continue;
  const eventName = p.controlEvent || (control.tagName === 'BUTTON' ? 'click' : 'input');
  listen(control, eventName, () => {
    const value = fromControl(p, control);
    if (p.id === 'eqType') store.setEqType(value);
    else if (p.id === 'freezeBpmMode' && value === 'manual') store.setParameters({ freezeBpmMode: value, freezeTempoLocked: false });
    else store.setParameter(p.id, value);
  });
}
listen(ui.elements.startAudio, 'click', start);
listen(ui.elements.stopAudio, 'click', stop);

listen(navigator.mediaDevices || new EventTarget(), 'devicechange', () => { refreshDevices().catch(error => ui.setMessage(errorMessage(error), true)); });
prepareDevices();

function updateMeters() {
  if (engine.active && performance.now() - meterFrame > 50) {
    const tempo = engine.updateDetectors();
    const dynamics = engine.getGainReduction();
    ui.setFreezeTempo(tempo); freezeSyncPanel.update(tempo); modulationPanel.setTempo(tempo);
    ui.setClipperActivity(engine.getClipperActivity());
    const moduleVisuals = engine.getModuleVisuals();
    if (moduleVisuals) {
      wavefolderVisualization.render(moduleVisuals.wavefolder, effectiveVisualSettings, effectiveVisualSettings.wavefolderEnabled);
      transientVisualization.render(moduleVisuals.transient, effectiveVisualSettings.transientEnabled);
      compressorVisualization.render(moduleVisuals.compressor, effectiveVisualSettings.compressorEnabled);
      clipperVisualization.render(moduleVisuals.clipper, effectiveVisualSettings.clipperEnabled);
    }
    const activeVisuals = [[analyzerWindow, visualization], [analyzerWindow2, visualization2]].filter(([window, panel]) => window.isVisible() && !panel.paused).map(([, panel]) => panel);
    if (activeVisuals.length) {
      visualization.setSourceRegistry(engine.getAnalyzerSources()); visualization2.setSourceRegistry(engine.getAnalyzerSources());
      const sourceSet = [...new Set(activeVisuals.flatMap(panel => panel.getAnalysisSources()))];
      const analysis = engine.getAnalysis(sourceSet);
      ui.setMeters(analysis?.levels || { input: 0, output: 0 });
      ui.setAutoGainCorrection(engine.updateAutoGain());
      visualization.setDynamics(dynamics); visualization2.setDynamics(dynamics);
      for (const panel of activeVisuals) panel.render(analysis);
    } else {
      ui.setMeters(engine.getLevels());
      ui.setAutoGainCorrection(engine.updateAutoGain());
    }
    ui.setStatus(true, engine.context.state);
    driveCurve.render(engine.getTransferCurve(), store.state.parameters.driveEnabled);
    meterFrame = performance.now();
  }
  animationFrame = requestAnimationFrame(updateMeters);
}
let animationFrame = 0;
updateMeters();

window.addEventListener('pagehide', () => { cancelAnimationFrame(animationFrame); controlsController.abort(); unsubscribeUI(); sectionCollapse.dispose(); analyzerWindow.dispose(); analyzerWindow2.dispose(); visualization.dispose(); visualization2.dispose(); filterResponse.dispose(); eqResponse.dispose(); themeController.dispose(); freezeSyncPanel.dispose(); processingList.dispose(); snapshotPanel.dispose(); modulationPanel.dispose(); macroPanel.dispose(); presetPanel.dispose(); sessionPersistence.dispose(); engine.dispose(); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
