"use strict";

const utils = require("@iobroker/adapter-core");
const adapterName = require("./package.json").name.split(".").pop();

function startAdapter(options = {}) {
	const adapter = new utils.Adapter({
		...options,
		name: adapterName,
		ready: async () => {
			try {
				if (!adapter.config.triggerID || adapter.config.medium !== "oil") {
					throw new Error("Configure a triggerID and the supported medium oil");
				}
				await main(adapter);
			} catch (err) {
				adapter.log.error(`Consumption calculation failed: ${err instanceof Error ? err.message : String(err)}`);
			} finally {
				adapter.stop();
			}
		},
	});
	return adapter;
}

function calendarDay(date, offset = 0) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

function dateKey(date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isDateKey(value) {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
		&& dateKey(new Date(`${value}T12:00:00`)) === value;
}

function dayOfYear(date) {
	return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / 86400000 + 1;
}

function isoWeek(date) {
	const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	thursday.setUTCDate(thursday.getUTCDate() + 3 - (thursday.getUTCDay() + 6) % 7);
	const year = thursday.getUTCFullYear();
	const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
	return { year, week };
}

function dayPath(config, date) {
	const root = `${config.medium}.${date.getFullYear()}`;
	return config.month
		? `${root}.month.${date.getMonth() + 1}.${date.getDate()}.dayValue`
		: `${root}.day.${dayOfYear(date)}.dayValue`;
}

function calcPath(config, year, period = "day") {
	return config.day || period !== "day" ? `${config.medium}.${year}.calc` : `${config.medium}.calc`;
}

function numeric(state) {
	return state && typeof state.val === "number" && Number.isFinite(state.val);
}

async function readDay(adapter, date) {
	const state = await adapter.getStateAsync(dayPath(adapter.config, date));
	if (numeric(state)) return state;
	// Keep history readable when the user switches between the two existing daily layouts.
	return adapter.getStateAsync(dayPath({ ...adapter.config, month: !adapter.config.month }, date));
}

async function ensureState(adapter, id, type = "number", def = null) {
	await adapter.setObjectNotExistsAsync(id, {
		type: "state",
		common: {
			name: id.split(".").pop(), type, role: type === "number" ? "value" : "state",
			read: true, write: true, def,
			...(type === "number" && adapter.config.unit ? { unit: adapter.config.unit } : {}),
		},
		native: {},
	});
}

async function write(adapter, id, val) {
	await adapter.setStateAsync(id, { val, ack: true });
}

async function ensureYear(adapter, year) {
	const config = adapter.config;
	for (const period of ["day", "week", "month", "year"]) {
		if (period !== "day" && !config[period]) continue;
		const calc = calcPath(config, year, period);
		await ensureState(adapter, `${calc}.${period}LastValue`);
		await ensureState(adapter, `${calc}.${period}DiffValue`);
	}
	if (config.day) {
		for (let date = new Date(year, 0, 1); date.getFullYear() === year; date = calendarDay(date, 1)) {
			await ensureState(adapter, dayPath(config, date));
		}
	}
	if (config.week) {
		const count = isoWeek(new Date(year, 11, 28)).week;
		for (let week = 1; week <= count; week++) {
			await ensureState(adapter, `${config.medium}.${year}.week.${week}.weekValue`, "number", 0);
			for (let day = 1; day <= 7; day++) {
				await ensureState(adapter, `${config.medium}.${year}.week.${week}.${day}.dayValue`);
			}
		}
	}
	if (config.month) {
		for (let month = 1; month <= 12; month++) {
			await ensureState(adapter, `${config.medium}.${year}.month.${month}.monthValue`, "number", 0);
		}
	}
	if (config.year) await ensureState(adapter, `${config.medium}.${year}.year.yearValue`, "number", 0);
}

async function main(adapter) {
	const config = adapter.config;
	const today = calendarDay(new Date());
	const yesterday = calendarDay(today, -1);
	const key = dateKey(yesterday);
	const year = today.getFullYear();
	const root = config.medium;
	const markerPath = `${root}.calc.lastProcessedDate`;
	await ensureState(adapter, `${root}.connect`, "boolean", false);
	await write(adapter, `${root}.connect`, false);
	const source = await adapter.getForeignStateAsync(config.triggerID);
	if (!numeric(source)) throw new Error(`Source ${config.triggerID} must contain a finite numeric value`);

	await ensureState(adapter, `${root}.calc.pendingCalculation`, "string", "");
	const pending = await adapter.getStateAsync(`${root}.calc.pendingCalculation`);
	if (pending && pending.val) await applyPending(adapter, pending.val);

	const alive = await adapter.getStateAsync("alive");
	const storedYear = await adapter.getStateAsync("year");
	const previousYear = numeric(storedYear) && storedYear.val > 0 ? storedYear.val : year;
	const baseline = await adapter.getStateAsync(`${calcPath(config, previousYear)}.dayLastValue`);
	const marker = await adapter.getStateAsync(markerPath);
	if (marker && marker.val != null && marker.val !== "" && !isDateKey(marker.val)) {
		throw new Error("Invalid last processed date; refusing to recalculate historical consumption");
	}
	const initialized = alive && alive.val === true && numeric(baseline);
	let processed = marker && marker.val;
	if (initialized && !processed && config.day) {
		const legacyDay = await readDay(adapter, yesterday);
		// Old versions used -1 for initialization and positive values for completed days.
		if (numeric(legacyDay) && (legacyDay.val > 0 || legacyDay.val === -1)) processed = key;
	}

	await ensureState(adapter, "alive", "boolean", false);
	await ensureState(adapter, "year", "number", 0);
	await ensureState(adapter, markerPath, "string", "");
	await ensureState(adapter, `${root}.instanceValue`);
	if (!initialized || previousYear !== year) await ensureYear(adapter, year);
	if (!initialized && yesterday.getFullYear() !== year) await ensureYear(adapter, yesterday.getFullYear());
	const week = isoWeek(yesterday);
	if (config.week && (!initialized || previousYear !== year) && week.year !== year && week.year !== yesterday.getFullYear()) {
		await ensureYear(adapter, week.year);
	}
	await write(adapter, `${root}.instanceValue`, source.val);
	await write(adapter, `${root}.connect`, true);

	const writes = [];
	if (!initialized) {
		if (alive && alive.val) adapter.log.warn("Missing consumption baseline; initializing without inventing historical consumption");
		writes.push([`${calcPath(config, year)}.dayLastValue`, source.val], [markerPath, key]);
	} else if (!processed || processed < key) {
		writes.push(...await calcValueOil(adapter, yesterday, baseline.val, source.val));
		writes.push([`${calcPath(config, year)}.dayLastValue`, source.val], [markerPath, key]);
	} else {
		// Carry the baseline into the new year even when the previous day was already processed.
		if (previousYear !== year) writes.push([`${calcPath(config, year)}.dayLastValue`, baseline.val]);
		if (!marker || !marker.val) writes.push([markerPath, processed]);
	}
	writes.push(["alive", true], ["year", year]);
	// Persist absolute results before writing so a failed run can replay without double counting.
	const serialized = JSON.stringify(writes);
	await write(adapter, `${root}.calc.pendingCalculation`, serialized);
	await applyPending(adapter, serialized);
	if (config.day) await newstastic(adapter, today);
}

function oilConsumption(a, b) {
	let c = 0;
	if ( a > b ) {
		c = Math.abs(a - b);
		if ( c < 600) {
			b = (b + 500);
		} else if ( c < 1100 ) {
			b = (b + 1000);
		} else if ( c < 1600 ){
			b = (b + 1500);
		} else if ( c < 2100 ){
			b = (b + 2000);
		} else if ( c < 2600 ){
			b = (b + 2500);
		} else if ( c < 3100 ){
			b = (b + 3000);
		} else if ( c < 3600 ){
			b = (b + 3500);
		} else if ( c < 4100 ){
			b = (b + 4000);
		} else if ( c < 4600 ){
			b = (b + 4500);
		} else if ( c < 5100 ){
			b = (b + 5000);
		} else if ( c < 5600 ){
			b = (b + 5500);
		} else if ( c < 6100 ){
			b = (b + 6000);
		} else if ( c < 6600 ){
			b = (b + 6500);
		} else if ( c < 7100 ){
			b = (b + 7000);
		} else if ( c < 7600 ){
			b = (b + 7500);
		} else if ( c < 8100 ){
			b = (b + 8000);
		} else if ( c < 8600 ){
			b = (b + 8500);
		} else if ( c < 9100 ){
			b = (b + 9000);
		} else if ( c < 9600 ){
			b = (b + 9500);
		} else if ( c < 10100 ){
			b = (b + 10000);
		} else if ( c < 10600 ){
			b = (b + 10500);
		}
	}
	return Math.abs(a - b);
}


async function applyPending(adapter, serialized) {
	const path = `${adapter.config.medium}.calc.pendingCalculation`;
	const writes = JSON.parse(serialized);
	if (!Array.isArray(writes) || writes.length > 24 || !writes.every(entry => {
		if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") return false;
		const [id, value] = entry;
		if (id === "alive") return value === true;
		if (id === "year") return Number.isInteger(value) && value >= 1000 && value <= 9999;
		if (id === `${adapter.config.medium}.calc.lastProcessedDate`) return isDateKey(value);
		if (!id.startsWith(`${adapter.config.medium}.`) || !Number.isFinite(value)) return false;
		const relative = id.slice(adapter.config.medium.length + 1);
		return [
			/^(?:\d{4}\.)?calc\.(?:day|week|month|year)(?:Last|Diff)Value$/,
			/^\d{4}\.day\.\d{1,3}\.dayValue$/,
			/^\d{4}\.week\.\d{1,2}\.(?:weekValue|[1-7]\.dayValue)$/,
			/^\d{4}\.month\.\d{1,2}\.(?:monthValue|\d{1,2}\.dayValue)$/,
			/^\d{4}\.year\.yearValue$/,
		].some(pattern => pattern.test(relative));
	})) {
		throw new Error("Invalid pending consumption calculation; refusing to overwrite states");
	}
	for (const [id, value] of writes) {
		await ensureState(adapter, id, typeof value);
		await write(adapter, id, value);
	}
	await write(adapter, path, "");
}

async function calcValueOil(adapter, date, previous, current) {
	const config = adapter.config;
	const value = oilConsumption(current, previous);
	const root = `${config.medium}.${date.getFullYear()}`;
	const writes = [[`${calcPath(config, date.getFullYear())}.dayDiffValue`, value]];
	if (config.day) writes.push([dayPath(config, date), value]);
	if (config.week) {
		const { year, week } = isoWeek(date);
		const path = `${config.medium}.${year}.week.${week}`;
		const total = await adapter.getStateAsync(`${path}.weekValue`);
		const sum = (numeric(total) ? total.val : 0) + value;
		writes.push([`${path}.${(date.getDay() + 6) % 7 + 1}.dayValue`, value],
			[`${path}.weekValue`, sum], [`${root}.calc.weekLastValue`, sum], [`${root}.calc.weekDiffValue`, sum]);
	}
	if (config.month) {
		const path = `${root}.month.${date.getMonth() + 1}.monthValue`;
		const total = await adapter.getStateAsync(path);
		const sum = (numeric(total) ? total.val : 0) + value;
		writes.push([path, sum], [`${root}.calc.monthLastValue`, sum], [`${root}.calc.monthDiffValue`, sum]);
	}
	if (config.year) {
		const path = `${root}.year.yearValue`;
		const total = await adapter.getStateAsync(path);
		const sum = (numeric(total) ? total.val : 0) + value;
		writes.push([path, sum], [`${root}.calc.yearLastValue`, sum], [`${root}.calc.yearDiffValue`, sum]);
	}
	return writes;
}

async function newstastic(adapter, today) {
	const days = [];
	for (let offset = 1; offset <= 7; offset++) {
		const state = await readDay(adapter, calendarDay(today, -offset));
		days.push(numeric(state) && state.val >= 0 ? state.val : null);
	}
	for (const [count, name] of [[1, "AverageDay"], [2, "AverageTwoDays"], [7, "AverageSevenDays"]]) {
		const path = `${adapter.config.medium}.statistic.${name}`;
		await ensureState(adapter, path);
		const window = days.slice(0, count);
		const value = window.every(day => day !== null)
			? count === 1 ? window[0] : Math.round(window.reduce((sum, day) => sum + day, 0) / count) : null;
		await write(adapter, path, value);
	}
}

if (module.parent) {
	module.exports = startAdapter;
} else {
	startAdapter();
}
