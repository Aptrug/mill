import {MSG_AUDIO_DONE, MSG_AUDIO_ERROR} from "../shared/constants.js";

const OFFSCREEN_URL = "offscreen/offscreen.html";

// Listeners must be registered synchronously at module evaluation time so
// Chrome sees them before any async microtask runs.
chrome.action.onClicked.addListener(() => {
	// Intentional fire-and-forget: all error paths are handled inside handleClick.
	handleClick().catch(() => {});
});

chrome.runtime.onMessage.addListener((message) => {
	if (message.type === MSG_AUDIO_DONE || message.type === MSG_AUDIO_ERROR) {
		// Release the renderer process as soon as audio ends or fails.
		chrome.offscreen.closeDocument().catch(() => {});
	}
	// Synchronous handler; returning false (implicit) is correct.
	return false;
});

/** @returns {Promise<void>} */
async function handleClick() {
	const hasDoc = await chrome.offscreen.hasDocument();
	if (!hasDoc) {
		await chrome.offscreen.createDocument({
			url : OFFSCREEN_URL,
			reasons : [ chrome.offscreen.Reason.AUDIO_PLAYBACK ],
			justification : "Play bundled opus notification sound",
		});
		// Offscreen document starts playback automatically on load; no
		// follow-up message is needed.
	}

	// chrome.notifications routes through the OS notification center and
	// surfaces even when Chrome is minimized.
	await chrome.notifications.create({
		type : "basic",
		iconUrl : chrome.runtime.getURL("icons/icon128.png"),
		title : "Audio Notifier",
		message : "Playing notification sound.",
	});
}
