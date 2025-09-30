const OZON_API_ENTRYPOINT = "https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2";
const WB_CATALOG_URL_PATTERNS = [
	"*://u-catalog.wb.ru/*/catalog*",
	"*://catalog.wb.ru/*/catalog*",
	"*://u-search.wb.ru/*/search*",
	"*://search.wb.ru/*/search*",
];
const DEFAULT_TIMEOUT = 12000;

const openTabWithTimeout = async (url, options = { active: false }, timeout = DEFAULT_TIMEOUT) => {
	const tab = await chrome.tabs.create({ url, ...options });

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
};

const extractRawContentDataFromTab = async (url, options = { active: false }, timeout = DEFAULT_TIMEOUT) => {
	let tab;
	try {
		tab = await openTabWithTimeout(url, options, timeout);
	} catch (error) {
		throw new Error(`Не удалось открыть новую вкладку: ${error.message}`);
	}

	let scriptResult;
	try {
		[scriptResult] = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			func: () => document.documentElement.textContent,
		});
	} catch (error) {
		throw new Error(`Не удалось выполнить скрипт на странице: ${error.message}`);
	}

	chrome.tabs.remove(tab.id);

	const rawCocntent = scriptResult?.result;
	if (!rawCocntent) {
		throw new Error("Не удалось извлечь данные со страницы");
	}

	return rawCocntent;
};

const extractJsonDataFromTab = async (url, options = { active: false }, timeout = DEFAULT_TIMEOUT) => {
	const rawCocntent = await extractRawContentDataFromTab(url, options, timeout);
	let json;
	try {
		json = JSON.parse(rawCocntent);
	} catch (error) {
		throw new Error(`Ошибка парсинга JSON контента: ${error.message}`);
	}
	return json;
};

const detectWildberriesCatalogUrl = (url, timeout = DEFAULT_TIMEOUT) => {
	return new Promise((resolve, reject) => {
		let tabId = null;

		const timeoutId = setTimeout(() => {
			cleanup();
			reject(new Error("Таймаут обнаружения URL каталога Wildberries"));
		}, timeout);

		const cleanup = () => {
			chrome.webRequest.onBeforeRequest.removeListener(listener);
			clearTimeout(timeoutId);
			if (tabId) chrome.tabs.remove(tabId);
		};

		const listener = (details) => {
			cleanup();
			resolve(details.url);
		};

		chrome.webRequest.onBeforeRequest.addListener(
			listener,
			{ urls: WB_CATALOG_URL_PATTERNS }
		);

		openTabWithTimeout(url)
			.then(tab => {
				tabId = tab.id;
			})
			.catch(error => {
				cleanup();
				reject(error);
			});
	});
};

const wbProductImageFromId = (id) => {
	let idStr = id;
	if (typeof id === "number") {
		idStr = id.toString();
	}

	const len = idStr.length;
	const vol = idStr.substring(0, len - 5);
	const part = idStr.substring(0, len - 3);

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
}

const parseOzonProductPrice = (str) => {
    const priceString = str.replace(/[^\d,.]/g, '').replace(',', '.');
    const price = parseFloat(priceString);
    return isNaN(price) ? null : price;
}

const newCatalogProductData = () => {
	return {
		id: "",
		name: "",
		price: 0,
		rating: 0,
		reviews: 0,
		url: "",
		image: ""
	};
};

const parseOzonCatalogProduct = (item) => {
	const productData = newCatalogProductData();

	const sku = item?.sku;
	if (typeof sku === "number") {
		productData.id = sku.toString();
	}

	productData.url = `https://www.ozon.ru/product/${sku}`;

	const mainState = item?.mainState;
	const images = item?.tileImage?.items;
	if (Array.isArray(images)) {
		const mainImage = images.find(img => img.type === "image");
		productData.image = mainImage?.image?.link || "";
	}

	if (!Array.isArray(mainState)) {
		return [sku, productData];
	}

	const prices = [];

	mainState.forEach((value) => {
		if (value.type === "priceV2") {
			const priceItems = value.priceV2?.price;

			if (Array.isArray(priceItems)) {
				priceItems.forEach((v) => {
					const price = parseOzonProductPrice(v.text);
					if (price) prices.push(price);
				});
			}

		} else if (value.type === "textAtom") {
			if (value.id === "name" && value.textAtom?.text) {
				productData.name = value.textAtom.text.trim();
			}

		} else if (value.type === "labelList") {
			const labelItems = value.labelList?.items;

			if (Array.isArray(labelItems)) {
				labelItems.forEach((v) => {
					const vId = v.testInfo?.automatizationId;
					if (vId === "tile-list-rating" && v.title) {
						productData.rating = parseFloat(v.title.trim()) || 0;
					} else if (vId === "tile-list-comments" && v.title) {
						const reviewsText = v.title.split(" ")[0]?.replace(/[ ]/g, "");
						productData.reviews = parseInt(reviewsText, 10) || 0;
					}
				});
			}
		}
	});

	productData.price = prices.length > 0 ? Math.min(...prices) : 0;

	return [sku, productData];
}

