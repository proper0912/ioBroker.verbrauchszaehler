# Änderungsplan: Verbrauchsberechnung stabilisieren

Stand: 1. November 2026. Grundlage ist die Codeprüfung dieser Unterhaltung. Die Umsetzung ist abgeschlossen; Prüfergebnisse und verbleibende Einschränkungen stehen in `todo.md`.

## Ziel und Umfang

Die fünf gefundenen Funktionsfehler beheben und mit ausführbaren Tests absichern: fehlende Startabhängigkeit, Zugriffe auf nicht vorhandene Datenpunkte, unvollständig abgewartete Messwertabfragen, falsche Monatssummen und falsche Jahreszuordnung historischer Werte.

Betroffen sind `main.js`, `main.test.js`, die Testskripte in `package.json`, ergänzende Tests unter `test/` und eine kurze Dokumentation in `README.md`. Bestehende Mocha-, Sinon-, Proxyquire- und ioBroker-Testwerkzeuge verwenden; keine neue Laufzeitabhängigkeit. Den Lockfile nur dann maschinell aktualisieren, wenn Paketmetadaten tatsächlich angepasst werden müssen.

## Entscheidungen

- Bestehende Datenpunkt-IDs und gespeicherte Historien erhalten. Keine automatische Neuberechnung oder Löschung alter Verbrauchswerte.
- Kleine Korrekturen in der bestehenden Struktur; kein TypeScript-Umbau, keine neue Admin-Oberfläche, keine neue Wasserberechnung und kein pauschales Dependency-Upgrade.
- ioBroker legt den Ausführungszeitpunkt bereits über `common.schedule` fest. Den ungenutzten Import von `node-schedule` entfernen, statt das Paket nachzuinstallieren.
- Callback-Aufrufe durch die vorhandenen Promise-APIs ersetzen. Messwerte und Schreibvorgänge vollständig abwarten, bevor gerechnet oder der Adapter beendet wird.
- Fehlende historische Verbrauchswerte sind unbekannt, nicht automatisch null Liter. Ein echter Verbrauch von null Litern darf dagegen in Durchschnittswerte eingehen.
- Datum einmal pro Lauf erfassen; Vortage mit Kalenderoperationen bestimmen. Ablagejahr und Kalenderwoche aus dem ausgewerteten Tag ableiten.

## Reihenfolge und Abnahme

### 1. Ausführbare Testgrundlage herstellen

Dateien: `package.json`, `main.test.js`, bei Bedarf `test/package.test.js`.

Die Testskripte auf tatsächlich vorhandene Dateien ausrichten. Den Platzhalter durch Tests des exportierten Adapterstarts ersetzen. Den Adapter mit Proxyquire simulieren und Zeit sowie asynchrone Antworten mit Sinon steuern. Paketprüfung über das bereits vorhandene `@iobroker/testing` anbinden. Keine zusätzlichen öffentlichen Exporte allein für Tests einführen.

Abnahme:

- `npm test` findet und startet die echten Verhaltens- und Pakettests ohne fehlende Konfigurationsdateien.
- Der Testadapter bildet fehlende Zustände und verzögerte Lese-/Schreibvorgänge ab.
- Ein normaler Initialisierungs- und Folgelauf lässt sich ohne echte ioBroker-Installation ausführen.

Prüfung: nach Installation mit `npm ci` zunächst die fokussierten Tests, dann `npm test`. Neue Regressionstests jeweils mit dem zugehörigen Fix ergänzen und vor dem Fix scheitern lassen.

Abhängigkeit: keine.

### 2. Start ohne zusätzliche Laufzeitabhängigkeit ermöglichen

Dateien: `main.js`, `main.test.js`.

Den ungenutzten Import von `node-schedule` entfernen. Einen Ladetest so gestalten, dass unbekannte Laufzeitabhängigkeiten nicht durch großzügige Mocks verdeckt werden.

Abnahme:

- Das Modul lädt mit den deklarierten Laufzeitabhängigkeiten.
- Der vorhandene ioBroker-Zeitplan bleibt wirksam.

