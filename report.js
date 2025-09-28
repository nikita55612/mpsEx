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

/**
 * Экранирует значение для CSV
 */
const escapeCsvValue = (value) => {
	if (value == null) return "";
	const str = String(value);
	return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/**
 * Конвертирует JSON-массив в CSV-строку
 */
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

/**
 * Скачивание CSV файла
 */
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

/**
 * Создаёт ячейку таблицы (td)
 */
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

/**
 * Создаёт строку таблицы с заголовками
 */
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

/**
 * Создаёт HTML-элемент изображения
 */
const createImage = (src, width = 52) => {
	const img = document.createElement("img");
	Object.assign(img, { src, width, loading: "lazy" });
	return img;
};

/**
 * Создаёт ссылку
 */
const createLink = (url, text) => {
	const a = document.createElement("a");
	Object.assign(a, { href: url, textContent: text, target: "_blank" });
	return a;
};

/**
 * Сохраняет текущий отчёт в CSV
 */
const saveReportAsCsv = () => {
	if (!lastReportData) return;

	try {
		const headersCheckbox = document.getElementById("headersCheckbox").checked;
		const items = Object.values(lastReportData.data.items);
		const firstId = items[0]?.id || 0;
		const filename = `${reportId}_${lastReportData.marketplace}_${firstId}_${lastReportData.data.totalItems}`;
		const content = jsonToCsv(items, { includeHeader: headersCheckbox });
		exportCsv(content, filename);
	} catch (err) {
		console.error("Ошибка при сохранении отчёта в CSV:", err);
	}
};

/**
 * Строит таблицу с основным отчётом
 */
const buildReport = (data) => {
	lastReportData = data;

	const { params, data: reportData, marketplace, elapsedTime, timestamp, error } = lastReportData;

	const rTime = new Date(timestamp);

	document.getElementById("rQuery").textContent = params.query;
	document.getElementById("rLimit").textContent = params.limit;
	document.getElementById("rMP").textContent = marketplace === "wb" ? "Wildberries" : "Ozon";
	document.getElementById("rTotalItems").textContent = reportData.totalItems;
	document.getElementById("rElapsed").textContent = `${elapsedTime} ms`;
	document.getElementById("rTime").textContent = rTime.toLocaleString();
	document.getElementById("rError").textContent = error || "";

	if (reportData.totalItems === 0) {
		if (error) document.getElementById("tryAgainBtn").hidden = false;
		return;
	}

	document.getElementById("actionBlock").style.display = "block";

	const table = document.getElementById("reportTable");
	table.hidden = false;
	table.innerHTML = "";
	table.appendChild(createHeaderRow(TABLE_HEADERS.report));

	Object.values(reportData.items).forEach((item) => {
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

/**
 * Строит таблицу изменений цен
 */
const buildTableOfChanges = (items) => {
	if (items.length === 0) return;

	document.getElementById("tableOfChangesBlock").hidden = false;
	const table = document.getElementById("tableOfChanges");

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

	document.getElementById("changesCountTxt").textContent = `(${changesCount})`;
	const changesDiffCount = changesCount - oldChangesCount;
	if (changesDiffCount > 0) {
		document.getElementById("changesDiffCountTxt").textContent = `+${changesDiffCount}`;
	} else {
		document.getElementById("changesDiffCountTxt").textContent = "";
	}
};

/**
 * Обновляет отчёт, проверяет изменения цен
 */
const updateReport = () => {
	if (!lastReportData) return;

	const loadUpdateStatus = document.getElementById("loadUpdateStatus");
	loadUpdateStatus.hidden = false;

	chrome.runtime.sendMessage(
		{
			action: "parseCatalog",
			data: {
				query: lastReportData.params.query,
				limit: lastReportData.params.limit,
				open: false,
				return: true,
			},
		},
		(response) => {
			loadUpdateStatus.hidden = true;

			if (lastReportData) {
				Object.values(lastReportData.data.items).forEach(({ id, price }) => {
					pricesStore[id] = price;
				});

				const changedItems = Object.entries(response.data.items)
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

/**
 * Настраивает обработчики событий
 */
const setupEventListeners = () => {
	const tryAgainBtn = document.getElementById("tryAgainBtn");
	const updateBtn = document.getElementById("updateBtn");
	const exportCsvBtn = document.getElementById("exportCsvBtn");
	const copyCsvBtn = document.getElementById("copyCsvBtn");
	const clearTableBtn = document.getElementById("clearTableOfChanges");

	exportCsvBtn.addEventListener("click", saveReportAsCsv);

	copyCsvBtn.addEventListener("click", () => {
		if (!lastReportData) return;
		const headersCheckbox = document.getElementById("headersCheckbox").checked;
		const content = jsonToCsv(Object.values(lastReportData.data.items), { includeHeader: headersCheckbox });
		try {
			navigator.clipboard.writeText(content);
		} catch (err) {
			console.error("Не удалось скопировать CSV:", err);
		}
	});

	tryAgainBtn.addEventListener("click", () => {
		tryAgainBtn.hidden = true;
		updateReport();
		const currTab = chrome.tabs.getCurrent();
		if (currTab) {
			chrome.tabs.update(currTab.id, { active: true });
		}
	});

	updateBtn.addEventListener("click", () => {
		updateBtn.disabled = true;
		setTimeout(() => (updateBtn.disabled = false), 1000);
		updateReport();
		const currTab = chrome.tabs.getCurrent();
		if (currTab) {
			chrome.tabs.update(currTab.id, { active: true });
		}
	});

	clearTableBtn.addEventListener("click", () => {
		document.getElementById("tableOfChangesBlock").hidden = true;
		document.getElementById("tableOfChanges").innerHTML = "";
		document.getElementById("changesCountTxt").innerHTML = "";
		document.getElementById("changesDiffCountTxt").innerHTML = "";
		changesCount = 0;
	});
};

document.addEventListener("DOMContentLoaded", () => {
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
