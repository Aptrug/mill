/* vim: set noet ts=8 sw=8 tw=80 : */

/*
 * background.js -- service worker entry point.
 *
 * All chrome.* listeners are registered synchronously at module top level
 * so the browser re-attaches them on every service worker wake.
 *
 * Error convention (async paths): reject via Promise; swallow silently in
 * release builds (no console.* calls).
 */

chrome.action.onClicked.addListener(onActionClicked);

/*
 * onActionClicked -- fires when the user clicks the toolbar icon.
 * Injects injectClipboardText into the active tab's isolated world.
 * Return value of executeScript is not consumed; .catch suppresses the
 * rejection that would otherwise surface as an unhandled Promise rejection
 * if, for example, the tab is a chrome:// page where scripting is forbidden.
 */
function onActionClicked(tab) {
	chrome.scripting.executeScript({target : {tabId : tab.id}, func : injectClipboardText}).catch(function() {});
}

/*
 * injectClipboardText -- serialized and evaluated inside the tab's isolated
 * content-script world by chrome.scripting.executeScript.
 *
 * IMPORTANT: this function must not close over any binding from this module.
 * It is transmitted as a string; outer-scope references will be undefined
 * in the destination context.
 *
 * Strategy:
 *   1. Read clipboard text via navigator.clipboard (requires clipboardRead
 *      permission; document must be focused -- satisfied because the user
 *      just clicked a tab control, returning focus to the page before the
 *      injected script runs).
 *   2. Locate the ProseMirror composer div. Claude.ai uses a single
 *      ProseMirror instance for the chat input; the more specific selector
 *      is tried first, generic contenteditable second.
 *   3. Focus the element and move the caret to the end of existing content.
 *   4. Insert text via document.execCommand('insertText'). Although
 *      deprecated, execCommand('insertText') is the only cross-framework
 *      mechanism that:
 *        - modifies the DOM,
 *        - dispatches a well-formed InputEvent (inputType:"insertText"),
 *        - is handled by ProseMirror's input rule pipeline, and
 *        - does NOT trigger the 'paste' event that routes large payloads
 *          to the document-attachment handler.
 *      The alternative -- constructing and dispatching a synthetic
 *      InputEvent manually -- does not mutate the DOM; the browser only
 *      acts on execCommand for contenteditable nodes.
 */
async function injectClipboardText() {
	const text = await navigator.clipboard.readText();
	if (!text)
		return;

	const el = (document.querySelector("div.ProseMirror[contenteditable=\"true\"]") ||
		document.querySelector("div[contenteditable=\"true\"]"));
	if (!el)
		return;

	el.focus();

	const sel = window.getSelection();
	const range = document.createRange();
	range.selectNodeContents(el);
	range.collapse(false);
	sel.removeAllRanges();
	sel.addRange(range);

	document.execCommand("insertText", false, text);
}
