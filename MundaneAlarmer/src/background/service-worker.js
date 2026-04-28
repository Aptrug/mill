import {
	MSG_AUDIO_DONE,
	MSG_AUDIO_ERROR,
	MSG_STOP_AUDIO,
	NOTIFICATION_ID,
} from "../shared/constants.js";

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

chrome.notifications.onClosed.addListener((notificationId, byUser) => {
	// Only act on explicit user dismissal of our notification. System-initiated
	// closes (e.g. notification center cleared programmatically) are ignored.
	if (!byUser || notificationId !== NOTIFICATION_ID)
		return;
	stopAudioAndCloseDocument().catch(() => {});
});

/**
 * Sends MSG_STOP_AUDIO to the offscreen document (if alive) then closes it.
 * Called when the user dismisses the notification while audio may still play.
 * @returns {Promise<void>}
 */
async function stopAudioAndCloseDocument() {
	const hasDoc = await chrome.offscreen.hasDocument();
	if (!hasDoc)
		return;
	// Best-effort: the document may have already completed and been closed
	// between the onClosed event and this await. Swallow channel errors.
	await chrome.runtime.sendMessage({type : MSG_STOP_AUDIO}).catch(() => {});
	await chrome.offscreen.closeDocument().catch(() => {});
}

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
	// surfaces even when Chrome is minimized. requireInteraction keeps it
	// visible until the user explicitly dismisses it.
	await chrome.notifications.create(NOTIFICATION_ID, {
		type : "basic",
		iconUrl : chrome.runtime.getURL("icons/icon128.png"),
		title : "Audio Notifier",
		message : "Playing notification sound.",
		requireInteraction : true,
	});
}
