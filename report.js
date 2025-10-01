let reportId = "";
let changesCount = 0;
let lastReportData = null;
const pricesStore = {};

const CSV_FILE_TYPE = "text/csv;charset=utf-8;";
const CSV_BOM = "\uFEFF";
const DEFAULT_FILENAME = "data";
const PRICE_DIFF_COLORS = { positive: "green", negative: "red" };

const TABLE_HEADERS = {
	report: ["image", "id", "name", ["price", "reportTable", 0, 0], "rating", ["reviews", "reportTable", 1, 1]],
	changes: ["image", "id", "name", "oldPrice", ["price", "tableOfChanges", 0, 0], ["diff", "tableOfChanges", 1, 0], "rating", ["reviews", "tableOfChanges", 2, 1]],
};

const elements = {};

const el = (tag, props = {}, children = []) => {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		if (k === "style") Object.assign(node.style, v);
		else if (k === "attrs") Object.entries(v).forEach(([a, val]) => node.setAttribute(a, val));
		else if (k === "events") Object.entries(v).forEach(([e, fn]) => node.addEventListener(e, fn));
		else node[k] = v;
	}
	(children || []).forEach(ch => node.appendChild(ch));
	return node;
};

const escapeCsvValue = (value) => {
	if (value == null) return "";
	const s = String(value);
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const jsonToCsv = (data, { headers = null, delimiter = ",", includeHeader = true } = {}) => {
	if (!Array.isArray(data) || data.length === 0) return "";
	const keys = headers || [...new Set(data.flatMap(Object.keys))];
	const rows = includeHeader ? [keys.map(escapeCsvValue).join(delimiter)] : [];
	for (const item of data) rows.push(keys.map(k => escapeCsvValue(item[k])).join(delimiter));
	return rows.join("\n");
};

const exportCsv = (csvContent, filename = DEFAULT_FILENAME) => {
	try {
		const blob = new Blob([CSV_BOM + csvContent], { type: CSV_FILE_TYPE });
		const url = URL.createObjectURL(blob);
		const a = Object.assign(document.createElement("a"), { href: url, download: `${filename}.csv` });
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 100);
	} catch (e) {
		console.error("Ошибка при сохранении CSV:", e);
	}
};

const createCell = (content, options = {}) => {
	const td = el("td");
	if (content instanceof Node) td.appendChild(content);
	else td.textContent = content ?? "";
	if (options.style) Object.assign(td.style, options.style);
	return td;
};

const createHeaderRow = (columns) => {
	const tr = el("tr");
	columns.forEach(col => {
		if (Array.isArray(col)) {
			const [text, table, part, dir] = col;
			const th = el("th", {
				textContent: text,
				attrs: { "sort-table": table, "sort-part": String(part), "sort-dir": String(dir) },
				style: { cursor: "pointer", color: "blue", textDecoration: "underline" },
				events: { click: sortTable }
			});
			tr.appendChild(th);
		} else {
			tr.appendChild(el("th", { textContent: col }));
		}
	});
	return tr;
};

const createImage = (src, width = 52) => el("img", { src, width, loading: "lazy" });

const createLink = (href, text) => el("a", { href, textContent: text, target: "_blank" });

const getTableExportDataUncheckedSet = () => {
	const opts = elements.tableExportDataOptions.querySelectorAll('input[type="checkbox"]');
	const set = new Set();
	opts.forEach(i => { if (!i.checked) set.add(i.value); });
	return set;
};

const getLastReportDataItemsForExport = () => {
	if (!lastReportData) return [];
	const unchecked = getTableExportDataUncheckedSet();
	const items = Object.values(lastReportData.items);
	if (unchecked.size === 0) return items;
	return items.map(item => Object.keys(item).reduce((acc, k) => {
		if (!unchecked.has(k)) acc[k] = item[k];
		return acc;
	}, {}));
};

const saveReportAsCsv = () => {
	if (!lastReportData) return;
	try {
		const includeHeader = elements.headersCheckbox.checked;
		const items = getLastReportDataItemsForExport();
		const firstId = items[0]?.id ?? 0;
		const filename = `${reportId}_${lastReportData.marketplace}_${firstId}_${lastReportData.totalItems}`;
		const content = jsonToCsv(items, { includeHeader });
		exportCsv(content, filename);
	} catch (err) {
		console.error("Ошибка при сохранении отчёта в CSV:", err);
	}
};

const safeGetNumberFromAttr = (el, name, fallback = 0) => {
	const v = el?.getAttribute(name);
	return Number.isFinite(+v) ? +v : fallback;
};

