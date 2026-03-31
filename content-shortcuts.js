(() => {
	const STORAGE_KEY_SHORTCUTS = "textShortcuts";

	let shortcutMap = new Map();
	let pageBridgeInjected = false;

	initTextShortcuts();

	function initTextShortcuts() {
		chrome.storage.local.get([STORAGE_KEY_SHORTCUTS], (data) => {
			shortcutMap = buildShortcutMap(data[STORAGE_KEY_SHORTCUTS]);
			syncShortcutsToPageBridge();
		});

		chrome.storage.onChanged.addListener((changes, areaName) => {
			if (areaName !== "local" || !changes[STORAGE_KEY_SHORTCUTS]) {
				return;
			}

			shortcutMap = buildShortcutMap(changes[STORAGE_KEY_SHORTCUTS].newValue);
			syncShortcutsToPageBridge();
		});

		ensurePageBridgeInjected();
		document.addEventListener("input", onShortcutInput, true);
		document.addEventListener("keydown", onShortcutKeydown, true);
	}

	function ensurePageBridgeInjected() {
		if (pageBridgeInjected) {
			return;
		}

		const scriptId = "timeflow-shortcuts-page-bridge";
		if (document.getElementById(scriptId)) {
			pageBridgeInjected = true;
			return;
		}

		const script = document.createElement("script");
		script.id = scriptId;
		script.src = chrome.runtime.getURL("page-bridge.js");
		script.async = false;
		script.onload = () => {
			script.remove();
			pageBridgeInjected = true;
			syncShortcutsToPageBridge();
		};

		(document.head || document.documentElement).appendChild(script);
	}

	function syncShortcutsToPageBridge() {
		const shortcuts = Array.from(shortcutMap.entries()).map(([key, value]) => ({ key, value }));
		document.dispatchEvent(new CustomEvent("timeflow-shortcuts-updated", {
			detail: { shortcuts }
		}));
	}

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

	function onShortcutInput(event) {
		applyShortcutReplacement(resolveEditableTarget(event.target));
	}

	function onShortcutKeydown(event) {
		if (!shortcutMap.size || event.defaultPrevented || event.isComposing) {
			return;
		}

		if (!isReplacementDelimiterKey(event.key)) {
			return;
		}

		const initialTarget = event.target;
		setTimeout(() => {
			applyShortcutReplacement(resolveEditableTarget(initialTarget));
		}, 0);
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

	function applyShortcutReplacement(target) {
		if (!target || !shortcutMap.size) {
			return;
		}

		if (target.tagName === "TRIX-EDITOR") {
			return;
		}

		if (isTextInput(target)) {
			replaceShortcutInTextInput(target);
			return;
		}

		if (isContentEditable(target)) {
			replaceShortcutInContentEditable(target);
		}
	}

	function resolveEditableTarget(rawTarget) {
		if (rawTarget instanceof HTMLElement && isEditableTarget(rawTarget)) {
			return rawTarget;
		}

		const active = document.activeElement;
		if (active instanceof HTMLElement && isEditableTarget(active)) {
			return active;
		}

		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return null;
		}

		const anchorNode = selection.anchorNode;
		if (!anchorNode) {
			return null;
		}

		const anchorElement = anchorNode.nodeType === Node.ELEMENT_NODE
			? anchorNode
			: anchorNode.parentElement;

		if (!(anchorElement instanceof HTMLElement)) {
			return null;
		}

		const editableAncestor = anchorElement.closest('[contenteditable="true"]');
		if (editableAncestor instanceof HTMLElement && isEditableTarget(editableAncestor)) {
			return editableAncestor;
		}

		return null;
	}

	function isEditableTarget(element) {
		if (!(element instanceof HTMLElement)) {
			return false;
		}

		if (isTextInput(element)) {
			return !element.readOnly && !element.disabled;
		}

		return isContentEditable(element);
	}

	function isTextInput(element) {
		if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
			return false;
		}

		if (element instanceof HTMLTextAreaElement) {
			return true;
		}

		const allowedTypes = ["", "text", "search", "url", "tel", "email"];
		return allowedTypes.includes((element.type || "").toLowerCase());
	}

	function isContentEditable(element) {
		return element instanceof HTMLElement && element.isContentEditable;
	}

	function normalizeShortcut(value) {
		if (typeof value !== "string") {
			return "";
		}

		const trimmed = value.trim().toLowerCase();
		if (!trimmed) {
			return "";
		}

		const base = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
		if (base.length < 2) {
			return "";
		}

		if (/\s/.test(base)) {
			return "";
		}

		return base;
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

	function replaceShortcutInTextInput(element) {
		if (typeof element.selectionStart !== "number" || typeof element.selectionEnd !== "number") {
			return;
		}

		if (element.selectionStart !== element.selectionEnd) {
			return;
		}

		const caret = element.selectionStart;
		const candidate = getCandidateShortcut(element.value.slice(0, caret));
		if (!candidate) {
			return;
		}

		const replacement = shortcutMap.get(candidate.token);
		element.setRangeText(replacement, candidate.start, candidate.end, "end");
		element.dispatchEvent(new Event("input", { bubbles: true }));
	}

	function replaceShortcutInContentEditable(element) {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
			return;
		}

		const range = selection.getRangeAt(0);
		if (!element.contains(range.startContainer)) {
			return;
		}

		const node = range.startContainer;
		if (node.nodeType !== Node.TEXT_NODE) {
			return;
		}

		let text = node.nodeValue.slice(0, range.startOffset);
		text = text.replace(/\u00A0/g, " ");

		const candidate = getCandidateShortcut(text);
		if (!candidate) {
			return;
		}

		const replacement = shortcutMap.get(candidate.token);
		const start = range.startOffset - (candidate.end - candidate.start);
		const replacementRange = document.createRange();
		replacementRange.setStart(node, start);
		replacementRange.setEnd(node, range.startOffset);

		selection.removeAllRanges();
		selection.addRange(replacementRange);

		let inserted = false;
		try {
			inserted = document.execCommand("insertText", false, replacement);
		} catch (error) {
			inserted = false;
		}

		if (!inserted) {
			replacementRange.deleteContents();
			const insertedText = document.createTextNode(replacement);
			replacementRange.insertNode(insertedText);

			selection.removeAllRanges();
			const caretRange = document.createRange();
			caretRange.setStart(insertedText, insertedText.nodeValue.length);
			caretRange.collapse(true);
			selection.addRange(caretRange);
		}

		element.dispatchEvent(new Event("input", { bubbles: true }));
	}
})();
