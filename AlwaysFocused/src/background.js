/* vim: set noet ts=8 sw=8 tw=80 : */

/* Hostnames must mirror content_scripts.matches in manifest.json exactly. */
const MATCH_HOSTS = [ "gemini.google.com", "claude.ai", "grok.com" ];
const N_HOSTS = MATCH_HOSTS.length;

const BADGE_ON = "ON";
const COLOR_ON = [ 0, 170, 0, 255 ];

/* Cold path: called only on tab events. URL constructor is safe here. */
function urlActive(url) {
	if (!url)
		return false;
	let u;
	try {
		u = new URL(url);
	} catch (_) {
		return false;
	}
	if (u.protocol !== "https:")
		return false;
	const h = u.hostname;
	let i = 0;
	while (i < N_HOSTS) {
		if (h === MATCH_HOSTS[i])
			return true;
		++i;
	}
	return false;
}

function applyBadge(tabId, active) {
	chrome.action.setBadgeText({tabId, text : active ? BADGE_ON : ""});
	if (active)
		chrome.action.setBadgeBackgroundColor({tabId, color : COLOR_ON});
}

/* Seed badges for all currently open tabs on install or browser start. */
function initAllTabs() {
	chrome.tabs.query({}, function(tabs) {
		const n = tabs.length;
		let i = 0;
		while (i < n) {
			const tab = tabs[i];
			applyBadge(tab.id, urlActive(tab.url));
			++i;
		}
	});
}

chrome.runtime.onInstalled.addListener(initAllTabs);
chrome.runtime.onStartup.addListener(initAllTabs);

chrome.tabs.onActivated.addListener(function(info) {
	chrome.tabs.get(info.tabId, function(tab) {
		applyBadge(info.tabId, urlActive(tab.url));
	});
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
	if (changeInfo.status !== "complete")
		return;
	applyBadge(tabId, urlActive(tab.url));
});
