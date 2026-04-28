/* vim: set noet ts=8 sw=8 tw=80 : */

const MSG_PLAY = 0;
const MSG_STOP = 1;

const audio = document.getElementById("a");

chrome.runtime.onMessage.addListener((msg) => {
	switch (msg.t) {
	case MSG_PLAY:
		audio.currentTime = 0;
		audio.play();
		break;
	case MSG_STOP:
		audio.pause();
		audio.currentTime = 0;
		break;
	default:
		break;
	}
});
