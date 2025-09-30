let reportId = "";
let changesCount = 0;
let lastReportData = null;
const pricesStore = {};

const CSV_FILE_TYPE = "text/csv;charset=utf-8;";
const CSV_BOM = "\uFEFF";
const DEFAULT_FILENAME = "data";
const PRICE_DIFF_COLORS = {
	positive: "green",
	negative: "red",
};

const TABLE_HEADERS = {
	report: ["image", "id", "name", ["price", "reportTable", 0, 0], "rating", ["reviews", "reportTable", 1, 1]],
	changes: ["image", "id", "name", "oldPrice", ["price", "tableOfChanges", 0, 0], ["diff", "tableOfChanges", 1, 0], "rating", ["reviews", "tableOfChanges", 2, 1]],
};

const elements = {};

const escapeCsvValue = (value) => {
	if (value == null) return "";
	const str = String(value);
	return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const jsonToCsv = (data, { headers = null, delimiter = ",", includeHeader = true } = {}) => {
	if (!Array.isArray(data) || data.length === 0) return "";

	const keys = headers || [...new Set(data.flatMap(Object.keys))];
	const rows = [];

	if (includeHeader) {
		rows.push(keys.map(escapeCsvValue).join(delimiter));
	}

	rows.push(...data.map((item) => keys.map((key) => escapeCsvValue(item[key])).join(delimiter)));

	return rows.join("\n");
};

const exportCsv = async (csvContent, filename = DEFAULT_FILENAME) => {
	try {
		const blob = new Blob([CSV_BOM + csvContent], { type: CSV_FILE_TYPE });
		const url = URL.createObjectURL(blob);

		const link = Object.assign(document.createElement("a"), {
			href: url,
			download: `${filename}.csv`,
		});
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		setTimeout(() => URL.revokeObjectURL(url), 100);
	} catch (err) {
		console.error("Ошибка при сохранении CSV:", err);
	}
};

const createCell = (content, options = {}) => {
	const td = document.createElement("td");

	if (typeof content === "string" || typeof content === "number") {
		td.textContent = content;
	} else if (content instanceof HTMLElement) {
		td.appendChild(content);
	}

	if (options.style) Object.assign(td.style, options.style);

	return td;
};

const sortTable = (e) => {
	const element = e.target;
	if (!element) return;

	const sortTableId = element.getAttribute("sort-table");
	const sortPart = parseInt(element.getAttribute("sort-part"), 10);
	const sortDir = parseInt(element.getAttribute("sort-dir"), 10);

	const table = document.getElementById(sortTableId);
	const rows = Array.from(table.children).slice(1);

	const prepared = rows.map(row => ({
		row,
		value: parseFloat(row.getAttribute("sort-data").split(" ")[sortPart])
	}));

	prepared.sort((a, b) => sortDir == 0 ? a.value - b.value : b.value - a.value);

	const frag = document.createDocumentFragment();
	prepared.forEach(({ row }) => frag.appendChild(row));
	table.appendChild(frag);
};

const createHeaderRow = (columns) => {
	const row = document.createElement("tr");
	columns.forEach((col) => {
		const th = document.createElement("th");
		if (typeof col === "object") {
			th.textContent = col[0];
			th.setAttribute("sort-table", col[1]);
			th.setAttribute("sort-part", col[2]);
			th.setAttribute("sort-dir", col[3]);
			th.style.cursor = "pointer";
			th.style.color = "blue";
			th.style.textDecoration = "underline";
			th.addEventListener("click", (e) => {
				sortTable(e);
			});
		} else {
			th.textContent = col;
		}
		row.appendChild(th);
	});
	return row;
};

const createImage = (src, width = 52) => {
	const img = document.createElement("img");
	Object.assign(img, { src, width, loading: "lazy" });
	return img;
};

const createLink = (url, text) => {
	const a = document.createElement("a");
	Object.assign(a, { href: url, textContent: text, target: "_blank" });
	return a;
};

const saveReportAsCsv = () => {
	if (!lastReportData) return;

	try {
		const headersCheckbox = elements.headersCheckbox.checked;
		const items = Object.values(lastReportData.items);
		const firstId = items[0]?.id || 0;
		const filename = `${reportId}_${lastReportData.marketplace}_${firstId}_${lastReportData.totalItems}`;
		const content = jsonToCsv(items, { includeHeader: headersCheckbox });
		exportCsv(content, filename);
	} catch (err) {
		console.error("Ошибка при сохранении отчёта в CSV:", err);
	}
};

const buildReport = (data) => {
	lastReportData = data;

	const {
		params,
		marketplace,
		totalItems,
		items,
		elapsedTime,
		timestamp,
		error
	} = lastReportData;

	const rTime = new Date(timestamp);

	elements.rQuery.textContent = params.query;
	elements.rLimit.textContent = params.limit;
	elements.rMP.textContent = marketplace === "wb" ? "Wildberries" : "Ozon";
	elements.rTotalItems.textContent = totalItems;
	elements.rElapsed.textContent = `${elapsedTime} ms`;
	elements.rTime.textContent = rTime.toLocaleString();
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

	Object.values(items).forEach((item) => {
		const row = document.createElement("tr");
		row.setAttribute("sort-data", `${item.price} ${item.reviews}`);
		row.appendChild(createCell(createImage(item.image)));
		row.appendChild(createCell(item.id));
		row.appendChild(createCell(createLink(item.url, item.name), { style: { maxWidth: "800px", wordWrap: "break-word" } }));
		row.appendChild(createCell(item.price));
		row.appendChild(createCell(item.rating));
		row.appendChild(createCell(item.reviews));
		table.appendChild(row);
	});
};

const buildTableOfChanges = (items) => {
	if (items.length === 0) return;

	elements.tableOfChangesBlock.hidden = false;
	const table = elements.tableOfChanges;

	if (table.childElementCount === 0) {
		table.appendChild(createHeaderRow(TABLE_HEADERS.changes));
	}

	const oldChangesCount = changesCount;

	items.forEach((item) => {
		const row = document.createElement("tr");
		row.setAttribute("sort-data", `${item.price} ${item.diff} ${item.reviews}`);
		row.appendChild(createCell(createImage(item.image)));
		row.appendChild(createCell(item.id));
		row.appendChild(createCell(createLink(item.url, item.name), { style: { maxWidth: "800px", wordWrap: "break-word" } }));
		row.appendChild(createCell(item.oldPrice));
		row.appendChild(createCell(item.price));
		row.appendChild(
			createCell(`${item.diff}%`, {
				style: { color: item.diff > 0 ? PRICE_DIFF_COLORS.positive : PRICE_DIFF_COLORS.negative },
			})
		);
		row.appendChild(createCell(item.rating));
		row.appendChild(createCell(item.reviews));

		table.appendChild(row);
		changesCount++;
	});

	elements.changesCountTxt.textContent = `(${changesCount})`;
	const changesDiffCount = changesCount - oldChangesCount;
	if (changesDiffCount > 0) {
		elements.changesDiffCountTxt.textContent = `+${changesDiffCount}`;
	} else {
		elements.changesDiffCountTxt.textContent = "";
	}
};

const updateReport = () => {
	if (!lastReportData) return;

	elements.loadUpdateStatus.hidden = false;

	chrome.runtime.sendMessage(
		{
			action: "parseCatalog",
			data: {
				query: lastReportData.params.query,
				limit: lastReportData.params.limit,
				open: false,
				return: true,
				active: false
			},
		},
		(response) => {
			elements.loadUpdateStatus.hidden = true;

			if (lastReportData) {
				Object.values(lastReportData.items).forEach(({ id, price }) => {
					pricesStore[id] = price;
				});

				const changedItems = Object.entries(response.items)
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
		}
	);
};

const setupEventListeners = () => {
	elements.exportCsvBtn.addEventListener("click", saveReportAsCsv);

	elements.copyCsvBtn.addEventListener("click", () => {
		if (!lastReportData) return;
		const headersCheckbox = elements.headersCheckbox.checked;
		const content = jsonToCsv(Object.values(lastReportData.items), { includeHeader: headersCheckbox });
		try {
			navigator.clipboard.writeText(content);
		} catch (err) {
			console.error("Не удалось скопировать CSV:", err);
		}
	});

	elements.tryAgainBtn.addEventListener("click", () => {
		elements.tryAgainBtn.hidden = true;
		updateReport();
		const currTab = chrome.tabs.getCurrent();
		if (currTab) {
			chrome.tabs.update(currTab.id, { active: true });
		}
	});

	elements.updateBtn.addEventListener("click", () => {
		elements.updateBtn.disabled = true;
		setTimeout(() => (elements.updateBtn.disabled = false), 1000);
		updateReport();
		const currTab = chrome.tabs.getCurrent();
		if (currTab) {
			chrome.tabs.update(currTab.id, { active: true });
		}
	});

	elements.clearTableBtn.addEventListener("click", () => {
		elements.tableOfChangesBlock.hidden = true;
		elements.tableOfChanges.innerHTML = "";
		elements.changesCountTxt.innerHTML = "";
		elements.changesDiffCountTxt.innerHTML = "";
		changesCount = 0;
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

	});

	reportId = Math.random().toString(36).slice(-4);
	document.title = `${reportId} Отчет`;
	document.getElementById("reportTitelId").textContent = `(${reportId})`;

	setupEventListeners();

	chrome.runtime.onMessage.addListener((msg) => {
		if (msg.action === "renderReport") {
			buildReport(msg.data);
		}
	});
});
