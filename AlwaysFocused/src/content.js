/* vim: set noet ts=8 sw=8 tw=80 : */

/* Intercept events at the capture phase to prevent page scripts from seeing them */
const blockEvent = function(e) {
	e.stopImmediatePropagation();
};

window.addEventListener("visibilitychange", blockEvent, true);
document.addEventListener("visibilitychange", blockEvent, true);
window.addEventListener("webkitvisibilitychange", blockEvent, true);
document.addEventListener("webkitvisibilitychange", blockEvent, true);
window.addEventListener("blur", blockEvent, true);
document.addEventListener("blur", blockEvent, true);
window.addEventListener("mouseleave", blockEvent, true);
document.addEventListener("mouseleave", blockEvent, true);

Object.defineProperty(document, "visibilityState", {
	get : function() {
		return "visible";
	}
});

Object.defineProperty(document, "hidden", {
	get : function() {
		return false;
	}
});

document.hasFocus = function() {
	return true;
};
