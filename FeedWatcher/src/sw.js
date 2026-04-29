/* vim: set noet ts=8 sw=8 tw=80 : */

const DEBUG = false;

const MSG_PLAY = 0;
const MSG_STOP = 1;
const MSG_NEW_POST = 2;

const NOTIF_ID = "fw";
const RELOAD_ALARM = "fwr";

/* Reload interval in minutes.  0.5 = 30 s. */
const RELOAD_PERIOD_MIN = 0.5;

/* Minimum ms between alarms for the same source URL.  Deduplicates two
   tabs of the same page firing within the same instant. */
const COOLDOWN = 5000;

/* Normalized (lowercase, no trailing slash, no query/hash) monitored URLs. */
const MONITORED_SET = new Set([
	"https://x.com/1337fil", "https://x.com/techinsider", "https://x.com/davidjharrisjr",
	"https://www.facebook.com/1337futureisloading", "https://www.facebook.com/techinsider",
	"https://www.facebook.com/davidjharrisjr"
]);

/* Per-source last-alarm timestamp for cooldown. */
const lastAlarm = new Map();

/* True while an offscreen document is alive. Reset to false in the
   notifications.onClosed handler after closeDocument resolves. */
let offscreenReady = false;

/* Single constructor so all send sites share one hidden class. */
function Msg(t) {
	this.t = t;
}

function normUrl(url) {
	const hlen = url.length;
	let end = hlen;
	for (let i = 0; i < hlen; i++) {
		const c = url.charCodeAt(i);
		if (c === 63 /* ? */ || c === 35 /* # */) {
			end = i;
			break;
		}
	}
	if (end > 0 && url.charCodeAt(end - 1) === 47 /* / */)
		end--;
	return url.slice(0, end).toLowerCase();
}

function isMonitored(url) {
	if (!url)
		return false;
	return MONITORED_SET.has(normUrl(url));
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
	if (offscreenReady)
		return;
	await chrome.offscreen.createDocument({
		url : "offscreen.html",
		reasons : [ "AUDIO_PLAYBACK" ],
		justification : "Play alarm sound on new post detection"
	});
	offscreenReady = true;
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

chrome.runtime.onConnect.addListener((p) => {
	p.onMessage.addListener((msg) => {
		switch (msg.t) {
		case MSG_NEW_POST:
			if (checkCooldown(msg.src))
				triggerAlarm().catch((_) => {});
			break;
		default:
			break;
		}
	});
});

chrome.runtime.onMessage.addListener((msg) => {
	switch (msg.t) {
	case MSG_PLAY: /* FALLTHROUGH */
	case MSG_STOP:
		break;
	default:
		break;
	}
});

chrome.action.onClicked.addListener(() => { triggerAlarm().catch((_) => {}); });

chrome.notifications.onClosed.addListener(async (id) => {
	if (id !== NOTIF_ID)
		return;
	if (!offscreenReady)
		return;
	await chrome.runtime.sendMessage(new Msg(MSG_STOP));
	await chrome.offscreen.closeDocument();
	offscreenReady = false;
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.url) {
		setTabIcon(tabId, isMonitored(changeInfo.url));
		return;
	}
	if (changeInfo.status === "complete")
		setTabIcon(tabId, isMonitored(tab.url));
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
