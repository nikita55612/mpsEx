import Parser from "./parser.js";

async function renderReport(result) {
	const tab = await chrome.tabs.create({
		url: chrome.runtime.getURL('report.html')
	});

	chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
		if (tabId === tab.id && info.status === 'complete') {
			chrome.tabs.onUpdated.removeListener(listener);
			chrome.tabs.sendMessage(tab.id, { action: 'renderReport', data: result });
		}
	});
}

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
	switch (msg?.action) {
		case "parseCatalog":
			Parser.parse(msg.data.query, msg.data.limit).then((result) => {
				if (msg.data.return) {
					sendResponse(result);
				} else {
					sendResponse(undefined);
				}
				if (msg.data.open) {
					renderReport(result);
				}
			});
			return true;
		default:
	}
});

const SUPPORTED_SITES = [
	"https://www.ozon.ru/",
	"https://www.wildberries.ru/"
];

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status !== "complete") return;

	const isSupported = SUPPORTED_SITES.some(site => tab.url?.startsWith(site));
	if (!isSupported) return;

	const tabUrl = new URL(tab.url);
	const pathArray = tabUrl.pathname.split("/");
	if (pathArray.length <= 1) return;

	if (pathArray[0] === "product") {
		return;
	} else if (pathArray.slice(-1) === "detail.aspx") {
		return;
	}

	chrome.scripting.executeScript({
		target: { tabId },
		files: ["integration.js"]
	}).catch(error => {
		console.warn("Injection failed:", error);
	});
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
	console.log(reason);
	if (reason === 'install') {
		chrome.tabs.create({ url: "./docs.html" });
	}
});
