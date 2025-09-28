
document.addEventListener("DOMContentLoaded", () => {
	const docs = document.getElementById("docs");
	const inputQuery = document.getElementById("inputQuery");
	const limitInput = document.getElementById("limitInput");
	const status = document.getElementById("status");
	const submitBtn = document.getElementById("submitBtn");

	inputQuery.addEventListener("input", (event) => {
		console.log(event);
	});

	docs.addEventListener("click", () => {
		chrome.tabs.create({ url: "./docs.html" });
	});

	submitBtn.addEventListener("click", () => {
		if (!inputQuery.value) {
			return;
		}
		if (inputQuery.value === ".") {
			inputQuery.value = "/seller/0";
			limitInput.value = "1";
		}
		let lines = new Set(inputQuery.value.trim().split("\n"));
		for (const line of lines) {
			submitBtn.disabled = true;
			limitInput.style.display = "none"
			status.textContent = "Загрузка...";
			status.style = "color:green;";
			chrome.runtime.sendMessage({
				action: "parseCatalog",
				data: {
					query: line,
					limit: parseInt(limitInput.value || "0", 10),
					open: true,
					return: false,
				}
			}, (_) => {
				submitBtn.disabled = false;
				limitInput.style.display = "block"
				status.textContent = "";
			});
		}
		inputQuery.value = "";
	});
});
