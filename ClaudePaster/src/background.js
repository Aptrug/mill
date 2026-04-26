/* vim: set noet ts=8 sw=8 tw=80 : */

chrome.runtime.onInstalled.addListener(onInstalled);
chrome.action.onClicked.addListener(onActionClicked);

function onInstalled() {
	chrome.action.disable();
	chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
		chrome.declarativeContent.onPageChanged.addRules([ {
			conditions : [ new chrome.declarativeContent.PageStateMatcher(
				{pageUrl : {hostEquals : "claude.ai", schemes : [ "https" ]}}) ],
			actions : [ new chrome.declarativeContent.ShowAction() ]
		} ]);
	});
}

function onActionClicked(tab) {
	chrome.scripting.executeScript({target : {tabId : tab.id}, func : injectClipboardText}).catch(function() {});
}

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
