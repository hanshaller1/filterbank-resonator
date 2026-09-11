# Syntakt Low-Pass

Audio-Testapplikation mit diesem Standard-Signalweg:

`Input Gain → Freeze → Gate → Transient → Drive → Wavefolder → Crusher → Filter → EQ → Compressor → Width → Clipper → Wet Gain / Auto Gain → Dry/Wet → Output Gain → Sicherheits-Limiter → Output`

Der Dry-Pfad zweigt hinter Input Gain ab. Die elf Processing-Module lassen sich per Griff oder Pfeiltasten umsortieren. Auf-/Zuklappen verändert ihren ON/OFF-Zustand nicht.

## State, Snapshots, Presets und Performance

- Zentrale Parameter und Modulverwaltung; alle Steuerungen verwenden dieselben Parameterbereiche.
- Store A / Store B speichern Klangparameter und Reihenfolge. Morph interpoliert kontinuierliche Werte, Frequenzen logarithmisch; Typen, Schalter und Reihenfolge wechseln bei 50 %.
- Presets lokal speichern, laden, duplizieren, umbenennen, löschen sowie als JSON importieren/exportieren. Geräteauswahl und Fensterposition bleiben lokale Einstellungen. Audiopuffer werden nicht gespeichert; nach Neuladen startet Freeze OFF.
- LFO und Envelope Follower mit mehreren, auch invertierten Zuweisungen. Modulation läuft samplebasiert im AudioWorklet, ohne die Grundwerte zu überschreiben.
- Acht benennbare Makros mit mehreren Zielbereichen. Performance Mode zeigt Makros, A/B-Morph, Freeze und Global Bypass kompakt an.

## Freeze Free / Sync

**Free** verwendet unverändert den Zeitregler von 0 ms bis 20 s (intern mindestens 5 ms) und Capture Previous im gemeinsamen AudioWorklet-Kern. Free und Sync teilen einen Stereo-Seitenpuffer; Umschalten und erneutes Capture werden überblendet.

**Sync** bietet Loop-Längen von 1/4 Beat bis 8 Bars bei 4/4:

1. Auto analysiert den unverarbeiteten Eingang über mehrere Zeitfenster. Erst übereinstimmende Ergebnisse werden als Stable übernommen; unsichere Messungen ändern die laufende Clock nicht. Beim ersten Start ohne stabiles Tempo bleibt das Live-Signal erhalten.
2. Lock BPM hält das übernommene Tempo fest. Unlock BPM erlaubt wieder automatische Aktualisierungen. Ein aktiver Freeze behält sein Tempo bis zur Freigabe.
3. Manual BPM (40–240, auch Nachkommastellen) setzt die Clock unmittelbar. Eine manuelle Tempo- oder Loop-Längenänderung während Freeze nimmt am nächsten Rasterpunkt einen neuen Loop auf.
4. Set Beat 1 setzt den nächsten Beat als Taktanfang. Die automatische Bar-Referenz ist zunächst eine Schätzung, keine gesicherte Erkennung des Song-Taktanfangs.
5. Start Quantize bestimmt den Startpunkt. Auto verwendet Beats für kurze Loops und Taktanfänge ab 1 Bar. Notenwerte sind als solche bezeichnet: 1/4 Note entspricht einem Beat.
6. Release Quantize kann den Ausstieg sofort, zum nächsten Beat oder Taktanfang ausführen. Erneutes Umschalten kann vorgemerkte Starts/Ausstiege abbrechen.
7. ARMED / Buffering / Frozen / Release armed zeigen den tatsächlichen Vorgang. Solange noch nicht genug Eingangsaudio vorhanden ist, wird Live weitergegeben und bis zu einer passenden Grenze gepuffert.

Sync Debug zeigt erkannte und stabile BPM, Clock BPM, Confidence, Beat, Bar, Phase, Abstände zum nächsten Beat/Takt sowie Trigger und Quantisierung. Unterbrochenes oder rhythmisch mehrdeutiges Material kann weiterhin eine manuelle BPM-/Taktreferenz erfordern.

