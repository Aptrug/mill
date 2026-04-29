/* vim: set noet ts=8 sw=8 tw=80 : */

/* Wrapped in an IIFE so we can use top-level return to bail out on
   pages that matched the manifest prefix but are not a monitored
   profile root (e.g. x.com/cnn/status/123). */
(function() {

const DEBUG = false;

const MSG_NEW_POST = 2;

const HOST = location.hostname;
const IS_X = HOST === "x.com";
const PATH = location.pathname.toLowerCase().replace(/\/$/, "");

/* Exact profile paths we monitor, per host. */
const X_PATHS = new Set([ "/1337fil", "/techinsider", "/davidjharrisjr" ]);
const FB_PATHS = new Set([ "/1337futureisloading", "/techinsider", "/davidjharrisjr" ]);

if (!(IS_X ? X_PATHS : FB_PATHS).has(PATH))
	return;

/* Pre-built, immutable source key sent with every alarm message.
   The SW uses it as a per-profile cooldown key. */
const SRC = HOST + PATH;

/* data-testid="tweet" is stable across X redesigns and used by every
   major X extension.  role="article" is the ARIA landmark Facebook
   assigns to each individual post. */
const POST_SEL = IS_X ? "article[data-testid=\"tweet\"]" : "[role=\"article\"]";

/* Narrowest stable container that wraps the full post timeline. */
const FEED_SEL = IS_X ? "[data-testid=\"primaryColumn\"]" : "[role=\"feed\"]";

/* String IDs of posts already seen.  WeakSet cannot be used here:
   X virtualises its list and removes/re-inserts tweet nodes as the
   user scrolls; a WeakSet would treat each re-insertion as a new post
   and fire a false alarm. */
const seenIds = new Set();

let feedObserver = null;
let feedContainer = null;

/* ------------------------------------------------------------------ */
/* Post ID extraction                                                   */
/* ------------------------------------------------------------------ */

/* Tweet status ID: numeric digits after "/status/" in any href. */
function extractXId(el) {
	const a = el.querySelector("a[href*=\"/status/\"]");
	if (a === null)
		return null;
	const href = a.href;
	const slash = href.indexOf("/status/");
	if (slash === -1)
		return null;
	const start = slash + 8; /* len("/status/") === 8 */
	let end = start;
	const len = href.length;
	while (end < len && href.charCodeAt(end) >= 48 && href.charCodeAt(end) <= 57)
		end++;
	return end > start ? href.slice(start, end) : null;
}

/* Facebook post ID: numeric digits from story_fbid=, /posts/, or
   /permalink/ URL patterns.  Comment articles carry none of these and
   return null, which the mutation handler treats as "skip". */
function extractFBId(el) {
	const links = el.querySelectorAll("a[href]");
	const n = links.length;
	for (let i = 0; i < n; i++) {
		const href = links[i].href;
		const hlen = href.length;
		let idx;
		idx = href.indexOf("story_fbid=");
		if (idx !== -1) {
			const off = idx + 11; /* len("story_fbid=") === 11 */
			let e = off;
			while (e < hlen && href.charCodeAt(e) >= 48 && href.charCodeAt(e) <= 57)
				e++;
			if (e > off)
				return href.slice(off, e);
		}
		idx = href.indexOf("/posts/");
		if (idx !== -1) {
			const off = idx + 7; /* len("/posts/") === 7 */
			let e = off;
			while (e < hlen && href.charCodeAt(e) >= 48 && href.charCodeAt(e) <= 57)
				e++;
			if (e > off)
				return href.slice(off, e);
		}
		idx = href.indexOf("/permalink/");
		if (idx !== -1) {
			const off = idx + 11; /* len("/permalink/") === 11 */
			let e = off;
			while (e < hlen && href.charCodeAt(e) >= 48 && href.charCodeAt(e) <= 57)
				e++;
			if (e > off)
				return href.slice(off, e);
		}
		/* /share/p/<numeric>/ -- introduced ~2024, now common on mobile-rendered
		   feeds served to desktop clients. */
		idx = href.indexOf("/share/p/");
		if (idx !== -1) {
			const off = idx + 9; /* len("/share/p/") === 9 */
			let e = off;
			while (e < hlen && href.charCodeAt(e) >= 48 && href.charCodeAt(e) <= 57)
				e++;
			if (e > off)
				return href.slice(off, e);
		}
	}
	return null;
}

const extractId = IS_X ? extractXId : extractFBId;

/* ------------------------------------------------------------------ */
/* Alarm                                                                */
/* ------------------------------------------------------------------ */

function connectPort() {
	port = chrome.runtime.connect();
	port.onDisconnect.addListener(connectPort);
}

let port;
connectPort();

function triggerAlarm() {
	port.postMessage({t : MSG_NEW_POST, src : SRC});
}

/* ------------------------------------------------------------------ */
/* Mutation handler (hot path)                                          */
/* ------------------------------------------------------------------ */

function onMutation(mutations) {
	const n = mutations.length;
	for (let i = 0; i < n; i++) {
		const added = mutations[i].addedNodes;
		const m = added.length;
		for (let j = 0; j < m; j++) {
			const node = added[j];
			if (node.nodeType !== 1)
				continue;
			if (node.matches(POST_SEL)) {
				const id = extractId(node);
				if (id === null || seenIds.has(id))
					continue;
				seenIds.add(id);
				triggerAlarm();
				return; /* one alarm per mutation batch */
			}
			const posts = node.querySelectorAll(POST_SEL);
			const pn = posts.length;
			for (let k = 0; k < pn; k++) {
				const p = posts[k];
				const id = extractId(p);
				if (id === null || seenIds.has(id))
					continue;
				seenIds.add(id);
				triggerAlarm();
				return;
			}
		}
	}
}

/* ------------------------------------------------------------------ */
/* Feed monitor lifecycle                                               */
/* ------------------------------------------------------------------ */

function initFeedMonitor(container) {
	feedContainer = container;
	/* Snapshot every post currently visible so we only alarm on truly
	   new arrivals, not on posts already on screen when monitoring
	   starts. */
	const existing = container.querySelectorAll(POST_SEL);
	const en = existing.length;
	for (let i = 0; i < en; i++) {
		const id = extractId(existing[i]);
		if (id !== null)
			seenIds.add(id);
	}
	feedObserver = new MutationObserver(onMutation);
	feedObserver.observe(container, {childList : true, subtree : true});
}

/* Called periodically.  Detects first appearance of the feed container
   after page render, and also detects SPA-driven container rebuilds. */
function tick() {
	const c = document.querySelector(FEED_SEL);
	if (c === feedContainer)
		return; /* common case: nothing changed */
	if (feedObserver !== null) {
		feedObserver.disconnect();
		feedObserver = null;
	}
	feedContainer = c;
	if (c !== null)
		initFeedMonitor(c);
}

/* ------------------------------------------------------------------ */
/* Startup polling                                                      */
/* ------------------------------------------------------------------ */

tick(); /* immediate check; page may already be rendered */

let initPolls = 0;
/* Poll at 500 ms until the container is found (max 30 s), then hand
   off to a cheap 3-second maintenance interval that catches SPA
   container rebuilds and tab re-navigations. */
const initTimer = setInterval(function() {
	initPolls++;
	tick();
	if (feedContainer !== null || initPolls >= 60) {
		clearInterval(initTimer);
		setInterval(tick, 3000);
	}
}, 500);
}()); /* end IIFE */
