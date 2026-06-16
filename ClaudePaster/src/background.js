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

let injecting = false;

function onActionClicked(tab) {
	if (injecting)
		return;
	injecting = true;
	chrome.scripting.executeScript({target : {tabId : tab.id}, world : "MAIN", func : injectClipboardText})
		.catch(function() {})
		.finally(function() {
			injecting = false;
		});
}

function injectClipboardText() {
	function findEditorView(startEl) {
		function looksLikeView(v) {
			return v && typeof v === "object" && typeof v.dispatch === "function" &&
				typeof v.focus === "function" && v.state && v.state.tr && v.dom instanceof Element;
		}

		const seen = new Set();

		function consider(value) {
			if (!value || seen.has(value))
				return null;
			seen.add(value);
			return looksLikeView(value) ? value : null;
		}

		for (let el = startEl, depth = 0; el; el = el.parentElement, depth++) {
			let v = consider(el.pmViewDesc && el.pmViewDesc.view);
			if (v) {
				console.log("[paste-injector] view found at depth", depth, "via pmViewDesc.view");
				return v;
			}

			v = consider(el.__pmViewDesc && el.__pmViewDesc.view);
			if (v) {
				console.log("[paste-injector] view found at depth", depth, "via __pmViewDesc.view");
				return v;
			}

			let propNames;
			try {
				propNames = Object.getOwnPropertyNames(el);
			} catch (e) {
				continue;
			}

			for (const key of propNames) {
				let value;
				try {
					value = el[key];
				} catch (e) {
					continue;
				}

				v = consider(value);
				if (v) {
					console.log("[paste-injector] view found at depth", depth, "via property", key);
					return v;
				}

				try {
					v = consider(value && value.view);
					if (v) {
						console.log("[paste-injector] view found at depth", depth, "via", key + ".view");
						return v;
					}
				} catch (e) {
				}

				try {
					v = consider(value && value.pmViewDesc && value.pmViewDesc.view);
					if (v) {
						console.log(
							"[paste-injector] view found at depth", depth, "via", key + ".pmViewDesc.view");
						return v;
					}
				} catch (e) {
				}
			}
		}

		return null;
	}

	function insertViaPasteEvent(el, text) {
		el.focus();

		const sel = window.getSelection();
		const range = document.createRange();
		range.selectNodeContents(el);
		range.collapse(false);
		sel.removeAllRanges();
		sel.addRange(range);

		const dt = new DataTransfer();
		dt.setData("text/plain", text);

		el.dispatchEvent(new ClipboardEvent("paste", {clipboardData : dt, bubbles : true, cancelable : true}));
	}

	navigator.clipboard.readText()
		.then(function(text) {
			if (!text)
				return;

			const el = (document.querySelector("div.ProseMirror[contenteditable=\"true\"]") ||
				document.querySelector("div[contenteditable=\"true\"]"));
			if (!el)
				return;

			const view = findEditorView(el);

			if (view) {
				view.focus();
				const sel = view.state.selection;
				view.dispatch(view.state.tr.insertText(text, sel.from, sel.to));
				return;
			}

			insertViaPasteEvent(el, text);
		})
		.catch(function() {});
}