function sortTable(e) {
	const target = e.currentTarget || e.target;
	const sortTableId = target.getAttribute("sort-table");
	const sortPart = parseInt(target.getAttribute("sort-part") || "0", 10);
	const sortDir = parseInt(target.getAttribute("sort-dir") || "0", 10);
	const table = document.getElementById(sortTableId);
	if (!table) return;
	const rows = Array.from(table.children).slice(1);
	const prepared = rows.map(row => {
		const parts = String(row.getAttribute("sort-data") || "").split(" ");
		const val = parseFloat(parts[sortPart]) || 0;
		return { row, value: val };
	});
	prepared.sort((a, b) => sortDir === 0 ? a.value - b.value : b.value - a.value);
	const frag = document.createDocumentFragment();
	prepared.forEach(p => frag.appendChild(p.row));
	table.appendChild(frag);
}

const buildReport = (data) => {
	lastReportData = data;
	const { params = {}, marketplace = "", totalItems = 0, items = {}, elapsedTime = 0, timestamp = Date.now(), error = "" } = lastReportData || {};
	elements.rQuery.textContent = params.query ?? "";
	elements.rLimit.textContent = params.limit ?? "";
	elements.rMP.textContent = marketplace === "wb" ? "Wildberries" : "Ozon";
	elements.rTotalItems.textContent = totalItems;
	elements.rElapsed.textContent = `${elapsedTime} ms`;
	elements.rTime.textContent = new Date(timestamp).toLocaleString();
	elements.rError.textContent = error || "";

	if (totalItems === 0) {
		if (error) elements.tryAgainBtn.hidden = false;
		return;
	}

	elements.actionBlock.style.display = "block";
	const table = elements.reportTable;
	table.hidden = false;
	table.innerHTML = "";
	table.appendChild(createHeaderRow(TABLE_HEADERS.report));

	Object.values(items).forEach(item => {
		const row = el("tr", {}, [
			createCell(createImage(item.image)),
			createCell(item.id),
			createCell(createLink(item.url, item.name), { style: { maxWidth: "800px", wordWrap: "break-word" } }),
			createCell(item.price),
			createCell(item.rating),
			createCell(item.reviews)
		]);
		row.setAttribute("sort-data", `${item.price ?? 0} ${item.reviews ?? 0}`);
		table.appendChild(row);
	});
};

const buildTableOfChanges = (items) => {
	if (!Array.isArray(items) || items.length === 0) return;
	elements.tableOfChangesBlock.hidden = false;
	const table = elements.tableOfChanges;
	if (table.childElementCount === 0) table.appendChild(createHeaderRow(TABLE_HEADERS.changes));
	const before = changesCount;
	items.forEach(item => {
		const diffColor = item.diff > 0 ? PRICE_DIFF_COLORS.positive : PRICE_DIFF_COLORS.negative;
		const row = el("tr", {}, [
			createCell(createImage(item.image)),
			createCell(item.id),
			createCell(createLink(item.url, item.name), { style: { maxWidth: "800px", wordWrap: "break-word" } }),
			createCell(item.oldPrice),
			createCell(item.price),
			createCell(`${item.diff}%`, { style: { color: diffColor } }),
			createCell(item.rating),
			createCell(item.reviews)
		]);
		row.setAttribute("sort-data", `${item.price ?? 0} ${item.diff ?? 0} ${item.reviews ?? 0}`);
		table.appendChild(row);
		changesCount++;
	});
	elements.changesCountTxt.textContent = `(${changesCount})`;
	const diff = changesCount - before;
	elements.changesDiffCountTxt.textContent = diff > 0 ? `+${diff}` : "";
};

const updateReport = () => {
	if (!lastReportData) return;
	elements.loadUpdateStatus.hidden = false;
	try {
		chrome.runtime.sendMessage({
			action: "parseCatalog",
			data: {
				query: lastReportData.params.query,
				limit: lastReportData.params.limit,
				open: false,
				return: true,
				active: false
			}
		}, (response) => {
			elements.loadUpdateStatus.hidden = true;
			if (!response) return;
			if (lastReportData) {
				Object.values(lastReportData.items || {}).forEach(({ id, price }) => {
					pricesStore[id] = price;
				});
				const changedItems = Object.entries(response.items || {})
					.map(([key, item]) => {
						const oldPrice = pricesStore[key];
						if (!oldPrice || oldPrice <= 0 || item.price <= 0 || item.price === oldPrice) return null;
						const diff = +(((item.price - oldPrice) / oldPrice) * 100).toFixed(1);
						return { ...item, oldPrice, diff };
					})
					.filter(Boolean);
				buildTableOfChanges(changedItems);
			}
			buildReport(response);
		});
	} catch (e) {
		elements.loadUpdateStatus.hidden = true;
		console.error(e);
	}
};