Prüfung: Ladetest und `node --check main.js`; abschließend Paketinhalt mit `npm pack --dry-run` kontrollieren.

Abhängigkeit: 1.

### 3. Messwerte vollständig und fehlerfest laden

Dateien: `main.js`, `main.test.js`.

Beide `getForeignState`-Aufrufe in Initialisierung und `getValue` auf `getForeignStateAsync` umstellen, zugehörige Schreibvorgänge abwarten. Fehler des asynchronen `main`-Aufrufs im Ready-Handler auffangen; das bisherige synchrone `try/catch` reicht dafür nicht. Fehlende, nicht numerische und nicht endliche Quellwerte abweisen. Bei Lesefehlern keine Verbrauchswerte oder Berechnungsbasen verändern und den Lauf kontrolliert beenden.

Abnahme:

- Eine verzögerte Quellantwort wird vor jeder Berechnung verarbeitet.
- Fehlender Quellzustand, ungültiger Wert und abgewiesene Promise führen zu einer verständlichen Fehlermeldung ohne unhandled rejection.
- Der Adapter stoppt erst nach den notwendigen Schreibvorgängen.

Prüfung: Tests mit verzögerter Antwort, verzögertem Schreiben und fehlerhaften Quellen.

Abhängigkeit: 2.

Prüfpunkt nach 1–3: Start- und Messwerttests bestehen; keine zusätzliche Laufzeitabhängigkeit eingeführt.

### 4. Auswertungsoptionen konsistent berücksichtigen

Dateien: `main.js`, `main.test.js`.

Objektanlage, Lesen, Berechnung und Statistik aufeinander abstimmen. Im Tagesmodus ohne Monatsauswertung die vorhandene Jahres-Tagesstruktur verwenden; deren Tagesnummer einschließlich Schaltjahr korrekt berechnen. Nur aktivierte Auswertungen lesen und schreiben. Die Berechnung aktivierter Monats- und Jahreswerte darf nicht von einer ebenfalls aktivierten Wochenauswertung abhängen. Historische Zustände vor `.val` prüfen und fehlende Historie als solche behandeln.

Alle Aufrufer prüfen: Initialisierung in `main`, `getValue`, `calcValueOil`, dessen abschließendes Nachladen und `newstastic`. Interne Berechnungsbasen von den auswählbaren Ausgaben unterscheiden, damit deaktivierte Ausgabeoptionen keinen Absturz auslösen.

Abnahme:

- Die Standardkonfiguration mit ausschließlich aktivierter Tagesauswertung läuft wiederholt ohne fehlende Wochen-/Monats-/Jahreszustände.
- Die Kombinationen der vier Schalter werden tabellarisch getestet; deaktivierte Ausgaben erzeugen keine Zugriffe auf nicht angelegte Datenpunkte.
- Monats- und Jahresauswertung funktionieren auch ohne Wochenauswertung; bei fehlender Historie entstehen keine erfundenen Durchschnittswerte.

Prüfung: Konfigurationsmatrix, fehlende historische Zustände und Tagesnummern am 31. Dezember sowie im Schaltjahr.

Abhängigkeit: 3.

### 5. Monats-, Jahres- und Kalendergrenzen korrigieren

Dateien: `main.js`, `main.test.js`.

Den Vortag seinem tatsächlichen Monat und Jahr zuordnen und Periodensummen erst beim ersten Wert der neuen Periode zurücksetzen. Alte und neue Berechnungsbasis beim Jahreswechsel geordnet übernehmen: die bisherige Initialisierung darf den letzten Tag des Vorjahres weder überspringen noch überschreiben. Den Zugriff auf `value.Year` korrigieren. Wochenjahr und Wochenzahl gemeinsam aus dem ausgewerteten Tag bestimmen; keine Kalenderwoche null durch Subtraktion erzeugen.

