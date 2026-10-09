(function() {
"use strict";

const config = {
	containerSelector : ".list-grid",
	ratingSelector : ".lrow__rating",
	followsSelector : ".lrow__follows",
	debounceTime : 50
};

let debounceTimer = null;

function parseCount(text) {
	const num = parseFloat(text.replace(/[^\d.]/g, ""));
	if (text.includes("K"))
		return num * 1000;
	if (text.includes("M"))
		return num * 1000000;
	return num || 0;
}

function getMetrics(element) {
	const rating = element.querySelector(config.ratingSelector);
	const follows = element.querySelector(config.followsSelector);

	return {
		element,
		rating : rating ? parseFloat(rating.textContent) || 0 : 0,
		follows : follows ? parseCount(follows.textContent) : 0
	};
}

// Only act on /browse?...sort=score:desc (URLSearchParams decodes %3A to ":")
function shouldSort() {
	const params = new URLSearchParams(location.search);
	return location.pathname.startsWith("/browse") && params.get("sort") === "score:desc";
}

function sortGames() {
	if (!shouldSort())
		return;

	const container = document.querySelector(config.containerSelector);
	if (!container)
		return;

	const games = Array.from(container.children).map(getMetrics);
	const sorted = [...games ].sort((a, b) => b.rating - a.rating || b.follows - a.follows);

	// Already in order: leave the DOM alone so we don't retrigger the observer
	if (sorted.every((g, i) => g.element === games[i].element))
		return;

	container.append(...sorted.map(g => g.element));
}

// The site is a SPA: watch the whole body so we survive navigation and re-renders
new MutationObserver(() => {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(sortGames, config.debounceTime);
}).observe(document.body, {childList : true, subtree : true});

sortGames();
})();