Syncs AudioWorklet verwendet absolute Sample-Zeitpunkte und ungerundete Loop-Perioden. Loop-Grenzen werden geglättet, ohne die Periodendauer zu verkürzen. Ein vorab reservierter Stereo-Seitenpuffer erhält Captures durch Referenzen und Copy-on-write; lange Aufnahmen werden nicht auf einmal im Audio-Thread kopiert. TempoDetector und BeatTracker laufen in einem Worker mit direktem MessagePort zum Worklet. UI-Timer steuern weder Clock noch Trigger. Free nutzt denselben Capture-Kern ohne Tempoanalyse. Gate, Transient, Crusher, Clipper und Auto Gain laufen ebenfalls auf dem Audio-Thread.

## Voraussetzungen unter Windows 11

- aktuelles Google Chrome
- Node.js LTS von <https://nodejs.org/>
- Syntakt per USB verbunden und als USB-Audiogerät verfügbar
- MiniFuse verbunden und als Audioausgang verfügbar

## Lokal starten

1. Diesen Projektordner in PowerShell öffnen.
2. Einmalig prüfen, ob Node.js verfügbar ist:

   ```powershell
   node --version
   ```

3. Anwendung starten:

   ```powershell
   npm start
   ```

4. In Chrome `http://localhost:5173` öffnen.

Die Anwendung benötigt keine zusätzlichen npm-Abhängigkeiten.

## Syntakt und MiniFuse testen

1. Syntakt und MiniFuse vor dem Start verbinden.
2. In Chrome den Audiozugriff für `localhost` erlauben.
3. Im Feld **Input Device** den vom Syntakt bereitgestellten Audioeingang auswählen.
4. Im Feld **Output Device** den MiniFuse-Ausgang auswählen.
5. Mit **Start Audio** starten.
6. Ein Signal am Syntakt erzeugen und prüfen, ob der Input-Meter ausschlägt und das Signal am MiniFuse hörbar ist.
7. Cutoff deutlich bewegen: Der Klang muss hörbar heller bzw. dunkler werden.
8. Resonance erhöhen: Die Filterspitze um die Cutoff-Frequenz muss hörbar zunehmen.
9. Dry/Wet auf 0 % und 100 % vergleichen.
10. Bypass ein- und ausschalten.
11. Input Gain und Output Gain prüfen.
12. Mit **Stop Audio** stoppen und danach erneut starten.
13. Während gestopptem Audio den Input wechseln, erneut starten und prüfen, dass nur das neue Gerät aktiv ist.

## Hinweise zur Ausgangsauswahl

Die Anwendung verwendet `AudioContext.setSinkId()`, wenn Chrome diese Funktion bereitstellt. Wenn die Funktion nicht verfügbar ist, bleibt der normale Standardausgang von Windows/Chrome aktiv. Die Anwendung zeigt diesen Fallback als Statusmeldung an.

Gerätenamen werden nicht fest im Code vorausgesetzt. Chrome liefert die verfügbaren Geräte dynamisch über `MediaDevices.enumerateDevices()`.

## Architektur

- `src/audio/DeviceManager.js` – Geräteauflistung, Berechtigung und MediaStream-Lebenszyklus
- `src/audio/AudioEngine.js` – AudioContext, Master-Stufen und Lebenszyklus
- `src/audio/ProcessingRegistry.js`, `RoutingController.js` – Module und flexible Reihenfolge
- `src/state/` – Parameter, State, Snapshots und Presets
- `src/control/`, `src/audio/ModulationEngine.js` – Makros, Modulation und Parameteranbindung
- `src/audio/freeze/` – TempoDetector, BeatTracker, TransportClock, FreezeSyncController und FreezeEngine
- `src/audio/worklets/` – Modulation, Freeze, Dynamik, Crusher und Auto Gain auf dem Audio-Thread
- `src/audio/FreezeProcessor.js` – Free-/Sync-Umschaltung und Worker-Lebenszyklus
- `src/audio/Metering.js` – Input-/Output-Peak-Metering über AnalyserNodes
- `src/ui/UI.js` – UI-Zustand, Controls und Meteranzeige
- `src/main.js` – Zusammenschaltung und Ereignisbehandlung

## Automatischer Check

```powershell
npm run check
npm test
```

