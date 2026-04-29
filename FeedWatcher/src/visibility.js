/* vim: set noet ts=8 sw=8 tw=80 : */

(function() {

const _addEventListener = document.addEventListener.bind(document);

/* Shadow visibilityState and hidden on the document instance so any
   page-script read returns the spoofed value regardless of actual tab
   focus.  Non-configurable so the page cannot re-define them. */
Object.defineProperty(document, "visibilityState", {value : "visible", writable : false, configurable : false});

Object.defineProperty(document, "hidden", {value : false, writable : false, configurable : false});

/* Intercept addEventListener before any page script runs so
   visibilitychange listeners registered by the page are swallowed.
   The wrapper is installed only once; subsequent calls go through the
   stored original. */
document.addEventListener = function(type, listener, options) {
	if (type === "visibilitychange")
		return;
	_addEventListener(type, listener, options);
};

/* hasFocus() is defined on Document.prototype.  Override on the
   instance to outrank the prototype lookup. */
document.hasFocus = function() {
	return true;
};

/* Suppress window blur/focus propagation so the page cannot infer
   tab visibility from focus events. */
window.addEventListener("blur", function(e) {
	e.stopImmediatePropagation();
}, true);
window.addEventListener("focus", function(e) {
	e.stopImmediatePropagation();
}, true);
}());
