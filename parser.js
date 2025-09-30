
const OZON_API_ENTRYPOINT = "https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2";
const WB_CATALOG_URL_PATTERNS = [
	"*://u-catalog.wb.ru/*/catalog*",
	"*://catalog.wb.ru/*/catalog*",
	"*://u-search.wb.ru/*/search*",
	"*://search.wb.ru/*/search*",
];
const DEFAULT_TIMEOUT = 10000;


async function openTabWithTimeout(url, timeout = DEFAULT_TIMEOUT, options = { active: false }) {
	try {
		const tab = await chrome.tabs.create({ url, active: options.active });

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				chrome.tabs.onUpdated.removeListener(listener);
				reject(new Error(`Время ожидания загрузки страницы (${timeout}ms) истекло`));
			}, timeout);

			const listener = (tabId, changeInfo) => {
				if (tabId === tab.id && changeInfo.status === "complete") {
					clearTimeout(timeoutId);
					chrome.tabs.onUpdated.removeListener(listener);
					resolve(tab);
				}
			};

			chrome.tabs.onUpdated.addListener(listener);
		});
	} catch (error) {
		throw new Error(`Ошибка при открытии вкладки: ${error.message}`);
	}
}

function parsePrice(priceText) {
	if (!priceText || typeof priceText !== 'string') return null;

	const cleaned = priceText.replace(/[ \s₽]/g, '');
	const price = parseInt(cleaned, 10);

	return isNaN(price) || price <= 0 ? null : price;
}

function parseOzonProduct(item) {
	try {
		const sku = item?.sku;
		if (!sku) return null;

		const productData = {
			id: sku,
			name: '',
			price: 0,
			rating: 0,
			reviews: 0,
			url: `https://www.ozon.ru/product/${sku}`,
			image: ''
		};

		const mainState = item?.mainState || [];
		const images = item?.tileImage?.items || [];

		const prices = [];

		for (const state of mainState) {
			switch (state.type) {
				case 'priceV2':
					if (Array.isArray(state.priceV2?.price)) {
						for (const priceItem of state.priceV2.price) {
							const parsedPrice = parsePrice(priceItem.text);
							if (parsedPrice) prices.push(parsedPrice);
						}
					}
					break;

				case 'textAtom':
					if (state.id === 'name' && state.textAtom?.text) {
						productData.name = state.textAtom.text.trim();
					}
					break;

				case 'labelList':
					const labelItems = state.labelList?.items || [];
					for (const labelItem of labelItems) {
						const automationId = labelItem.testInfo?.automatizationId;

						if (automationId === 'tile-list-rating' && labelItem.title) {
							productData.rating = parseFloat(labelItem.title.trim()) || 0;
						} else if (automationId === 'tile-list-comments' && labelItem.title) {
							const reviewsText = labelItem.title.split(' ')[0]?.replace(/[ ]/g, '');
							productData.reviews = parseInt(reviewsText, 10) || 0;
						}
					}
					break;
			}

			if (nameFound && ratingFound && reviewsFound && prices.length > 0) break;
		}

		productData.price = prices.length > 0 ? Math.min(...prices) : 0;

		const mainImage = images.find(img => img.type === 'image');
		productData.image = mainImage?.image?.link || '';

		if (!productData.name && productData.price === 0) {
			return null;
		}

		return [sku, productData];

	} catch (error) {
		console.warn('Ошибка парсинга товара Ozon:', error);
		return null;
	}
}

function parseOzonCatalogContent(rawJson) {
	const response = {
		data: { items: new Map() },
		nextPage: null,
		error: null,
		totalItems: 0,
	};

	try {
		const json = JSON.parse(rawJson);
		response.nextPage = json?.nextPage || null;

		const widgetStates = json?.widgetStates;
		if (!widgetStates || typeof widgetStates !== 'object') {
			response.error = 'Отсутствует или некорректно поле widgetStates';
			return response;
		}

		for (const [widgetKey, widgetValue] of Object.entries(widgetStates)) {
			if (typeof widgetValue !== 'string') continue;

			try {
				if (widgetKey.startsWith('infiniteVirtualPaginator-')) {
					const widgetData = JSON.parse(widgetValue);
					if (!widgetData?.nextPage) {
						continue;
					}
					response.nextPage = widgetData.nextPage;
				}
				if (widgetKey.startsWith('megaPaginator-')) {
					const widgetData = JSON.parse(widgetValue);
					if (!widgetData?.nextPage) {
						continue;
					}
					response.nextPage = widgetData.nextPage;
				}

				if (widgetKey.startsWith('tileGridDesktop-')) {
					const widgetData = JSON.parse(widgetValue);
					if (!Array.isArray(widgetData?.items)) {
						continue;
					}

					for (const item of widgetData.items) {
						response.totalItems++;

						const parseResult = parseOzonProduct(item);
						if (parseResult) {
							const [productId, productData] = parseResult;
							response.data.items.set(productId, productData);
						}
					}
				}
			} catch (parseError) {
				console.warn(`Ошибка парсинга виджета ${widgetKey}:`, parseError);
				continue;
			}
		}

		if (response.totalItems === 0) {
			response.error = 'Не найдено данных товаров в ответе';
		}

	} catch (error) {
		response.error = `Ошибка парсинка JSON контента: ${error.message}`;
	}

	return response;
}

