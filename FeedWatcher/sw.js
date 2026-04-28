/* vim: set noet ts=8 sw=8 tw=80 : */

const DEBUG = false;

const MSG_PLAY = 0;
const MSG_STOP = 1;
const MSG_NEW_POST = 2;

const NOTIF_ID = "fw";

/* Minimum ms between alarms for the same source URL.  Deduplicates two
   tabs of the same page firing within the same instant. */
const COOLDOWN = 5000;

/* Normalized (lowercase, no trailing slash, no query/hash) monitored URLs. */
const MONITORED_NORM = [
	"https://x.com/1337fil", "https://x.com/techinsider", "https://x.com/theverge",
	"https://www.facebook.com/1337futureisloading", "https://www.facebook.com/techinsider",
	"https://www.facebook.com/theverge"
];

/* Per-source last-alarm timestamp for cooldown. */
const lastAlarm = new Map();

/* Single constructor so all send sites share one hidden class. */
function Msg(t) {
	this.t = t;
}

function normUrl(url) {
	return url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
}

function isMonitored(url) {
	if (!url)
		return false;
	const norm = normUrl(url);
	const n = MONITORED_NORM.length;
	for (let i = 0; i < n; i++) {
		if (MONITORED_NORM[i] === norm)
			return true;
	}
	return false;
}

function checkCooldown(src) {
	const now = Date.now();
	const last = lastAlarm.get(src) || 0;
	if (now - last < COOLDOWN)
		return false;
	lastAlarm.set(src, now);
	return true;
}

function setTabIcon(tabId, on) {
	chrome.action.setIcon({tabId, path : on ? "icon_on.png" : "icon_off.png"});
}

async function ensureOffscreen() {
	const ctxs = await chrome.runtime.getContexts({contextTypes : [ "OFFSCREEN_DOCUMENT" ]});
	if (ctxs.length > 0)
		return;
	await chrome.offscreen.createDocument({
		url : "offscreen.html",
		reasons : [ "AUDIO_PLAYBACK" ],
		justification : "Play alarm sound on new post detection"
	});
}

async function triggerAlarm() {
	await ensureOffscreen();
	chrome.runtime.sendMessage(new Msg(MSG_PLAY));
	chrome.notifications.create(NOTIF_ID, {
		type : "basic",
		iconUrl : "icon_on.png",
		title : "New post detected",
		message : "A new post appeared on a monitored profile. Dismiss to stop alarm.",
		requireInteraction : true
	});
}

/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((msg) => {
	switch (msg.t) {
	case MSG_NEW_POST:
		if (checkCooldown(msg.src))
			triggerAlarm().catch((_) => {});
		break;
	default:
		break;
	}
});

chrome.action.onClicked.addListener(() => { triggerAlarm().catch((_) => {}); });

chrome.notifications.onClosed.addListener(async (id) => {
	if (id !== NOTIF_ID)
		return;
	const ctxs = await chrome.runtime.getContexts({contextTypes : [ "OFFSCREEN_DOCUMENT" ]});
	if (ctxs.length === 0)
		return;
	await chrome.runtime.sendMessage(new Msg(MSG_STOP));
	chrome.offscreen.closeDocument();
});

chrome.tabs.onActivated.addListener(async (info) => {
	let tab;
	try {
		tab = await chrome.tabs.get(info.tabId);
	} catch (_) {
		return;
	}
	setTabIcon(info.tabId, isMonitored(tab.url));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
	if (!changeInfo.url)
		return;
	setTabIcon(tabId, isMonitored(changeInfo.url));
});

/* Set icon state for all open tabs when the extension installs or Chrome
   starts with the extension already present. */
async function initTabIcons() {
	const tabs = await chrome.tabs.query({});
	const n = tabs.length;
	for (let i = 0; i < n; i++) {
		const tab = tabs[i];
		if (tab.id && tab.url)
			setTabIcon(tab.id, isMonitored(tab.url));
	}
}

chrome.runtime.onInstalled.addListener(initTabIcons);
chrome.runtime.onStartup.addListener(initTabIcons);
