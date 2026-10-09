(function() {
"use strict";

// Configuration
const config = {
	containerSelector : "#latest-page_items-wrap_inner",
	ratingSelector : ".resource-tile_info-meta_rating",
	viewsSelector : ".resource-tile_info-meta_views",
	hoverClass : "resource-tile-hover", // Hover class used by the site
	observerConfig : {childList : true, subtree : false},
	debounceTime : 300
};

let container = null;
let observer = null;
let debounceTimer = null;
let isSorting = false;

function parseViews(viewsText) {
	const num = parseFloat(viewsText.replace(/[^\d.]/g, ""));
	if (viewsText.includes("K"))
		return num * 1000;
	if (viewsText.includes("M"))
		return num * 1000000;
	return num || 0;
}

function getGameMetrics(element) {
	const ratingElement = element.querySelector(config.ratingSelector);
	const viewsElement = element.querySelector(config.viewsSelector);

	if (!ratingElement || !viewsElement)
		return null;

	return {rating : parseFloat(ratingElement.textContent) || 0, views : parseViews(viewsElement.textContent)};
}

function sortGames() {
	console.log("sortGames", location.hash);
	if (!container || isSorting || !location.hash.includes("/sort=rating"))
		return;
	isSorting = true;

	// Temporarily disable hover effects during sorting
	const style = document.createElement("style");
	style.textContent = `
            .${config.hoverClass} {
                transition: none !important;
                animation: none !important;
            }
        `;
	document.head.appendChild(style);

	const validGames = [];
	Array.from(container.children).forEach(game => {
		const metrics = getGameMetrics(game);
		if (metrics)
			validGames.push({element : game, ...metrics});
	});

	validGames.sort((a, b) => {
		const ratingDiff = b.rating - a.rating;
		return ratingDiff !== 0 ? ratingDiff : b.views - a.views;
	});

	requestAnimationFrame(() => {
		const fragment = document.createDocumentFragment();
		validGames.forEach(g => fragment.appendChild(g.element));

		container.innerHTML = "";
		container.appendChild(fragment);

		setTimeout(() => {
			style.remove();
			isSorting = false;
		}, 100);
	});
}

function debouncedSort() {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(sortGames, config.debounceTime);
}

function initObserver() {
	if (observer)
		observer.disconnect();

	observer = new MutationObserver(() => {
		if (!isSorting)
			debouncedSort();
	});

	if (container)
		observer.observe(container, config.observerConfig);
}

function initialize() {
	container = document.querySelector(config.containerSelector);
	if (container) {
		// Wait for initial hover states to settle
		setTimeout(() => {
			sortGames();
			initObserver();
		}, 1000);
	} else {
		setTimeout(initialize, 500);
	}
}

initialize();
})();