async function parseOzonCatalog(result, initialUrl, limit = 0) {
	const startTime = Date.now();
	let currentUrl = initialUrl;

	try {
		while (true) {
			const tab = await openTabWithTimeout(currentUrl);

			const [scriptResult] = await chrome.scripting.executeScript({
				target: { tabId: tab.id },
				func: () => document.documentElement.textContent,
			});

			await chrome.tabs.remove(tab.id);

			const rawJson = scriptResult?.result;
			if (!rawJson) {
				result.error = 'Не удалось получить данные со страницы Ozon';
				break;
			}

			const parsedData = parseOzonCatalogContent(rawJson);

			if (parsedData.error) {
				result.error = parsedData.error;
				break;
			}

			for (const [productId, productData] of parsedData.data.items) {
				result.data.items.set(productId, productData);
			}

			if (limit > 0 && result.data.items.size >= limit) {
				break;
			}

			if (!parsedData.nextPage) {
				break;
			}

			currentUrl = `${OZON_API_ENTRYPOINT}?url=${parsedData.nextPage}`;
		}
	} catch (error) {
		result.error = `Ошибка парсинга каталога Ozon: ${error.message}`;
	}

	result.data.totalItems = result.data.items.size;
	result.elapsedTime = Date.now() - startTime;
	result.timestamp = startTime + result.elapsedTime;
	result.data.items = Object.fromEntries(result.data.items);

	return result;
}

function getWbImage(id) {
	try {
		if (!id || typeof id !== 'number') return "";

		const idStr = id.toString();
		const length = idStr.length;

		let vol, part;

		if (length === 9) {
			vol = idStr.substring(0, 4);
			part = idStr.substring(0, 6);
		} else if (length === 8) {
			vol = idStr.substring(0, 3);
			part = idStr.substring(0, 5);
		} else if (length === 7) {
			vol = idStr.substring(0, 2);
			part = idStr.substring(0, 4);
		} else if (length === 6) {
			vol = idStr.substring(0, 2);
			part = idStr.substring(0, 4);
		} else {
			vol = idStr.substring(0, Math.min(4, length));
			part = idStr.substring(0, Math.min(6, length));
		}

		const n = Math.floor(id / 100000);

		let basket;
		if (n <= 143) basket = "01";
		else if (n <= 287) basket = "02";
		else if (n <= 431) basket = "03";
		else if (n <= 719) basket = "04";
		else if (n <= 1007) basket = "05";
		else if (n <= 1061) basket = "06";
		else if (n <= 1115) basket = "07";
		else if (n <= 1169) basket = "08";
		else if (n <= 1313) basket = "09";
		else if (n <= 1601) basket = "10";
		else if (n <= 1655) basket = "11";
		else if (n <= 1919) basket = "12";
		else if (n <= 2045) basket = "13";
		else if (n <= 2189) basket = "14";
		else if (n <= 2405) basket = "15";
		else if (n <= 2621) basket = "16";
		else if (n <= 2837) basket = "17";
		else if (n <= 3053) basket = "18";
		else if (n <= 3269) basket = "19";
		else if (n <= 3485) basket = "20";
		else if (n <= 3701) basket = "21";
		else if (n <= 3917) basket = "22";
		else if (n <= 4133) basket = "23";
		else if (n <= 4349) basket = "24";
		else if (n <= 4565) basket = "25";
		else if (n <= 4877) basket = "26";
		else if (n <= 5189) basket = "27";
		else if (n <= 5501) basket = "28";
		else if (n <= 5813) basket = "29";
		else if (n <= 6125) basket = "30";
		else if (n <= 6437) basket = "31";
		else basket = "32";

		return `https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${id}/images/c516x688/1.webp`;

	} catch (_) {
		return "";
	}
}

async function parseWbCatalogContent(rawJson) {
	const response = {
		data: { items: new Map },
		nextPage: null,
		error: null,
	};

	try {
		const json = JSON.parse(rawJson);
		response.nextPage = json?.nextPage || null;

		const products = json?.products;
		if (!products) {
			response.error = "Отсутствует поле products";
			return response;
		}

		for (const product of products) {
			const id = product?.id || null;
			const price = product?.sizes[0]?.price?.product || 0;

			const image = getWbImage(id);

			response.data.items.set(id, {
				id,
				name: product?.name || "",
				price: price / 100,
				rating: product?.reviewRating || 0,
				reviews: product?.feedbacks || 0,
				url: `https://www.wildberries.ru/catalog/${id}/detail.aspx`,
				image
			});
		}
	} catch (error) {
		response.error = `Ошибка при разборе JSON: ${error.message}`;
	}

	return response;
}

