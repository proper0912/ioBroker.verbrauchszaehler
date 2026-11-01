# Checkliste: Verbrauchsberechnung stabilisieren

Details, Dateien, Abnahmekriterien und Risiken: siehe `plan.md`.

- [x] 1. Testskripte reparieren und ausführbare Adapter-/Pakettests aufsetzen.
- [x] 2. Ungenutzten `node-schedule`-Import entfernen und Modulladen testen.
- [x] 3. Messwertabfragen und Schreibvorgänge abwarten; ungültige Quellen und asynchrone Fehler behandeln.
- [x] Prüfpunkt: Start und Messwertübernahme einschließlich Fehlerfällen bestehen.
- [x] 4. Objektanlage, Lesen, Berechnung und Statistik für die Auswertungsoptionen abstimmen; Konfigurationsmatrix testen.
- [x] 5. Monats-/Jahressummen, historische Pfade und Kalendergrenzen korrigieren und testen.
- [x] Prüfpunkt: Standardkonfiguration, Optionsmatrix und Kalenderregressionen bestehen; historische IDs bleiben erhalten.
- [x] 6. Dokumentation ergänzen, Gesamtprüfung durchführen und verbleibende Einschränkungen nennen.

## Abschlussprüfung

- [x] `git diff --check`
- [x] `node --check main.js`
- [x] `npm test`
- [x] `npm pack --dry-run`
- [x] `npm run lint` ausgeführt und Ergebnis einschließlich vorhandener Blocker dokumentiert.
- [x] Normaler Ölverbrauch und bestehende Nachfüllerkennung durch Regressionstests abgesichert.
- [x] Realer ioBroker-Test durchgeführt oder ausdrücklich als ausstehend dokumentiert.

## Ergebnisse der Umsetzung

- `npm ci --ignore-scripts --no-audit --no-fund`: erfolgreich; keine neuen Abhängigkeiten und keine Lockfile-Änderung.
- `npm test`: 69 Verhaltenstests und 38 Paketprüfungen erfolgreich.
- `node --check main.js` und `node --check main.test.js`: erfolgreich.
- `git diff --check` und `npm pack --dry-run`: erfolgreich.
- Backend-Lint für `main.js`, `main.test.js` und `test/package.test.js`: erfolgreich mit den vorhandenen Repository-Regeln ohne das fehlende React-Plugin.
- `npm run lint`: weiterhin durch das bereits zuvor fehlende `eslint-plugin-react` blockiert. Das Skript prüft nun tatsächlich das Projektverzeichnis.
- Mutationsprüfung: Eine absichtlich erlaubte erneute Tagesverarbeitung wird von beiden betroffenen Regressionstests erkannt; anschließend Originalcode wiederhergestellt.
- Reale ioBroker-Instanz und Hardware: nicht getestet. Kein Deployment und keine Veröffentlichung durchgeführt.

Zusätzliche Absicherung: Verarbeitungstag und ausstehende absolute Schreibwerte werden in zwei neuen internen Zuständen gespeichert. Bei einem Schreibabbruch werden dieselben Zielwerte wiederholt statt erneut auf die Summen addiert. Alte Datenpunkt-IDs bleiben erhalten; bestehende Summen werden nicht rückwirkend korrigiert.

## Diagnose der täglichen Telegram-Nullmeldung

Die nachgereichten Füllstände (28.10.: 383 L, 29.10.: 379 L, 30.10.: 374 L, 31.10.: 368 L) wurden mit stündlichen Adapterläufen und einer täglichen Sensoränderung tagsüber nachgestellt. Der unveränderte ursprüngliche Berechnungscode aus HEAD reproduziert die Screenshots exakt: Tageswerte 28./29./30./31. Oktober = 4/5/6/0 L und AverageDay = 0 L. Die ursprüngliche Berechnung verbucht eine erst tagsüber erkannte Abnahme bereits beim Vortag.

Der korrigierte Code besteht denselben Ablauf mit Tageswerten 29./30./31. Oktober = 4/5/6 L und AverageDay am 1. November = 6 L. Der Fall ist als zusätzlicher Regressionstest in main.test.js gespeichert. Die genaue Uhrzeit der echten Sensormessungen ist weiterhin unbekannt; der Nachstellversuch verwendet eine Änderung um 12 Uhr. Die korrigierte Version ist noch nicht in der laufenden ioBroker-Installation installiert; historische Werte wurden nicht geändert.
