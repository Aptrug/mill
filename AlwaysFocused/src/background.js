chrome.runtime.onInstalled.addListener(function() {
	chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
		chrome.declarativeContent.onPageChanged.addRules([ {
			conditions : [
				new chrome.declarativeContent.PageStateMatcher(
					{pageUrl : {hostEquals : "gemini.google.com", schemes : [ "https" ]}}),
				new chrome.declarativeContent.PageStateMatcher(
					{pageUrl : {hostEquals : "claude.ai", schemes : [ "https" ]}}),
				new chrome.declarativeContent.PageStateMatcher(
					{pageUrl : {hostEquals : "grok.com", schemes : [ "https" ]}})
			],
			actions : [ new chrome.declarativeContent.ShowAction() ]
		} ]);
	});
});