async function parseWildberriesCatalog(result, url, limit = 0) {
	const startTime = Date.now();

	try {

		// const urlObject = new URL(url);
		// let page = urlObject.searchParams.get("page");

		// if (!rawJson) {
		// 		result.error = "Не удалось получить JSON со страницы каталога";
		// 		break;
		// 	}

		while (true) {
			const tab = await openTabWithTimeout(url);

			const [scriptResult] = await chrome.scripting.executeScript({
				target: { tabId: tab.id },
				func: () => document.documentElement.textContent,
			});

			await chrome.tabs.remove(tab.id);

			const rawJson = scriptResult?.result;
			if (!rawJson) {
				result.error = "Не удалось получить JSON со страницы каталога";
				break;
			}

			const parsedData = await parseWbCatalogContent(rawJson);
			if (parsedData.error) {
				result.error = parsedData.error;
				break;
			}

			if (parsedData.data.items.size === 0) {
				break;
			}

			for (const [productId, productData] of parsedData.data.items) {
				result.data.items.set(productId, productData);
			}

			if (limit > 0 && result.data.items.size >= limit) {
				break;
			}

			if (result.data.items.size > 20000) {
				break;
			}

			const urlObject = new URL(url);
			const currentPage = urlObject.searchParams.get("page");

			if (currentPage !== null) {
				const nextPage = parseInt(currentPage) + 1;
				urlObject.searchParams.set("page", nextPage.toString());
				url = urlObject.toString();
			} else {
				break;
			}
		}
	} catch (error) {
		result.error = `Ошибка парсинга каталога: ${error.message}`;
	}

	result.data.totalItems = result.data.items.size;
	result.elapsedTime = Date.now() - startTime;
	result.timestamp = startTime + result.elapsedTime;
	result.data.items = Object.fromEntries(result.data.items);

	return result;
}

async function detectWildberriesCatalogUrl(queryUrl, timeout = DEFAULT_TIMEOUT) {
	let tabId = null;

	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			cleanup();
			reject(new Error("Таймаут обнаружения URL каталога Wildberries"));
		}, timeout);

		const cleanup = () => {
			chrome.webRequest.onBeforeRequest.removeListener(requestListener);
			clearTimeout(timeoutId);
			if (tabId) chrome.tabs.remove(tabId);
		};

		const requestListener = (details) => {
			cleanup();
			resolve(details.url);
		};

		chrome.webRequest.onBeforeRequest.addListener(
			requestListener,
			{ urls: WB_CATALOG_URL_PATTERNS }
		);

		openTabWithTimeout(queryUrl.toString())
			.then(tab => {
				tabId = tab.id;
			})
			.catch(error => {
				cleanup();
				reject(new Error(`Ошибка открытия вкладки: ${error.message}`));
			});
	});
}

async function parseProductCatalog(query, limit = 0) {
	query = query.trim();

	const result = {
		data: {
			items: new Map(),
			totalItems: 0
		},
		params: {
			query,
			limit
		},
		elapsedTime: 0,
		marketplace: "oz",
		error: null,
	};

	try {
		const querys = [...new Set(query.split(","))];

		if (querys.length > 1) {
			result.data.items = {};
			let nextRes;
			for (const q of querys) {
				nextRes = await parseProductCatalog(q.trim(), limit);
				result.elapsedTime += nextRes.elapsedTime;
				result.data.totalItems += nextRes.data.totalItems;
				result.data.items = Object.assign(result.data.items, nextRes.data.items);
				if (nextRes.error) {
					break;
				}
			}
			result.error = nextRes.error;
			result.marketplace = nextRes.marketplace;
			result.timestamp = nextRes.timestamp;
			return result;
		}

		query = querys[0];

		if (query.startsWith("http")) {
			const queryUrl = new URL(query);

			if (queryUrl.host.includes("ozon.")) {
				const apiUrl = `${OZON_API_ENTRYPOINT}?url=${queryUrl.pathname}${queryUrl.search}`;
				return await parseOzonCatalog(result, apiUrl, limit);

			} else if (queryUrl.host.includes("wildberries.")) {
				result.marketplace = "wb";
				const catalogUrl = await detectWildberriesCatalogUrl(queryUrl);
				return await parseWildberriesCatalog(result, catalogUrl, limit);

			} else {
				result.error = `Неподдерживаемый домен: ${queryUrl.host}`;
				return result;
			}
		} else {
			const apiUrl = `${OZON_API_ENTRYPOINT}?url=${query}`;
			return await parseOzonCatalog(result, apiUrl, limit);
		}
	} catch (error) {
		result.error = `Ошибка обработки запроса: ${error.message}`;
		return result;
	}
}

export default { parse: parseProductCatalog };