const setupEventListeners = () => {
	elements.exportCsvBtn.addEventListener("click", saveReportAsCsv);

	elements.copyCsvBtn.addEventListener("click", () => {
		if (!lastReportData) return;
		const includeHeader = elements.headersCheckbox.checked;
		const items = getLastReportDataItemsForExport();
		const content = jsonToCsv(items, { includeHeader });
		navigator.clipboard?.writeText(content).catch(err => console.error("Не удалось скопировать CSV:", err));
	});

	elements.tryAgainBtn.addEventListener("click", () => {
		elements.tryAgainBtn.hidden = true;
		updateReport();
		chrome.tabs.getCurrent?.(tab => { if (tab) chrome.tabs.update(tab.id, { active: true }); });
	});

	elements.updateBtn.addEventListener("click", () => {
		elements.updateBtn.disabled = true;
		setTimeout(() => (elements.updateBtn.disabled = false), 1000);
		updateReport();
		chrome.tabs.getCurrent?.(tab => { if (tab) chrome.tabs.update(tab.id, { active: true }); });
	});

	elements.clearTableBtn.addEventListener("click", () => {
		elements.tableOfChangesBlock.hidden = true;
		elements.tableOfChanges.innerHTML = "";
		elements.changesCountTxt.innerHTML = "";
		elements.changesDiffCountTxt.innerHTML = "";
		changesCount = 0;
	});

	elements.tableExportDataDropBtn.addEventListener("click", () => {
		elements.tableExportDataOptions.hidden = !elements.tableExportDataOptions.hidden;
	});

	elements.imageDisplay.addEventListener("click", () => {
		elements.imageDisplay.classList.remove("visible");
		elements.imageDisplayImg.src = "";
	});

	document.addEventListener("click", function (event) {
		if (event.target.tagName === "IMG" && event.target.id !== "titelLogo") {
			elements.imageDisplay.classList.add("visible");
			elements.imageDisplayImg.src = event.target.src;
		}

		if (!elements.tableExportDataOptions.hidden) {
			if (event.target.id !== tableExportDataDropBtn.id) {
				if (!elements.tableExportDataOptions.contains(event.target)) {
					elements.tableExportDataOptions.hidden = true;
				}
			}
		}
	});
};

document.addEventListener("DOMContentLoaded", () => {
	Object.assign(elements, {
		reportTable: document.getElementById("reportTable"),
		tryAgainBtn: document.getElementById("tryAgainBtn"),
		updateBtn: document.getElementById("updateBtn"),
		exportCsvBtn: document.getElementById("exportCsvBtn"),
		copyCsvBtn: document.getElementById("copyCsvBtn"),
		clearTableBtn: document.getElementById("clearTableOfChanges"),
		headersCheckbox: document.getElementById("headersCheckbox"),
		loadUpdateStatus: document.getElementById("loadUpdateStatus"),
		tableOfChangesBlock: document.getElementById("tableOfChangesBlock"),
		tableOfChanges: document.getElementById("tableOfChanges"),
		changesCountTxt: document.getElementById("changesCountTxt"),
		changesDiffCountTxt: document.getElementById("changesDiffCountTxt"),
		actionBlock: document.getElementById("actionBlock"),
		rQuery: document.getElementById("rQuery"),
		rLimit: document.getElementById("rLimit"),
		rMP: document.getElementById("rMP"),
		rTotalItems: document.getElementById("rTotalItems"),
		rElapsed: document.getElementById("rElapsed"),
		rTime: document.getElementById("rTime"),
		rError: document.getElementById("rError"),
		tableExportDataDropBtn: document.getElementById("tableExportDataDropBtn"),
		tableExportDataOptions: document.getElementById("tableExportDataOptions"),
		imageDisplay: document.getElementById('imageDisplay'),
		imageDisplayImg: document.getElementById('imageDisplayImg'),
	});

	reportId = Math.random().toString(36).slice(-4);
	document.title = `${reportId} Отчет`;
	document.getElementById("reportTitelId").textContent = `(${reportId})`;

	setupEventListeners();

	chrome.runtime.onMessage.addListener((msg) => {
		if (msg && msg.action === "renderReport") buildReport(msg.data);
	});
});
