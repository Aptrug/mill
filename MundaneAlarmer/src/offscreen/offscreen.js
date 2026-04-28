import {MSG_AUDIO_DONE, MSG_AUDIO_ERROR, MSG_STOP_AUDIO, AUDIO_PATH} from "../shared/constants.js";

// Module-scope reference so the onMessage handler can reach the active
// element without a second closure or a shared-state workaround.
const audio = new Audio(chrome.runtime.getURL(AUDIO_PATH));

chrome.runtime.onMessage.addListener((message) => {
	if (message.type === MSG_STOP_AUDIO) {
		audio.pause();
	}
	return false;
});

// Attach listeners before calling play() to avoid a race where 'ended'
// fires synchronously on a zero-length or cached resource.
const playbackDone = new Promise((resolve, reject) => {
	audio.addEventListener("ended", resolve, {once : true});
	// 'error' fires when the resource cannot be loaded or decoded.
	audio.addEventListener("error", () => reject(audio.error), {once : true});
});

audio.play()
	.then(() => playbackDone)
	.then(() => chrome.runtime.sendMessage({type : MSG_AUDIO_DONE}))
	.catch((err) => chrome.runtime.sendMessage({
		type : MSG_AUDIO_ERROR,
		error : err?.message ?? String(err),
	}))
	// If the SW closed the document (dismiss path) before this message send,
	// the channel is gone. Swallow silently.
	.catch(() => {});
