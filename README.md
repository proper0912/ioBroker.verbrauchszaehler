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

Der Adapter unterstützt derzeit Öl. Die Quelle muss einen endlichen numerischen
Tankfüllstand liefern. Tages-, Wochen-, Monats- und Jahresauswertung können
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
