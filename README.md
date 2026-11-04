![Logo](admin/verbrauchszaehler.png)
# ioBroker.verbrauchszaehler

[![NPM version](https://img.shields.io/npm/v/iobroker.verbrauchszaehler.svg)](https://www.npmjs.com/package/iobroker.verbrauchszaehler)
[![Downloads](https://img.shields.io/npm/dm/iobroker.verbrauchszaehler.svg)](https://www.npmjs.com/package/iobroker.verbrauchszaehler)
![Number of Installations](https://iobroker.live/badges/verbrauchszaehler-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/verbrauchszaehler-stable.svg)
[![Build Status](https://app.travis-ci.com/proper0912/ioBroker.verbrauchszaehler.svg?branch=master)](https://app.travis-ci.com/proper0912/ioBroker.verbrauchszaehler)

[![NPM](https://nodei.co/npm/iobroker.verbrauchszaehler.png?downloads=true)](https://nodei.co/npm/iobroker.verbrauchszaehler/)

**Tests:** ![Test and Release](https://github.com/Proper0912/ioBroker.verbrauchszaehler/workflows/Test%20and%20Release/badge.svg)

## verbrauchszaehler adapter for ioBroker

Consumption meters for oil and water

Here you can see your current daily consumption.
Your total consumption from the start of the adapter.

### Berechnung und gespeicherte Werte

Der Adapter unterstützt Öl und Wasser in getrennten Instanzen. Die Quelle muss
einen endlichen numerischen Tankfüllstand für Öl beziehungsweise einen
fortlaufenden Gesamtzählerstand für Wasser liefern. Tages-, Wochen-, Monats- und Jahresauswertung können
unabhängig aktiviert werden. Ohne Monatsauswertung liegen Tageswerte unter
`oil.<Jahr>.day.<TagDesJahres>.dayValue`, mit Monatsauswertung unter
`oil.<Jahr>.month.<Monat>.<Tag>.dayValue`. Wochen verwenden ISO-Kalenderwoche und
ISO-Wochenjahr; Monats- und Jahreswerte gehören zum ausgewerteten Kalendertag.

Beim ersten Start wird der aktuelle Füllstand als Berechnungsbasis gespeichert.
Der Adapter läuft weiterhin stündlich und ordnet die erste Berechnung für einen
neuen Tag dem Vortag zu. Weitere Läufe am selben Tag addieren nichts erneut.
Bei einem Quellfehler bleibt die Berechnungsbasis erhalten. Ausfallzeiten können
ohne historische Quellmesswerte nicht auf einzelne Tage aufgeteilt werden;
die nächste Differenz wird weiterhin dem zuletzt ausgewerteten Vortag zugeordnet.

Die zusätzlichen internen Zustände `oil.calc.lastProcessedDate` und
`oil.calc.pendingCalculation` verhindern doppelte Verarbeitung und erlauben das
Fortsetzen unterbrochener Schreibvorgänge. Diese Zustände nicht manuell ändern.
Vorhandene Datenpunkt-IDs und Historien werden nicht gelöscht oder automatisch
neu berechnet. Bereits falsche Summen bleiben bis zu einer gezielten Korrektur
erhalten. Bei älteren Versionen können vorbelegte Nullwerte nicht nachträglich
von tatsächlich berechneten Nullverbräuchen unterschieden werden.

Statistiken benötigen eine vollständige Folge von einem, zwei beziehungsweise
sieben Tagen. Fehlende Werte ergeben `null`; ein bekannter Verbrauch von null
Litern zählt mit. Die bestehenden Nachfüllschwellen bleiben unverändert.

### Wasserzähler einrichten

Für Wasser eine zusätzliche Instanz anlegen, beispielsweise `verbrauchszaehler.1`,
und die vorhandene Öl-Instanz weiterverwenden. In der neuen Instanz:

1. Als Medium **Wasser** wählen.
2. Den Datenpunkt mit dem fortlaufenden Gesamtzählerstand auswählen.
3. **L** oder **m³** passend zur Quelle wählen. Die bisherigen Datenpunkte bleiben
   in der Einheit der Quelle.
4. Gewünschte Tages-, Wochen-, Monats- und Jahresauswertungen aktivieren.
5. Optional **Umrechnen** aktivieren und die Zieleinheit wählen. Die umgerechneten
   Werte stehen zusätzlich unter `water.converted.L` beziehungsweise
   `water.converted.m3`. Für den Vortagesverbrauch in Litern beispielsweise
   `verbrauchszaehler.1.water.converted.L.statistic.AverageDay` verwenden.
   Die Umrechnung funktioniert auch für die Öl-Instanz unter `oil.converted`.
   Vorhandene Messwerte und Historien werden dabei nicht überschrieben.
   Nach dem Abschalten der Umrechnung werden die zusätzlichen Werte nicht mehr
   aktualisiert; bei erneuter Aktivierung werden sie aus den Originalwerten aufgebaut.

Die Wasserwerte liegen unter `verbrauchszaehler.<Instanz>.water`, mit derselben
Struktur wie bei Öl. Beispielsweise enthält `water.statistic.AverageDay` den
Verbrauch des Vortags. Berechnet wird die Zunahme des Gesamtzählerstands.
Differenzen, Summen und Durchschnitte erhalten bis zu sechs Nachkommastellen;
die Ölberechnung einschließlich Nachfüllerkennung bleibt unverändert.

Beim ersten Start wird der aktuelle Zählerstand als Ausgangswert übernommen.
Bis zum ersten Lauf am nächsten Kalendertag bleiben die Verbrauchswerte `null`.
Ein neuer Messwert am selben Tag aktualisiert den angezeigten Zählerstand,
noch nicht den abgeschlossenen Tagesverbrauch. Die Einträge unter `calc` sind
interne Berechnungsgrundlagen; für Meldungen die Werte unter `statistic` verwenden.
Ein sinkender Wasserzählerstand wird als Reset oder Zählerwechsel behandelt:
Der neue Stand wird zur Basis, der betroffene Tag bleibt unbekannt (`null`) und
die vorhandenen Summen bleiben erhalten. Verbrauch während dieses Intervalls
lässt sich ohne weitere Messwerte nicht rekonstruieren. Negative Zählerstände,
Tagesverbrauchswerte und einzelne Impulse eignen sich nicht als Quelle.

### Development checks

Install the locked dependencies with `npm ci`, then run `npm test`.
Run `npm run lint` to check both the adapter and admin sources.
The tests simulate ioBroker, source failures, interrupted writes, evaluation
options and calendar boundaries, including daylight saving time in Europe/Berlin.
`npm pack --dry-run` checks the published file list. A real ioBroker installation
and the physical tank sensor still need a manual check before deployment.


### **Work in Progress**
####  0.0.10  (2023-01 2023-12)
* (proper0912) Adjust readme text with instructions in German and English
* (proper0912) Integrated water consumption 
* (proper0912) add a widget for displaying statistics

## Changelog

<!--
  Placeholder for the next version (at the beginning of the line):
  ### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**

### 0.0.13 (2026-11-04)
* (proper0912) Implement the existing conversion option for litres and cubic metres in additional converted.L/converted.m3 data points, preserving original readings, history and oil refill calibration.
* (proper0912) Explain unknown daily consumption during initialization and add regression tests for the reported water readings, conversion, target changes and interrupted conversion writes.
* (proper0912) Enable token-free npm trusted publishing and allow a verified existing release tag to be published manually without changing the tag or GitHub release notes.

### 0.0.12 (2026-11-01)
* (proper0912) Add cumulative water meter support in separate instances, using litres or cubic metres without automatic unit conversion.
* (proper0912) Preserve fractional water consumption, period totals and daily averages; handle meter resets without inventing consumption.
* (proper0912) Add regression coverage for water evaluation options, year changes, write recovery and independent oil/water instances.
* (proper0912) Repair GitHub Actions with Node.js 22/24 platform tests, Linux compatibility tests for Node.js 14/16, and the existing adapter and package test commands; remove the duplicate legacy workflow.

### 0.0.11 (2026-11-01)
* (proper0912) Fix daily consumption being assigned one day too early and the resulting zero in yesterday's statistics.
* (proper0912) Fix independent evaluation options, month/year rollover, ISO week years and daylight saving time handling.
* (proper0912) Await and validate source readings; recover interrupted writes without counting consumption twice.
* (proper0912) Add regression tests and repair project-wide linting.

###  0.0.10  (2022-12-29)
* (proper0912) Added oil refill automatic / Statistic for 1,2 and 7 Days / Improved structure

###  0.0.9  (2022-12-29)
* (proper0912) Added oil refill automatic / Statistic for 1,2 and 7 Days / Improved structure

###  0.0.8  (2022-12-29)
* (proper0912) Added oil refill / Prepare for water / Switched to timer / Improved structure

###  0.0.7  (2022-11-09)
* (proper0912) shedule aktivated
* (proper0912) Bugfix

###  0.0.6  (2022-11-09)
* (proper0912) Bugfix

###  0.0.5  (2022-11-09)
* (proper0912) add refill calculator for oil tank für test

###  0.0.4  (2022-03-20)
* (proper0912) Added statistics

###  0.0.3  (2022-03-20)
* (proper0912) Add annual consumption

###  0.0.2  (2022-03-17)
* (proper0912) Framework for data collection
* (proper0912) index.html Structure for a data point
* (proper0912) Define the structure of the data points
* (proper0912) image updated

###  0.0.1  (2022-03-09)
* (proper0912) Initial Projekt

## License
MIT License

Copyright (c) 2022 Florian Peter <peter_florian@gmx.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
