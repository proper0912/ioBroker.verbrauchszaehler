"use strict";

const assert = require("assert").strict;
const sinon = require("sinon");
const proxyquire = require("proxyquire").noCallThru();
const defaults = require("./io-package.json").native;

process.env.TZ = "Europe/Berlin";

describe("consumption adapter", () => {
	let clock, states, objects, adapter, ready, start, source;

	beforeEach(() => {
		clock = sinon.useFakeTimers({ now: new Date(2026, 9, 31, 0, 5), toFake: ["Date"] });
		states = new Map();
		objects = new Map();
		source = { val: 1000 };
		adapter = {
			namespace: "verbrauchszaehler.0",
			config: { ...defaults, medium: "oil", triggerID: "sensor", unit: "L" },
			log: { debug: sinon.spy(), info: sinon.spy(), warn: sinon.spy(), error: sinon.spy() },
			stop: sinon.spy(),
			on() {},
			subscribeStates() {},
			getForeignStateAsync: sinon.stub().callsFake(async () => source),
			getStateAsync: sinon.spy(async id => states.get(id) || null),
			getStatesAsync: sinon.spy(async () => Object.fromEntries([...states].map(([id, state]) => [`${adapter.namespace}.${id}`, state]))),
			getAdapterObjectsAsync: sinon.spy(async () => Object.fromEntries([...objects].map(([id, object]) => [`${adapter.namespace}.${id}`, object]))),
			extendObjectAsync: sinon.spy(async (id, change) => {
				const object = objects.get(id);
				assert.ok(object, `updating metadata without an object: ${id}`);
				object.common = { ...object.common, ...change.common };
			}),
			setObjectNotExistsAsync: sinon.spy(async (id, object) => {
				if (!objects.has(id)) objects.set(id, object);
				if (!states.has(id)) states.set(id, { val: object.common.def });
			}),
			setStateAsync: sinon.spy(async (id, state) => {
				assert.ok(objects.has(id), `writing a state without an object: ${id}`);
				states.set(id, state);
			}),
		};
		start = proxyquire("./main", {
			"@iobroker/adapter-core": { Adapter: function (options) { ready = options.ready; return adapter; } },
		});
	});

	afterEach(() => clock.restore());

	async function run(date, value = source.val) {
		clock.setSystemTime(date);
		source = { val: value };
		start();
		await ready();
	}

	function seed(id, val) {
		objects.set(id, { type: "state", common: { type: "number" }, native: {} });
		states.set(id, { val });
	}

	it("loads without undeclared dependencies and initializes", async () => {
		await run(new Date(2026, 9, 31, 0, 5));
		assert.equal(states.get("oil.2026.calc.dayLastValue").val, 1000);
		assert.equal(adapter.log.error.callCount, 0);
		assert.equal(adapter.stop.callCount, 1);
	});

	for (const medium of ["oil", "water"]) for (let mask = 0; mask < 16; mask++) {
		it(`supports ${medium} evaluation options ${mask.toString(2).padStart(4, "0")}`, async () => {
			adapter.config.medium = medium;
			for (const [index, option] of ["day", "week", "month", "year"].entries()) {
				adapter.config[option] = Boolean(mask & (1 << index));
			}
			await run(new Date(2026, 9, 31, 0, 5));
			await run(new Date(2026, 10, 1, 0, 5), medium === "water" ? 1010 : 990);
			assert.equal(adapter.log.error.callCount, 0);
			for (const option of ["week", "month", "year"]) {
				if (!adapter.config[option]) {
					assert.ok(!adapter.getStateAsync.args.some(([id]) => id.endsWith(`.${option}Value`) || id.includes(`calc.${option}`)));
				}
			}
			if (adapter.config.day) {
				const id = adapter.config.month ? `${medium}.2026.month.10.31.dayValue` : `${medium}.2026.day.304.dayValue`;
				assert.equal(states.get(id).val, 10);
			}
			if (adapter.config.month) assert.equal(states.get(`${medium}.2026.month.10.monthValue`).val, 10);
			if (adapter.config.year) assert.equal(states.get(`${medium}.2026.year.yearValue`).val, 10);
		});
	}

	for (const unit of ["L", "m³"]) {
		it(`preserves fractional water consumption and averages in ${unit}`, async () => {
			Object.assign(adapter.config, { medium: "water", unit, week: true, month: true, year: true });
			await run(new Date(2026, 9, 29, 0, 5), 123456.789);
			await run(new Date(2026, 9, 30, 0, 5), 123456.790);
			await run(new Date(2026, 9, 31, 0, 5), 123456.792);
			assert.equal(adapter.log.error.callCount, 0);
			assert.equal(states.get("water.2026.month.10.29.dayValue").val, 0.001);
			assert.equal(states.get("water.2026.month.10.30.dayValue").val, 0.002);
			assert.equal(states.get("water.statistic.AverageTwoDays").val, 0.0015);
			assert.equal(states.get("water.2026.month.10.monthValue").val, 0.003);
			assert.equal(states.get("water.2026.week.44.weekValue").val, 0.003);
			assert.equal(states.get("water.2026.year.yearValue").val, 0.003);
			assert.equal(objects.get("water.2026.month.10.30.dayValue").common.unit, unit);
		});
	}

	it("converts all existing water data points and metadata to litres using the reported readings", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "m³", convert: true, convertunit: "L", week: true, month: true, year: true });
		await run(new Date(2026, 10, 2, 12), 644.910);
		assert.equal(states.get("water.statistic.AverageDay").val, null);
		await run(new Date(2026, 10, 3, 12), 644.911);
		assert.equal(adapter.log.error.callCount, 0);
		for (const id of ["water.statistic.AverageDay", "water.2026.month.11.2.dayValue", "water.2026.month.11.monthValue", "water.2026.week.45.weekValue", "water.2026.year.yearValue", "water.2026.calc.dayDiffValue", "water.2026.calc.monthLastValue"]) {
			assert.equal(states.get(id).val, 1, id);
			assert.equal(objects.get(id).common.unit, "L", id);
		}
		assert.equal(states.get("water.instanceValue").val, 644911);
		assert.equal(states.get("water.2026.calc.dayLastValue").val, 644911);
		assert.equal(states.get("year").val, 2026);
		assert.equal(objects.get("year").common.unit, "");
		assert.ok(![...states.keys()].some(id => id.includes("converted")));
		await run(new Date(2026, 10, 3, 13), 645.01);
		assert.equal(states.get("water.statistic.AverageDay").val, 1);
		await run(new Date(2026, 10, 4, 0, 5), 645.01);
		assert.equal(states.get("water.statistic.AverageDay").val, 99);
		assert.equal(states.get("water.2026.month.11.monthValue").val, 100);
	});

	for (const [unit, convertunit, amount, expected] of [["L", "m³", 1, 0.001], ["m³", "L", 0.1, 100], ["L", "L", 0, 0]]) {
		it(`migrates existing ${unit} history to ${convertunit} and continues accumulating without duplication`, async () => {
			Object.assign(adapter.config, { medium: "water", unit, week: true, month: true, year: true });
			await run(new Date(2026, 10, 2, 0, 5), 100);
			await run(new Date(2026, 10, 3, 0, 5), 100 + amount);
			Object.assign(adapter.config, { convert: true, convertunit });
			await run(new Date(2026, 10, 3, 1, 5), 100 + amount);
			assert.equal(adapter.log.error.callCount, 0);
			assert.equal(states.get("water.2026.month.11.2.dayValue").val, expected);
			assert.equal(objects.get("water.2026.month.11.2.dayValue").common.unit, convertunit);
			await run(new Date(2026, 10, 4, 0, 5), 100 + 2 * amount);
			assert.equal(states.get("water.2026.month.11.monthValue").val, 2 * expected);
			adapter.config.convert = false;
			await run(new Date(2026, 10, 4, 1, 5), 100 + 2 * amount);
			assert.equal(states.get("water.2026.month.11.monthValue").val, 2 * amount);
			assert.equal(objects.get("water.2026.month.11.monthValue").common.unit, unit);
		});
	}

	for (const stage of ["value", "metadata", "marker", "clear"]) {
		it(`replays an interrupted unit migration after ${stage} without multiplying values twice`, async () => {
			Object.assign(adapter.config, { medium: "water", unit: "m³", month: true });
			await run(new Date(2026, 10, 2, 0, 5), 644.91);
			await run(new Date(2026, 10, 3, 0, 5), 645.01);
			Object.assign(adapter.config, { convert: true, convertunit: "L" });
			const originalWrite = adapter.setStateAsync;
			const originalExtend = adapter.extendObjectAsync;
			let fail = true;
			adapter.setStateAsync = async (id, state) => {
				if (fail && (stage === "value" && id === "water.2026.month.11.2.dayValue"
					|| stage === "marker" && id === "water.calc.outputUnit"
					|| stage === "clear" && id === "water.calc.pendingUnitConversion" && state.val === "")) throw new Error("interrupted");
				return originalWrite(id, state);
			};
			adapter.extendObjectAsync = async (id, change) => {
				if (fail && stage === "metadata" && id === "water.2026.month.11.2.dayValue") throw new Error("interrupted");
				return originalExtend(id, change);
			};
			await run(new Date(2026, 10, 3, 1, 5), 645.01);
			assert.equal(adapter.log.error.callCount, 1);
			assert.ok(states.get("water.calc.pendingUnitConversion").val);
			fail = false;
			await run(new Date(2026, 10, 3, 2, 5), 645.01);
			assert.equal(states.get("water.2026.month.11.monthValue").val, 100);
			assert.equal(states.get("water.2026.calc.dayLastValue").val, 645010);
			assert.equal(objects.get("water.2026.month.11.monthValue").common.unit, "L");
			assert.equal(states.get("water.calc.pendingUnitConversion").val, "");
			await run(new Date(2026, 10, 4, 0, 5), 645.11);
			assert.equal(states.get("water.2026.month.11.monthValue").val, 200);
		});
	}

	it("finishes a saved migration before applying a newly changed target", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "m³", month: true });
		await run(new Date(2026, 10, 2, 0, 5), 100);
		await run(new Date(2026, 10, 3, 0, 5), 100.1);
		Object.assign(adapter.config, { convert: true, convertunit: "L" });
		const original = adapter.extendObjectAsync;
		adapter.extendObjectAsync = async () => { throw new Error("interrupted metadata write"); };
		await run(new Date(2026, 10, 3, 1, 5), 100.1);
		assert.ok(states.get("water.calc.pendingUnitConversion").val);
		adapter.extendObjectAsync = original;
		adapter.config.convert = false;
		await run(new Date(2026, 10, 3, 2, 5), 100.1);
		assert.equal(states.get("water.2026.month.11.monthValue").val, 0.1);
		assert.equal(states.get("water.2026.calc.dayLastValue").val, 100.1);
		assert.equal(objects.get("water.2026.month.11.monthValue").common.unit, "m³");
	});

	it("rejects conversion overflow before migrating any existing measurement", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "m³", convert: true, convertunit: "L" });
		seed("water.2026.day.1.dayValue", 0.1);
		seed("water.2026.day.2.dayValue", 1e308);
		await run(new Date(2026, 10, 4, 0, 5), 645.01);
		assert.equal(adapter.log.error.callCount, 1);
		assert.equal(states.get("water.2026.day.1.dayValue").val, 0.1);
		assert.equal(states.get("water.2026.day.2.dayValue").val, 1e308);
		assert.ok(!states.has("water.calc.outputUnit"));
	});

	it("keeps oil refill calibration and fractional output statistics in cubic metres", async () => {
		Object.assign(adapter.config, { convert: true, convertunit: "m³" });
		await run(new Date(2026, 10, 2, 0, 5), 1000);
		await run(new Date(2026, 10, 3, 0, 5), 1490);
		assert.equal(states.get("oil.statistic.AverageDay").val, 0.01);
		assert.equal(states.get("oil.2026.calc.dayLastValue").val, 1.49);
		await run(new Date(2026, 10, 4, 0, 5), 1470);
		assert.equal(states.get("oil.statistic.AverageTwoDays").val, 0.015);
		assert.equal(adapter.log.error.callCount, 0);
	});

	it("migrates old years and legacy unknown days while leaving obsolete converted data untouched", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "m³", convert: true, convertunit: "L" });
		seed("water.2025.month.10.1.dayValue", 0.2);
		seed("water.2025.month.10.2.dayValue", -1);
		seed("water.2025.month.10.3.dayValue", null);
		seed("water.converted.L.instanceValue", 644910);
		await run(new Date(2026, 10, 4, 0, 5), 645.01);
		assert.equal(adapter.log.error.callCount, 0);
		assert.equal(states.get("water.2025.month.10.1.dayValue").val, 200);
		assert.equal(states.get("water.2025.month.10.2.dayValue").val, -1);
		assert.equal(states.get("water.2025.month.10.3.dayValue").val, null);
		assert.equal(states.get("water.converted.L.instanceValue").val, 644910);
		assert.equal(objects.get("water.2025.month.10.1.dayValue").common.unit, "L");
	});

	it("keeps converted totals and baselines correct through New Year and a meter reset", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "m³", convert: true, convertunit: "L", month: true, year: true });
		await run(new Date(2026, 11, 31, 0, 5), 644.91);
		await run(new Date(2027, 0, 1, 0, 5), 645.01);
		assert.equal(states.get("water.2026.year.yearValue").val, 100);
		assert.equal(states.get("water.2027.calc.dayLastValue").val, 645010);
		await run(new Date(2027, 0, 2, 0, 5), 1);
		assert.equal(states.get("water.statistic.AverageDay").val, null);
		assert.equal(states.get("water.2027.calc.dayLastValue").val, 1000);
		await run(new Date(2027, 0, 3, 0, 5), 1.001);
		assert.equal(states.get("water.2027.year.yearValue").val, 1);
		assert.equal(adapter.log.error.callCount, 0);
	});

	it("recovers a pending consumption calculation after changing the output unit", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "m³", month: true });
		await run(new Date(2026, 10, 2, 0, 5), 644.91);
		const original = adapter.setStateAsync;
		let fail = true;
		adapter.setStateAsync = async (id, state) => {
			if (fail && id === "water.2026.calc.monthLastValue") throw new Error("interrupted daily calculation");
			return original(id, state);
		};
		await run(new Date(2026, 10, 3, 0, 5), 645.01);
		assert.ok(states.get("water.calc.pendingCalculation").val);
		Object.assign(adapter.config, { convert: true, convertunit: "L" });
		fail = false;
		await run(new Date(2026, 10, 3, 1, 5), 645.01);
		assert.equal(states.get("water.2026.month.11.monthValue").val, 100);
		assert.equal(states.get("water.2026.calc.dayLastValue").val, 645010);
		assert.equal(states.get("water.calc.pendingCalculation").val, "");
	});

	for (const plan of ["invalid", JSON.stringify({ unit: "L", writes: [["oil.instanceValue", 100]] }), JSON.stringify({ unit: "L", writes: [["water.calc.lastProcessedDate", 100]] }), JSON.stringify({ unit: "bad", writes: [] })]) {
		it(`rejects invalid unit migration ${plan}`, async () => {
			Object.assign(adapter.config, { medium: "water", unit: "m³", convert: true, convertunit: "L" });
			seed("water.calc.pendingUnitConversion", plan);
			await run(new Date(2026, 10, 4, 0, 5), 645.01);
			assert.equal(adapter.log.error.callCount, 1);
			assert.equal(states.get("water.calc.pendingUnitConversion").val, plan);
			assert.ok(!states.has("water.instanceValue"));
		});
	}

	it("rejects an invalid conversion unit before calculating consumption", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "m³", convert: true, convertunit: "" });
		await run(new Date(2026, 10, 2, 0, 5), 644.91);
		assert.equal(adapter.log.error.callCount, 1);
		assert.equal(states.size, 0);
	});

	it("treats a water meter reset as unknown consumption and resumes from the new reading", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "m³", month: true, year: true });
		await run(new Date(2026, 9, 29, 0, 5), 200);
		await run(new Date(2026, 9, 30, 0, 5), 200.25);
		await run(new Date(2026, 9, 31, 0, 5), 2);
		assert.equal(adapter.log.warn.callCount, 1);
		assert.equal(states.get("water.2026.month.10.30.dayValue").val, null);
		assert.equal(states.get("water.statistic.AverageDay").val, null);
		assert.equal(states.get("water.2026.year.yearValue").val, 0.25);
		assert.equal(states.get("water.2026.calc.dayLastValue").val, 2);
		await run(new Date(2026, 10, 1, 0, 5), 2.1);
		assert.equal(states.get("water.2026.month.10.31.dayValue").val, 0.1);
		assert.equal(states.get("water.2026.year.yearValue").val, 0.35);
	});

	it("retains water precision through the automatic year change", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "m³", month: true, year: true });
		await run(new Date(2026, 11, 31, 0, 5), 100.1);
		await run(new Date(2027, 0, 1, 0, 5), 100.3);
		assert.equal(states.get("water.2026.month.12.31.dayValue").val, 0.2);
		assert.equal(states.get("water.2027.calc.dayLastValue").val, 100.3);
		await run(new Date(2027, 0, 2, 0, 5), 100.31);
		assert.equal(states.get("water.2027.year.yearValue").val, 0.01);
		assert.equal(states.get("water.statistic.AverageTwoDays").val, 0.105);
	});

	it("records zero water consumption once and includes it in averages", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "m³" });
		await run(new Date(2026, 9, 29, 0, 5), 100);
		await run(new Date(2026, 9, 30, 0, 5), 100.2);
		await run(new Date(2026, 9, 31, 0, 5), 100.2);
		await run(new Date(2026, 9, 31, 1, 5), 100.3);
		assert.equal(states.get("water.2026.day.303.dayValue").val, 0);
		assert.equal(states.get("water.statistic.AverageTwoDays").val, 0.1);
		await run(new Date(2026, 10, 1, 0, 5), 100.3);
		assert.equal(states.get("water.2026.day.304.dayValue").val, 0.1);
	});

	for (const value of [null, "100", NaN, Infinity, -1]) {
		it(`rejects invalid water reading ${String(value)} without changing the baseline`, async () => {
			Object.assign(adapter.config, { medium: "water", unit: "L" });
			await run(new Date(2026, 9, 31, 0, 5), 100);
			source = value === null ? null : { val: value };
			clock.setSystemTime(new Date(2026, 10, 1, 0, 5));
			start();
			await ready();
			assert.equal(adapter.log.error.callCount, 1);
			assert.equal(states.get("water.2026.calc.dayLastValue").val, 100);
			assert.equal(states.get("water.calc.lastProcessedDate").val, "2026-10-30");
		});
	}

	it("requires a supported water unit", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "" });
		await run(new Date(2026, 9, 31, 0, 5), 100);
		assert.equal(adapter.log.error.callCount, 1);
		assert.ok(!adapter.getForeignStateAsync.called);
	});

	it("recovers interrupted water writes without double counting", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "L", month: true });
		await run(new Date(2026, 9, 31, 0, 5), 1000);
		const originalWrite = adapter.setStateAsync;
		let fail = true;
		adapter.setStateAsync = async (id, state) => {
			if (fail && id === "water.2026.calc.monthLastValue") throw new Error("write interrupted");
			await originalWrite(id, state);
		};
		await run(new Date(2026, 10, 1, 0, 5), 1005.25);
		assert.equal(adapter.log.error.callCount, 1);
		assert.equal(states.get("water.2026.month.10.monthValue").val, 5.25);
		fail = false;
		await run(new Date(2026, 10, 1, 1, 5), 1007);
		assert.equal(states.get("water.2026.month.10.monthValue").val, 5.25);
		assert.equal(states.get("water.2026.calc.dayLastValue").val, 1005.25);
		assert.equal(states.get("water.calc.pendingCalculation").val, "");
	});

	it("does not accept oil writes in the pending calculation of a water instance", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "L" });
		seed("water.calc.pendingCalculation", JSON.stringify([["oil.2026.calc.dayLastValue", 100]]));
		await run(new Date(2026, 9, 31, 0, 5), 1000);
		assert.equal(adapter.log.error.callCount, 1);
		assert.ok(!states.has("oil.2026.calc.dayLastValue"));
	});

	it("keeps concurrent oil and water instances independent in compact mode", async () => {
		await run(new Date(2026, 9, 31, 0, 5));
		const oilReady = ready;
		const oilStates = states;
		const waterStates = new Map();
		const waterObjects = new Map();
		let waterLevel = 200;
		adapter = {
			...adapter,
			config: { ...defaults, triggerID: "water-sensor", medium: "water", unit: "L" },
			getForeignStateAsync: async () => ({ val: waterLevel }),
			getStateAsync: async id => waterStates.get(id) || null,
			setObjectNotExistsAsync: async (id, object) => {
				if (!waterObjects.has(id)) waterObjects.set(id, object);
				if (!waterStates.has(id)) waterStates.set(id, { val: object.common.def });
			},
			setStateAsync: async (id, state) => {
				assert.ok(waterObjects.has(id));
				waterStates.set(id, state);
			},
		};
		start();
		const waterReady = ready;
		await waterReady();
		clock.setSystemTime(new Date(2026, 10, 1, 0, 5));
		source = { val: 990 };
		waterLevel = 205.5;
		await Promise.all([oilReady(), waterReady()]);
		assert.equal(adapter.log.error.callCount, 0);
		assert.equal(oilStates.get("oil.statistic.AverageDay").val, 10);
		assert.equal(waterStates.get("water.statistic.AverageDay").val, 5.5);
		assert.ok(![...oilStates.keys()].some(id => id.startsWith("water.")));
		assert.ok(![...waterStates.keys()].some(id => id.startsWith("oil.")));
	});

	it("keeps fractional seven-day water averages including a zero day", async () => {
		Object.assign(adapter.config, { medium: "water", unit: "L" });
		let level = 1000;
		await run(new Date(2026, 9, 24, 0, 5), level);
		for (let day = 25; day <= 31; day++) {
			if (day !== 25) level += 0.7;
			await run(new Date(2026, 9, day, 0, 5), level);
		}
		assert.equal(states.get("water.statistic.AverageSevenDays").val, 0.6);
	});

	it("waits for the source before writing the baseline or stopping", async () => {
		let releaseRead;
		adapter.getForeignStateAsync.callsFake(() => new Promise(resolve => { releaseRead = resolve; }));
		start();
		const pending = ready();
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(adapter.stop.callCount, 0);
		assert.ok(!states.has("oil.2026.calc.dayLastValue"));
		releaseRead({ val: 900 });
		await pending;
		assert.equal(states.get("oil.2026.calc.dayLastValue").val, 900);
		assert.equal(adapter.stop.callCount, 1);
	});

	for (const value of [null, "900", NaN, Infinity]) {
		it(`rejects invalid source ${String(value)} without changing the baseline`, async () => {
			await run(new Date(2026, 9, 31, 0, 5));
			source = value === null ? null : { val: value };
			start();
			await ready();
			assert.equal(states.get("oil.2026.calc.dayLastValue").val, 1000);
			assert.equal(adapter.log.error.callCount, 1);
			assert.equal(adapter.stop.callCount, 2);
		});
	}

	it("catches rejected source reads", async () => {
		adapter.getForeignStateAsync.rejects(new Error("source unavailable"));
		start();
		await ready();
		assert.equal(adapter.log.error.callCount, 1);
		assert.equal(adapter.stop.callCount, 1);
	});

	it("finishes October before starting the November total", async () => {
		adapter.config.month = true;
		await run(new Date(2026, 9, 31, 0, 5));
		seed("oil.2026.month.10.monthValue", 300);
		seed("oil.2026.calc.monthLastValue", 300);
		await run(new Date(2026, 10, 1, 0, 5), 990);
		assert.equal(states.get("oil.2026.month.10.monthValue").val, 310);
		await run(new Date(2026, 10, 1, 1, 5), 985);
		assert.equal(states.get("oil.2026.month.10.monthValue").val, 310);
		await run(new Date(2026, 10, 2, 0, 5), 980);
		assert.equal(states.get("oil.2026.month.11.monthValue").val, 10);
	});

	it("records zero consumption once and includes it in averages", async () => {
		await run(new Date(2026, 9, 30, 0, 5));
		await run(new Date(2026, 9, 31, 0, 5), 990);
		await run(new Date(2026, 10, 1, 0, 5), 990);
		assert.equal(states.get("oil.2026.day.304.dayValue").val, 0);
		assert.equal(states.get("oil.statistic.AverageTwoDays").val, 5);
		await run(new Date(2026, 10, 1, 1, 5), 980);
		assert.equal(states.get("oil.2026.day.304.dayValue").val, 0);
	});

	it("assigns the reported 383, 379, 374, 368 litre readings to completed calendar days", async () => {
		adapter.config.month = true;
		let level = 383;
		const readings = { 28: 383, 29: 379, 30: 374, 31: 368 };
		for (let day = 28; day <= 31; day++) {
			for (let hour = 0; hour < 24; hour++) {
				if (hour === 12) level = readings[day];
				await run(new Date(2026, 9, day, hour, 5), level);
			}
		}
		await run(new Date(2026, 10, 1, 0, 5), level);
		assert.equal(states.get("oil.2026.month.10.29.dayValue").val, 4);
		assert.equal(states.get("oil.2026.month.10.30.dayValue").val, 5);
		assert.equal(states.get("oil.2026.month.10.31.dayValue").val, 6);
		assert.equal(states.get("oil.statistic.AverageDay").val, 6);
	});

	it("does not publish an average for missing history", async () => {
		await run(new Date(2026, 9, 31, 0, 5));
		await run(new Date(2026, 10, 1, 0, 5), 990);
		assert.equal(states.get("oil.statistic.AverageTwoDays").val, null);
	});

	it("preserves the baseline across New Year and reads December history in January", async () => {
		adapter.config.month = true;
		adapter.config.year = true;
		await run(new Date(2025, 11, 31, 0, 5));
		seed("oil.2025.month.12.monthValue", 300);
		seed("oil.2025.year.yearValue", 2000);
		await run(new Date(2026, 0, 1, 0, 5), 990);
		assert.equal(states.get("oil.2025.month.12.31.dayValue").val, 10);
		assert.equal(states.get("oil.2025.month.12.monthValue").val, 310);
		assert.equal(states.get("oil.2025.year.yearValue").val, 2010);
		await run(new Date(2026, 0, 2, 0, 5), 980);
		assert.equal(states.get("oil.2026.year.yearValue").val, 10);
		assert.equal(states.get("oil.statistic.AverageTwoDays").val, 10);
		assert.ok(adapter.getStateAsync.calledWith("oil.2025.month.12.31.dayValue"));
	});

	it("uses the ISO week year instead of creating week zero", async () => {
		adapter.config.week = true;
		await run(new Date(2021, 0, 3, 0, 5));
		await run(new Date(2021, 0, 4, 0, 5), 990);
		assert.equal(states.get("oil.2020.week.53.7.dayValue").val, 10);
		assert.ok(![...states.keys()].some(id => id.includes(".week.0.")));
	});

	for (const [date, id] of [
		[new Date(2024, 2, 1, 0, 5), "oil.2024.day.60.dayValue"],
		[new Date(2025, 0, 1, 0, 5), "oil.2024.day.366.dayValue"],
		[new Date(2026, 2, 30, 0, 5), "oil.2026.day.88.dayValue"],
		[new Date(2026, 9, 26, 0, 5), "oil.2026.day.298.dayValue"],
	]) {
		it(`assigns the calendar day correctly for ${id}`, async () => {
			const before = new Date(date);
			before.setDate(before.getDate() - 1);
			await run(before);
			await run(date, 990);
			assert.equal(states.get(id).val, 10);
		});
	}

	it("keeps the existing 500-litre refill calibration", async () => {
		await run(new Date(2026, 9, 31, 0, 5));
		await run(new Date(2026, 10, 1, 0, 5), 1490);
		assert.equal(states.get("oil.2026.day.304.dayValue").val, 10);
	});

	it("keeps fractional daily consumption", async () => {
		await run(new Date(2026, 9, 31, 0, 5));
		await run(new Date(2026, 10, 1, 0, 5), 999.5);
		assert.equal(states.get("oil.statistic.AverageDay").val, 0.5);
	});

	it("waits for delayed writes before stopping", async () => {
		const originalWrite = adapter.setStateAsync;
		let release;
		adapter.setStateAsync = async (id, state) => {
			if (id === "oil.instanceValue") await new Promise(resolve => { release = resolve; });
			await originalWrite(id, state);
		};
		start();
		const pending = ready();
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(adapter.stop.callCount, 0);
		release();
		await pending;
		assert.equal(adapter.stop.callCount, 1);
	});

	it("replays interrupted writes without adding consumption twice", async () => {
		adapter.config.month = true;
		await run(new Date(2026, 9, 31, 0, 5));
		seed("oil.2026.month.10.monthValue", 300);
		const originalWrite = adapter.setStateAsync;
		let fail = true;
		adapter.setStateAsync = async (id, state) => {
			if (fail && id === "oil.2026.calc.monthLastValue") throw new Error("write interrupted");
			await originalWrite(id, state);
		};
		await run(new Date(2026, 10, 1, 0, 5), 990);
		assert.equal(adapter.log.error.callCount, 1);
		assert.equal(states.get("oil.2026.month.10.monthValue").val, 310);
		assert.equal(states.get("oil.2026.calc.dayLastValue").val, 1000);
		assert.ok(states.get("oil.calc.pendingCalculation").val);
		fail = false;
		await run(new Date(2026, 10, 1, 1, 5), 985);
		assert.equal(states.get("oil.2026.month.10.monthValue").val, 310);
		assert.equal(states.get("oil.2026.calc.dayLastValue").val, 990);
		assert.equal(states.get("oil.calc.pendingCalculation").val, "");
	});

	for (const pending of ["invalid JSON", JSON.stringify([["other-adapter.value", 100]]),
		JSON.stringify([["oil.calc.lastProcessedDate", 123]]), JSON.stringify([["oil.unrelated", 100]])]) {
		it(`refuses invalid pending data: ${pending}`, async () => {
			seed("oil.calc.pendingCalculation", pending);
			await run(new Date(2026, 9, 31, 0, 5));
			assert.equal(adapter.log.error.callCount, 1);
			assert.ok(!states.has("other-adapter.value"));
			assert.ok(!states.has("oil.unrelated"));
			assert.equal(states.get("oil.calc.pendingCalculation").val, pending);
		});
	}

	it("refuses an invalid processing date without changing consumption", async () => {
		await run(new Date(2026, 9, 31, 0, 5));
		seed("oil.calc.lastProcessedDate", "2026-02-30");
		await run(new Date(2026, 10, 1, 0, 5), 990);
		assert.equal(adapter.log.error.callCount, 1);
		assert.equal(states.get("oil.2026.calc.dayLastValue").val, 1000);
	});

	it("does not recalculate a completed day when upgrading without a marker", async () => {
		adapter.config.month = true;
		seed("alive", true);
		seed("year", 2026);
		seed("oil.2026.calc.dayLastValue", 990);
		seed("oil.2026.month.10.31.dayValue", 10);
		seed("oil.2026.month.10.monthValue", 310);
		await run(new Date(2026, 10, 1, 1, 5), 985);
		assert.equal(states.get("oil.2026.month.10.31.dayValue").val, 10);
		assert.equal(states.get("oil.2026.month.10.monthValue").val, 310);
		assert.equal(states.get("oil.2026.calc.dayLastValue").val, 990);
		assert.equal(states.get("oil.calc.lastProcessedDate").val, "2026-10-31");
	});

	it("continues a legacy baseline at New Year without skipping December 31", async () => {
		adapter.config.month = true;
		adapter.config.year = true;
		seed("alive", true);
		seed("year", 2025);
		seed("oil.2025.calc.dayLastValue", 1000);
		seed("oil.2025.month.12.monthValue", 300);
		seed("oil.2025.year.yearValue", 2000);
		seed("oil.2025.month.12.31.dayValue", 0);
		await run(new Date(2026, 0, 1, 0, 5), 990);
		assert.equal(states.get("oil.2025.month.12.monthValue").val, 310);
		assert.equal(states.get("oil.2025.year.yearValue").val, 2010);
		assert.equal(states.get("oil.2026.calc.dayLastValue").val, 990);
	});

	it("does not invent consumption when the baseline is missing", async () => {
		seed("alive", true);
		seed("year", 2026);
		await run(new Date(2026, 10, 1, 0, 5), 990);
		assert.equal(states.get("oil.2026.day.304.dayValue").val, null);
		assert.equal(states.get("oil.2026.calc.dayLastValue").val, 990);
		assert.equal(adapter.log.warn.callCount, 1);
	});

	it("uses complete seven-day windows including zero consumption", async () => {
		await run(new Date(2026, 9, 24, 0, 5));
		for (let day = 25; day <= 31; day++) {
			await run(new Date(2026, 9, day, 0, 5), day % 2 ? source.val : source.val - 10);
		}
		assert.equal(states.get("oil.statistic.AverageSevenDays").val, 4);
	});

	it("supports enabling monthly and yearly evaluation on an existing instance", async () => {
		await run(new Date(2026, 9, 30, 0, 5));
		await run(new Date(2026, 9, 31, 0, 5), 995);
		adapter.config.month = true;
		adapter.config.year = true;
		await run(new Date(2026, 10, 1, 0, 5), 990);
		assert.equal(adapter.log.error.callCount, 0);
		assert.equal(states.get("oil.2026.month.10.monthValue").val, 5);
		assert.equal(states.get("oil.2026.year.yearValue").val, 5);
		assert.equal(states.get("oil.2026.day.303.dayValue").val, 5);
		assert.equal(states.get("oil.statistic.AverageTwoDays").val, 5);
	});

	it("does not recreate the full annual structure on repeated hourly runs", async () => {
		await run(new Date(2026, 9, 31, 0, 5));
		adapter.setObjectNotExistsAsync.resetHistory();
		await run(new Date(2026, 9, 31, 1, 5));
		assert.ok(adapter.setObjectNotExistsAsync.callCount < 20);
	});

	for (let refill = 500; refill <= 10500; refill += 500) {
		it(`preserves the existing ${refill}-litre refill threshold`, async () => {
			await run(new Date(2026, 9, 31, 0, 5));
			await run(new Date(2026, 10, 1, 0, 5), 1000 + refill + 99);
			assert.equal(states.get("oil.2026.day.304.dayValue").val, 99);
		});
	}
});
