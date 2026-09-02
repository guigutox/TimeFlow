(() => {
	const BRIDGE_FLAG = "__timeflowShortcutBridgeReady";
	if (window[BRIDGE_FLAG]) {
		return;
	}

	window[BRIDGE_FLAG] = true;
	let shortcutMap = new Map();

	document.addEventListener("timeflow-shortcuts-updated", (event) => {
		const rawShortcuts = event && event.detail ? event.detail.shortcuts : [];
		shortcutMap = buildShortcutMap(rawShortcuts);
	});

	document.addEventListener("keydown", (event) => {
		if (!shortcutMap.size || event.defaultPrevented || event.isComposing) {
			return;
		}

		if (!isReplacementDelimiterKey(event.key)) {
			return;
		}

		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}

		if (target.tagName === "TRIX-EDITOR") {
			setTimeout(() => {
				replaceInTrixEditor(target);
			}, 0);
			return;
		}

		const lexxyEditor = target.closest("lexxy-editor");
		if (lexxyEditor) {
			setTimeout(() => {
				replaceInLexxyEditor(lexxyEditor);
			}, 0);
		}
	}, true);

	function buildShortcutMap(rawShortcuts) {
		const map = new Map();
		if (!Array.isArray(rawShortcuts)) {
			return map;
		}

		for (const item of rawShortcuts) {
			if (!item || typeof item !== "object") {
				continue;
			}

			const key = normalizeShortcut(item.key);
			const value = typeof item.value === "string" ? item.value : "";
			if (!key || !value) {
				continue;
			}

			map.set(key, value);
		}

		return map;
	}

	function normalizeShortcut(value) {
		if (typeof value !== "string") {
			return "";
		}

		const trimmed = value.trim().toLowerCase();
		if (!trimmed) {
			return "";
		}

		const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
		if (withSlash.length < 2 || /\s/.test(withSlash)) {
			return "";
		}

		return withSlash;
	}

	function isReplacementDelimiterKey(key) {
		if (typeof key !== "string") {
			return false;
		}

		if (key === "Enter" || key === "Tab") {
			return true;
		}

		if (key.length !== 1) {
			return false;
		}

		return /\s|[.,;:!?)]/.test(key);
	}

	function getCandidateShortcut(textBeforeCaret) {
		if (typeof textBeforeCaret !== "string" || !textBeforeCaret.length) {
			return null;
		}

		const normalized = textBeforeCaret.replace(/\u00A0/g, " ");
		let delimiterLength = 0;
		const lastChar = normalized.slice(-1);
		if (/\s|[.,;:!?)]/.test(lastChar)) {
			delimiterLength = 1;
		}

		const tokenSearchText = delimiterLength
			? normalized.slice(0, -delimiterLength)
			: normalized;

		const match = tokenSearchText.match(/(^|\s|\()(\/[^\s]+)$/);
		if (!match || !match[2]) {
			return null;
		}

		const token = normalizeShortcut(match[2]);
		if (!token || !shortcutMap.has(token)) {
			return null;
		}

		const start = tokenSearchText.length - match[2].length;
		const end = tokenSearchText.length;
		return { token, start, end };
	}

	function replaceInTrixEditor(editorElement) {
		const editor = editorElement.editor;
		if (!editor || typeof editor.getSelectedRange !== "function") {
			return;
		}

		const selectedRange = editor.getSelectedRange();
		if (!Array.isArray(selectedRange) || selectedRange.length < 2) {
			return;
		}

		const [start, end] = selectedRange;
		if (!Number.isFinite(start) || !Number.isFinite(end) || start !== end) {
			return;
		}

		if (!editor.getDocument || typeof editor.getDocument !== "function") {
			return;
		}

		const documentModel = editor.getDocument();
		if (!documentModel || typeof documentModel.toString !== "function") {
			return;
		}

		const fullText = documentModel.toString();
		if (typeof fullText !== "string") {
			return;
		}

		const candidate = getCandidateShortcut(fullText.slice(0, start));
		if (!candidate) {
			return;
		}

		const replacement = shortcutMap.get(candidate.token);
		editor.setSelectedRange([candidate.start, candidate.end]);
		insertMultilineString(editor, replacement);
	}

	function insertMultilineString(editor, text) {
		const lines = text.split("\n");

		lines.forEach((line, index) => {
			if (line) {
				editor.insertString(line);
			}

			if (index < lines.length - 1) {
				editor.insertLineBreak();
			}
		});
	}

	// Lexxy (https://github.com/basecamp/lexxy) is the Lexical-based editor that
	// replaced Trix in newer Rails Action Text fields. Its <lexxy-editor> element
	// exposes `.editor` (the Lexical editor instance) and `.contents`, whose
	// `replaceTextBackUntil` is the same primitive Lexxy itself uses to swap a
	// "@mention" trigger for a mention node - we reuse it to swap our "/shortcut"
	// token for the expanded text.
	function replaceInLexxyEditor(editorElement) {
		if (!editorElement.editor || !editorElement.contents) {
			return;
		}

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
			return;
		}

		const anchorNode = selection.anchorNode;
		if (!anchorNode || anchorNode.nodeType !== Node.TEXT_NODE || !editorElement.contains(anchorNode)) {
			return;
		}

		const textBeforeCaret = anchorNode.textContent.slice(0, selection.anchorOffset);
		const candidate = getCandidateShortcut(textBeforeCaret);
		if (!candidate) {
			return;
		}

		if (!editorElement.contents.containsTextBackUntil(candidate.token)) {
			return;
		}

		const replacement = shortcutMap.get(candidate.token);
		const html = escapeHtml(replacement).split(/\r\n|\r|\n/).join("<br>");
		const doc = new DOMParser().parseFromString(html, "text/html");

		editorElement.editor.update(() => {
			const nodes = editorElement.$generateNodesFromDOM(doc);
			editorElement.contents.replaceTextBackUntil(candidate.token, nodes);
		});
	}

	function escapeHtml(text) {
		return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}
})();
