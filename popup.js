
document.addEventListener("DOMContentLoaded", () => {
	const docs = document.getElementById("docs");
	const inputQuery = document.getElementById("inputQuery");
	const limitInput = document.getElementById("limitInput");
	const status = document.getElementById("status");
	const submitBtn = document.getElementById("submitBtn");

	docs.addEventListener("click", () => {
		chrome.tabs.create({ url: "./docs.html" });
	});

	submitBtn.addEventListener("click", async () => {
		if (!inputQuery.value) {
			return;
		}
		if (inputQuery.value === ".") {
			inputQuery.value = "/seller/0";
			limitInput.value = "1";
		}

		submitBtn.disabled = true;
		limitInput.style.display = "none";
		status.textContent = "Загрузка...";
		status.style.color = "green";

		let lines = [...new Set(inputQuery.value.trim().split("\n"))];
		const active = lines.length <= 1;

		for (var line of lines) {
			line = line.trim();

			if (line.length <= 1) {
				continue;
			}

			await new Promise((resolve) => {
				chrome.runtime.sendMessage({
					action: "parseCatalog",
					data: {
						query: line,
						limit: parseInt(limitInput.value || "0", 10),
						open: true,
						return: false,
						active
					}
				}, (response) => {
					resolve(response);
				});
			});

			await new Promise(resolve => setTimeout(resolve, 100));
		}

		submitBtn.disabled = false;
		limitInput.style.display = "block";
		status.textContent = "";
		inputQuery.value = "";
	});
});
