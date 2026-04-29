/* vim: set noet ts=8 sw=8 tw=80 : */

const PREFIXES = [ "https://gemini.google.com/", "https://claude.ai/", "https://grok.com/" ];
const N_PREFIXES = PREFIXES.length;

function updateIcon(tabId, url) {
	let active = false;
	for (let i = 0; i < N_PREFIXES; i++) {
		if (url.startsWith(PREFIXES[i])) {
			active = true;
			break;
		}
	}
	chrome.action.setIcon({tabId : tabId, path : active ? "icon_on.png" : "icon_off.png"});
}

/* Called on install and browser startup to fix icons for already-open tabs. */
function initAllTabs() {
	chrome.tabs.query({}, function(tabs) {
		const n = tabs.length;
		for (let i = 0; i < n; i++) {
			const tab = tabs[i];
			if (tab.url)
				updateIcon(tab.id, tab.url);
		}
	});
}

chrome.tabs.onActivated.addListener(function(info) {
	chrome.tabs.get(info.tabId, function(tab) {
		if (!tab.url)
			return;
		updateIcon(info.tabId, tab.url);
	});
});

/* Filter guarantees change.url is defined when this fires. */
chrome.tabs.onUpdated.addListener(function(tabId, change) {
	updateIcon(tabId, change.url);
}, {properties : [ "url" ]});

chrome.runtime.onInstalled.addListener(initAllTabs);
chrome.runtime.onStartup.addListener(initAllTabs);
