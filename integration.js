
function createEmbeddedElement(top = 0) {
	const contElements = document.getElementsByClassName("_mpsEx___mainConteiner_");
	if (contElements && contElements.length > 0) {
		for (let i = 0; i < contElements.length; i++) {
			contElements[i].remove();
		}
	}
	const conteiner = document.createElement("div");
	conteiner.id = "_mpsEx___mainConteiner";
	conteiner.className = "_mpsEx___mainConteiner_";
	Object.assign(conteiner.style, {
		display: "flex",
		alignItems: "center",
		gap: "8px",
		position: "absolute",
		top: `${top}px`,
		left: "100%",
		marginLeft: "12px",
		background: "rgba(0, 0, 0, 0)",
	});

	const limitInput = document.createElement("input");
	Object.assign(limitInput, {
		type: "number",
		name: "-",
		id: "_mpsEx___limitInput",
		value: "1",
		placeholder: "max",
		size: "5",
		max: "99999",
		min: "0",
	});
	Object.assign(limitInput.style, {
		padding: "2px 4px",
		border: "solid 1px #929292",
		borderRadius: "4px",
		height: "26px",
		maxWidth: "56px",
		fontSize: "12px",
	});
	conteiner.appendChild(limitInput);

	const image = document.createElement("img");
	Object.assign(image, {
		id: "_mpsEx___submitBtn",
		src: chrome.runtime.getURL("images/icon128.png"),
		width: "26",
		height: "26",
	});
	image.style.cursor = "pointer";
	image.style.transition = "transform 0.2s ease";
	image.style.opacity = "0.85";
	conteiner.appendChild(image);

	function startJumpAnimation() {
		image.style.animation = "jump 0.4s infinite alternate";
	}

	function stopJumpAnimation() {
		image.style.animation = "";
	}

	const styleTag = document.createElement("style");
	styleTag.textContent = `
@keyframes jump {
	0% { transform: translateY(0); }
	100% { transform: translateY(-5px); }
}

#_mpsEx___submitBtn:hover {
	transform: scale(1.1);
	opacity: 1 !important;
}

#_mpsEx___submitBtn[data-busy="true"] {
	animation: jump 0.4s infinite alternate !important;
	opacity: 1 !important;
}
`;
	document.head.appendChild(styleTag);

	image.addEventListener("click", async () => {
		if (image.dataset.busy === "true") return;
		image.dataset.busy = "true";
		image.style.cursor = "not-allowed";
		startJumpAnimation();

		await new Promise((resolve) => {
			chrome.runtime.sendMessage({
				action: "parseCatalog",
				data: {
					query: document.URL,
					limit: parseInt(limitInput.value || "0", 10),
					open: true,
					return: false,
				}
			}, (_) => resolve());
		});

		stopJumpAnimation();
		image.dataset.busy = "false";
		image.style.cursor = "pointer";
		limitInput.value = "1";
	});

	return conteiner;
}

async function setupOzon() {
	try {
		const container = document.querySelector('div[data-widget="searchResultsSort"]');
		if (!container) {
			return;
		}
		const child = container.firstElementChild;
		if (!child) return;
		child.style.position ||= 'relative';
		child.appendChild(createEmbeddedElement(9));
	} catch (_) { }
}

async function setupWildberries(i = 0) {
	const selectors = [
		'div.catalog-title-wrap',
		'div.searching-results__inner'
	];

	if (i > 3) {
		return;
	}

	await new Promise(r => setTimeout(r, 500));

	try {
		for (const selector of selectors) {
			const container = document.querySelector(selector);
			if (!container) {
				continue;
			}
			if (container.childElementCount <= 1) {
				await setupWildberries(i++);
			}
			const child = container.lastElementChild;
			if (!child) {
				await setupWildberries(i++);
			};
			child.style.position ||= 'relative';
			child.appendChild(createEmbeddedElement(-4));
			return;
		}
		await setupWildberries(i++);
	} catch (_) { }
}

async function main() {
	const url = document.URL;

	await new Promise(r => setTimeout(r, 100));

	if (url.startsWith("https://www.ozon.ru/")) {
		await setupOzon();
	} else if (url.startsWith("https://www.wildberries.ru/")) {
		await setupWildberries();
	}
}

main().catch(console.error);