In `newstastic` historische Pfade je Datum bilden und dieselbe Tagesablage wie beim Schreiben verwenden. Fehlende Einträge auslassen beziehungsweise als unvollständige Statistik behandeln; bekannte Nullverbräuche mitzählen. Die feste 24-Stunden-Subtraktion für Kalendertage durch Kalenderoperationen ersetzen.

Abnahme:

- 300 Liter Oktoberverbrauch plus 10 Liter am 31. Oktober ergeben auch beim Lauf am 1. November 310 Liter; der erste Novemberwert startet die neue Monatssumme.
- Ein Lauf über den Jahreswechsel schreibt den 31. Dezember ins Vorjahr; die Januarstatistik liest Dezemberwerte aus dem Vorjahr und verwendet keine undefinierten Jahreswerte.
- Tests für Wochenjahreswechsel, Schaltjahr und beide Sommerzeitwechsel belegen gültige und eindeutige Kalenderzuordnungen.

Prüfung: fest eingestellte Datumsfälle in den Adaptertests, einschließlich Wiederholung desselben Laufs, damit die Korrektur keine doppelte Addition einführt.

Abhängigkeit: 4.

Prüfpunkt nach 4–5: Konfigurationsmatrix und Kalenderregressionen bestehen; vorhandene historische IDs bleiben erhalten.

### 6. Gesamtprüfung und Dokumentation

Dateien: `README.md`, nur bei durch die Änderungen verursachten Problemen die bereits betroffenen Dateien.

Unterstützte Auswertungen und Verhalten bei fehlenden Messwerten kurz dokumentieren. Testergebnisse und verbleibende Einschränkungen festhalten. Änderungen mit `git diff --check`, `node --check main.js`, `npm test` und `npm pack --dry-run` prüfen. `npm run lint` ausführen; vorhandene Konfigurations- oder Altfehler von neuen Fehlern unterscheiden und nicht als erfolgreich geprüften Zustand ausgeben. Es gibt derzeit kein Buildskript; deshalb keinen fiktiven Buildcheck einführen.

Abnahme:

- Die Regressionstests für alle fünf ursprünglichen Befunde bestehen.
- Der Diff enthält die Korrekturen, Tests und erforderliche Dokumentation ohne fachfremden Umbau.
- Ein manueller ioBroker-Test ist entweder durchgeführt oder ausdrücklich als ausstehend benannt.

Abhängigkeit: 5.

## Risiken und Grenzen

- Bereits falsch gespeicherte Summen werden durch die Fehlerbehebung nicht zuverlässig rekonstruierbar. Vor einem späteren Einsatz betroffene Daten sichern; keine automatische Historienreparatur planen.
- Jahreswechsel und Übernahme der Berechnungsbasis sind besonders datenempfindlich. Einen bestehenden Datenbestand im Test simulieren und Schreibreihenfolge prüfen.
- Der Adapter läuft stündlich und schreibt Verbrauch zum Vortag. Ob genau diese fachliche Tagesabgrenzung gewünscht ist, ist aus dem Code allein nicht sicher. Die fünf Fehlerkorrekturen dürfen diese Semantik nicht stillschweigend in eine andere Messstrategie umwandeln; gegebenenfalls gesondert klären und planen.
- Fehlende Messungen während eines längeren Ausfalls lassen sich ohne historische Quellmesswerte nicht auf einzelne Tage verteilen. Keine Werte dafür erfinden.
- Hardwarekalibrierung und die bestehende Erkennung von Ölnachfüllmengen bleiben außerhalb dieses Plans. Regressionsfälle für normale Abnahme und eine vorhandene Nachfüllstufe schützen vor unbeabsichtigten Änderungen.
- Aktuell sind keine Abhängigkeiten installiert. Tests mit echten Bibliotheken und ein realer ioBroker-Betrieb wurden in der bisherigen Prüfung nicht ausgeführt.

Die umsetzbare Checkliste steht in `tasks/todo.md`. Die Umsetzung wurde im anschließenden Arbeitsauftrag ausgeführt. Der vollständige Projekt-Lint bleibt wegen des fehlenden React-Plugins blockiert; ein realer ioBroker-Test steht aus.