const parseOzonCatalog = async (result, catalogUrl, limit = 0) => {
	let pageUrl = catalogUrl;
	let nextPage;
	let catalogTotalProducts = 0;

	while (true) {
		let json;
		try {
			json = await extractJsonDataFromTab(pageUrl);
		} catch (error) {
			result.addError(error.message);
			return;
		}

		let pageTotalProducts = 0;
		let hasNextPage = false;

		if (typeof json?.nextPage === "string") {
			hasNextPage = nextPage !== json?.nextPage;
			nextPage = json.nextPage;
		}

		const widgetStates = json?.widgetStates;
		if (!widgetStates || typeof widgetStates !== "object") {
			result.addError("Отсутствует или некорректно поле widgetStates");
			return;
		}

		for (const [key, value] of Object.entries(widgetStates)) {
			if (key.startsWith("infiniteVirtualPaginator-")) {
				const widgetData = JSON.parse(value);

				if (typeof widgetData?.nextPage === "string") {
					hasNextPage = nextPage !== widgetData.nextPage;
					nextPage = widgetData.nextPage;
				}
			}
			if (key.startsWith("megaPaginator-")) {
				const widgetData = JSON.parse(value);

				if (typeof widgetData?.nextPage === "string") {
					hasNextPage = nextPage !== widgetData.nextPage;
					nextPage = widgetData.nextPage;
				}
			}
			if (key.startsWith("tileGridDesktop-")) {
				const widgetData = JSON.parse(value);

				if (!Array.isArray(widgetData?.items)) {
					continue;
				}

				widgetData.items.forEach((item) => {
					const [pId, pD] = parseOzonCatalogProduct(item);
					pageTotalProducts++;
					result.pushItem(pId, pD);
				});
			}
		}

		if (pageTotalProducts === 0) return;
		if (!hasNextPage) return;
		catalogTotalProducts += pageTotalProducts;
		if (limit > 0 && catalogTotalProducts >= limit) return;
		if (catalogTotalProducts > 16000) return;

		pageUrl = `${OZON_API_ENTRYPOINT}?url=${nextPage}`;
	};
};

const parseWbCatalog = async (result, catalogUrl, limit = 0) => {
	const catalogUrlObject = new URL(catalogUrl);
	let pageNum = parseInt(catalogUrlObject.searchParams.get("page")) || 1;
	let pageUrl = catalogUrl;
	let catalogTotalProducts = 0;

	while (true) {
		let json;
		try {
			json = await extractJsonDataFromTab(pageUrl);
		} catch (error) {
			result.addError(error.message);
			return;
		}

		const products = json?.products;
		if (!products || !Array.isArray(products)) {
			result.addError("Отсутствует или некорректно поле products");
			return;
		}

		let pageTotalProducts = 0;

		products.forEach((product) => {
			const productData = newCatalogProductData();
			const productId = product?.id;
			if (typeof productId === "number") {
				productData.id = productId.toString();
			} else if (typeof productId === "string") {
				productData.id = productId;
			}
			productData.name = product?.name || "";
			const price = product?.sizes[0]?.price?.product || 0;
			if (typeof price === "number") {
				productData.price = price / 100;
			}
			productData.rating = product?.reviewRating || 0;
			productData.reviews = product?.feedbacks || 0;
			productData.url = `https://www.wildberries.ru/catalog/${productData.id}/detail.aspx`;
			productData.image = wbProductImageFromId(productData.id);

			pageTotalProducts++;
			result.pushItem(productData.id, productData);
		});

		if (pageTotalProducts === 0) return;
		catalogTotalProducts += pageTotalProducts;
		if (limit > 0 && catalogTotalProducts >= limit) return;
		if (catalogTotalProducts > 16000) return;

		pageNum++;
		catalogUrlObject.searchParams.set("page", pageNum.toString());
		pageUrl = catalogUrlObject.toString();
	}
};

const validateCatalogQuery = async (query) => {
	const result = ["oz", null];

	if (!query.startsWith("http")) {
		result[1] = `${OZON_API_ENTRYPOINT}?url=${query}`;
		return result;
	}

	const url = new URL(query);

	if (url.host.includes("ozon.")) {
		result[1] = `${OZON_API_ENTRYPOINT}?url=${url.pathname}${url.search}`;
	} else if (url.host.includes("wildberries.")) {
		result[1] = await detectWildberriesCatalogUrl(query);
		result[0] = "wb";
	} else {
		throw new Error(`Неподдерживаемый домен: ${url.host}`);
	}

	return result;
};

const parseCatalogResult = (params) => {
	const startTime = Date.now();

	const result = {
		params,
		items: new Map(),
		marketplace: "",
		error: null,
	};

	const addError = (e) => {
		if (result.error) {
			result.error = JSON.stringify([[result.error], e]);
			return;
		}
		result.error = e;
	};

	const end = () => {
		result.totalItems = result.items.size;
		result.elapsedTime = Date.now() - startTime;
		result.timestamp = startTime + result.elapsedTime;
		result.items = Object.fromEntries(result.items);
	};

	return {
		pushItem: (key, value) => {
			result.items.set(key, value);
		},
		setMP: (mp) => {
			result.marketplace = mp;
		},
		ok: () => {
			end();
			return result;
		},
		error: (e) => {
			end();
			addError(e);
			return result;
		},
		addError: addError,
	}
};

const parseCatalog = async (query, limit = 0) => {
	const result = parseCatalogResult({ query, limit });
	const catalogs = [...new Set(query.split(","))].map((v) => v.trim()).filter((v) => v.length > 0);

	if (catalogs.length === 0) {
		return result.error("Передан пустой запрос");
	}

	for (const catalogQuery of catalogs) {
		let mp, catalogUrl;
		try {
			[mp, catalogUrl] = await validateCatalogQuery(catalogQuery);
		} catch (error) {
			result.addError(error.message);
			continue;
		}

		result.setMP(mp);

		try {
			if (mp === "oz") {
				await parseOzonCatalog(result, catalogUrl, limit);
			} else if (mp === "wb") {
				await parseWbCatalog(result, catalogUrl, limit);
			}
		} catch (error) {
			result.addError(`Ошибка при парсинге ${catalogUrl}: ${error.message}`);
		}
	}

	return result.ok();
};

export default { parse: parseCatalog };
