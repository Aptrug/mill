/* vim: set noet ts=8 sw=8 tw=80 : */

const NOTIF_ID = "main";
const MSG_PLAY = 0;
const MSG_STOP = 1;

/* Single constructor so both send sites share one hidden class. */
function Msg(t) {
	this.t = t;
}

async function ensureOffscreen() {
	const ctxs = await chrome.runtime.getContexts({contextTypes : [ "OFFSCREEN_DOCUMENT" ]});
	if (ctxs.length > 0)
		return;
	await chrome.offscreen.createDocument({
		url : "offscreen.html",
		reasons : [ "AUDIO_PLAYBACK" ],
		justification : "Play bundled opus file on action click"
	});
}

chrome.action.onClicked.addListener(async () => {
	await ensureOffscreen();
	chrome.runtime.sendMessage(new Msg(MSG_PLAY));
	chrome.notifications.create(NOTIF_ID, {
		type : "basic",
		iconUrl : "icon.png",
		title : "Playing audio",
		message : "Dismiss this notification to stop playback.",
		requireInteraction : true
	});
});

chrome.notifications.onClosed.addListener(async (id) => {
	if (id !== NOTIF_ID)
		return;
	const ctxs = await chrome.runtime.getContexts({contextTypes : [ "OFFSCREEN_DOCUMENT" ]});
	if (ctxs.length === 0)
		return;
	/* Await delivery so the audio element is paused before the
	   document is torn down. */
	await chrome.runtime.sendMessage(new Msg(MSG_STOP));
	chrome.offscreen.closeDocument();
});
