import {MSG_AUDIO_DONE, MSG_AUDIO_ERROR, AUDIO_PATH} from "../shared/constants.js";

/**
 * Plays the bundled opus file to completion.
 * @returns {Promise<void>} Resolves on 'ended', rejects on error or play() failure.
 */
function playAudio() {
	const url = chrome.runtime.getURL(AUDIO_PATH);
	const audio = new Audio(url);

	return new Promise((resolve, reject) => {
		audio.addEventListener("ended", resolve, {once : true});
		// 'error' fires when the resource cannot be loaded or decoded.
		audio.addEventListener("error", () => reject(audio.error), {once : true});
		// play() can reject independently (e.g. unsupported codec).
		audio.play().catch(reject);
	});
}

playAudio()
	.then(() => chrome.runtime.sendMessage({type : MSG_AUDIO_DONE}))
	.catch((err) => chrome.runtime.sendMessage({
		type : MSG_AUDIO_ERROR,
		error : err?.message ?? String(err),
	}))
	// If the SW was terminated between document creation and message send,
	// the channel will be gone. Swallow silently — the SW's closeDocument
	// call will clean up on its next activation via the onMessage path or
	// a future hasDocument check.
	.catch(() => {});
