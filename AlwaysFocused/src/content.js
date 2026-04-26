/* vim: set noet ts=8 sw=8 tw=80 : */

const _sheet = new CSSStyleSheet();
_sheet.replaceSync(
	"body::after{content:'';position:fixed;bottom:8px;right:8px;width:8px;height:8px;border-radius:50%;background:#0f0;z-index:2147483647;pointer-events:none}");
document.adoptedStyleSheets = [ _sheet ];

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

/* Shadow built-in properties */
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