Die Checks prüfen Syntax, Imports und Controls. Die Tests prüfen unter anderem State-/Preset-/Morph-/Makro-Zusammenspiel, Start/Stop-Rennen, Routing, Worker/Worklet, Stereo-Capture, Quantisierung und Drift. Die Drift-Matrix umfasst 80/100/120/128/140 BPM bei 44,1 und 48 kHz und bis zu 10.000 Wiederholungen. Erzeugte Stereo-Rhythmen mit fehlenden Schlägen und Rauschen werden zusätzlich zur Tempo-Prüfung verwendet; dies ist kein Nachweis für beliebige Songs.

Der USB-Audiotest und das abschließende Hörurteil erfolgen mit Syntakt, MiniFuse und Chrome unter Windows. Die Veröffentlichung liefert `dist/index.html` und die vollständige Kopie von `src/` aus; lokale Entwicklung verwendet die gleichnamigen Quellen im Projektverzeichnis.

## Review-Korrekturen

- Gate: samplebasierte, stereo-verknüpfte Attack-/Release-Regelung.
- Transient: schnelle/langsame Pegelhüllkurven statt statischer Hoch-/Tiefpass-Klangregelung; 0/0 bleibt neutral.
- Crusher: AudioWorklet statt ScriptProcessor; beide Teilfunktionen OFF sind neutral.
- Clipper: Threshold steuert die Kennlinie; Amount 0 ist unterhalb Ceiling neutral. Limiter regelt stereo-verknüpft mit Release; Ceiling ist eine Sample-Peak-Grenze, kein True-Peak-Limiter. Der finale Schutz-Kompressor bleibt unverändert.
- Auto Gain: langsam geglätteter Stereo-RMS-Vergleich vor manuellem Wet Gain; ±12 dB, Gate bei −60 dBFS. Regelung läuft unabhängig von UI-Timern.
- Wavefolder: Nullsignal-Offset entfernt und DC-Hochpass bei 5 Hz; Ausgangsregler baut keine neue Kennlinie auf.
- Modulationsziele: native AudioParams für zeitkritische Parameter. Verbleibende Kennlinienänderungen (Drive Bias/Shape und Wavefolder) werden begrenzt über Messages aktualisiert. Entfernte Zuweisungen stellen den Grundwert wieder her; veraltete Messages werden verworfen.
- Presets enthalten kein UI/Layout; Sessions behalten den lokalen Performance-Modus. Collapse hat eigene Speicherung.
- Semantische Analyzer-Abgriffe bleiben am jeweiligen Modul, unabhängig von der Reihenfolge. Nur aktive Analyzer fragen Spektren ab; Level-Meter benötigen keine FFT-Abfrage. Das Spektrogramm verschiebt ein Bitmap statt jedes Mal die ganze Historie neu zu zeichnen.
- Filter-/EQ-Kurven bleiben ausdrücklich Näherungen. Tilt-Richtung und Allpass-Gradskala korrigiert.
- Unbenutzte alte Modulationsoberfläche und ScriptProcessor-Implementierungen entfernt; über Git wiederherstellbar.

Validierung: 53 erfolgreiche Node-Regressionstests sowie Syntax-/Import-/Control-Checks (57 JavaScript-Dateien, 183 HTML-IDs). Beim Abschluss wurde der unveränderte Code nicht erneut getestet; Git-Diff und Übereinstimmung von Quelle und Produktionskopie wurden geprüft.

Offene Testgrenzen: Die bereitgestellte verwaltete Browservorschau unterstützt dieses statische Projekt ohne kompatiblen Entwicklungsserver nicht. Ein Browser-Smoke-Test der tatsächlichen Oberfläche, Layout-/Tastaturprüfung und AudioWorklet-Ausführung im realen Chrome stehen deshalb aus. Die automatisierten Tests ersetzen diese Prüfungen nicht. USB-Ein-/Ausgabe, Gerätetrennung mit realer Hardware und Hörprüfung (Klicks, Dropouts, Pegelverhalten) müssen mit Syntakt und MiniFuse unter Windows/Chrome erfolgen; siehe die Testschritte oben. Die Veröffentlichung enthält den automatisiert geprüften Stand, keine behauptete Hardware-Abnahme.
