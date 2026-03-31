const WRAPPER_ID = "timeflow-floating-wrapper";
const BUTTON_ID = "timeflow-floating-button";
const STORAGE_KEY_ENABLED = "floatingButtonEnabled";
const STORAGE_KEY_POSITION = "floatingButtonPosition";
const STORAGE_KEY_SHORTCUTS = "textShortcuts";
const EDGE_PADDING = 8;
const CLICK_DRAG_THRESHOLD = 6;

let wrapper = null;
let button = null;
let isDragging = false;
let dragStarted = false;
let suppressNextClick = false;
let pointerOffsetX = 0;
let pointerOffsetY = 0;
let activePointerId = null;
let shortcutMap = new Map();
let pageBridgeInjected = false;

initFloatingButton();
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

	if (!Array.isArray(rawShortcuts)) return map;

	for (const item of rawShortcuts) {
		if (!item || typeof item !== "object") continue;

		const key = normalizeShortcut(item.key);
		const value = typeof item.value === "string" ? item.value : "";

		if (!key || !value) continue;

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
	if (!(element instanceof HTMLElement)) return false;

	if (isTextInput(element)) {
		return !element.readOnly && !element.disabled;
	}

	return isContentEditable(element);
}

function isTextInput(element) {
	if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
		return false;
	}

	if (element instanceof HTMLTextAreaElement) return true;

	const allowedTypes = ["", "text", "search", "url", "tel", "email"];
	return allowedTypes.includes((element.type || "").toLowerCase());
}

function isContentEditable(element) {
	return element instanceof HTMLElement && element.isContentEditable;
}

function normalizeShortcut(value) {
	if (typeof value !== "string") return "";

	const trimmed = value.trim().toLowerCase();
	if (!trimmed) return "";

	const base = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
	if (base.length < 2) return "";

	if (/\s/.test(base)) return "";

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

function initFloatingButton() {
	chrome.storage.local.get([STORAGE_KEY_ENABLED, STORAGE_KEY_POSITION], (data) => {
		const enabled = Boolean(data[STORAGE_KEY_ENABLED]);
		if (!enabled) {
			return;
		}

		mountButton(data[STORAGE_KEY_POSITION]);
	});

	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== "local") {
			return;
		}

		if (changes[STORAGE_KEY_ENABLED]) {
			if (Boolean(changes[STORAGE_KEY_ENABLED].newValue)) {
				mountButton();
			} else {
				unmountButton();
			}
		}

		if (changes[STORAGE_KEY_POSITION] && wrapper && !isDragging) {
			positionWrapper(changes[STORAGE_KEY_POSITION].newValue);
		}
	});
}

function mountButton(savedPosition) {
	if (wrapper) {
		if (savedPosition) {
			positionWrapper(savedPosition);
		}
		return;
	}

	wrapper = document.createElement("div");
	wrapper.id = WRAPPER_ID;
	wrapper.style.position = "fixed";
	wrapper.style.top = "84px";
	wrapper.style.right = "16px";
	wrapper.style.zIndex = "2147483647";
	wrapper.style.cursor = "grab";
	wrapper.style.userSelect = "none";
	wrapper.style.touchAction = "none";

	button = document.createElement("button");
	button.id = BUTTON_ID;
	button.type = "button";
	button.textContent = "Agrupar aba";
	button.title = "Criar grupo com esta aba";
	button.style.border = "none";
	button.style.borderRadius = "999px";
	button.style.padding = "10px 14px";
	button.style.fontFamily = "Segoe UI, sans-serif";
	button.style.fontSize = "13px";
	button.style.fontWeight = "700";
	button.style.lineHeight = "1";
	button.style.color = "#ffffff";
	button.style.background = "#592a9e";
	button.style.boxShadow = "0 10px 20px rgba(0, 0, 0, 0.25)";
	button.style.cursor = "pointer";

	button.addEventListener("pointerdown", onPointerDown);
	button.addEventListener("click", onButtonClick);
	button.addEventListener("pointercancel", onPointerCancel);

	wrapper.appendChild(button);
	document.documentElement.appendChild(wrapper);

	if (savedPosition) {
		positionWrapper(savedPosition);
	}
}

function unmountButton() {
	if (!wrapper) {
		return;
	}

	button.removeEventListener("pointerdown", onPointerDown);
	button.removeEventListener("click", onButtonClick);
	button.removeEventListener("pointercancel", onPointerCancel);
	wrapper.remove();
	wrapper = null;
	button = null;
}

function onPointerDown(event) {
	if (!wrapper || !button || event.button !== 0) {
		return;
	}

	const rect = wrapper.getBoundingClientRect();
	pointerOffsetX = event.clientX - rect.left;
	pointerOffsetY = event.clientY - rect.top;
	isDragging = true;
	dragStarted = false;
	wrapper.style.cursor = "grabbing";
	activePointerId = event.pointerId;

	try {
		button.setPointerCapture(event.pointerId);
	} catch (error) {
		activePointerId = null;
	}

	window.addEventListener("pointermove", onPointerMove);
	window.addEventListener("pointerup", onPointerUp);
}

function onPointerMove(event) {
	if (!isDragging || !wrapper) {
		return;
	}

	const nextLeft = clamp(
		event.clientX - pointerOffsetX,
		EDGE_PADDING,
		window.innerWidth - wrapper.offsetWidth - EDGE_PADDING
	);
	const nextTop = clamp(
		event.clientY - pointerOffsetY,
		EDGE_PADDING,
		window.innerHeight - wrapper.offsetHeight - EDGE_PADDING
	);

	const prevLeft = wrapper.offsetLeft;
	const prevTop = wrapper.offsetTop;
	if (
		Math.abs(nextLeft - prevLeft) > CLICK_DRAG_THRESHOLD ||
		Math.abs(nextTop - prevTop) > CLICK_DRAG_THRESHOLD
	) {
		dragStarted = true;
	}

	wrapper.style.left = `${nextLeft}px`;
	wrapper.style.top = `${nextTop}px`;
	wrapper.style.right = "auto";
}

function onPointerUp(event) {
	if (!isDragging || !wrapper || !button) {
		return;
	}

	stopDragging(event.pointerId);

	if (dragStarted) {
		suppressNextClick = true;
		savePosition();
	}
}

function onPointerCancel(event) {
	if (!isDragging) {
		return;
	}

	stopDragging(event.pointerId);
}

function stopDragging(pointerId) {
	isDragging = false;
	if (wrapper) {
		wrapper.style.cursor = "grab";
	}

	if (button && activePointerId !== null) {
		try {
			if (button.hasPointerCapture(activePointerId)) {
				button.releasePointerCapture(activePointerId);
			}
		} catch (error) {
			// Ignora ponteiro invalido quando o navegador ja encerrou a captura.
		}
	}

	activePointerId = null;
	window.removeEventListener("pointermove", onPointerMove);
	window.removeEventListener("pointerup", onPointerUp);
}

function onButtonClick(event) {
	if (suppressNextClick) {
		suppressNextClick = false;
		event.preventDefault();
		event.stopPropagation();
		return;
	}

	chrome.runtime.sendMessage({ type: "CREATE_GROUP_WITH_CURRENT_TAB" }, (response) => {
		if (chrome.runtime.lastError) {
			showFloatingNotice("Nao foi possivel criar o grupo agora.");
			return;
		}

		if (!response || !response.ok) {
			if (response && response.alreadyGrouped) {
				showFloatingNotice("Esta aba ja esta em um grupo de abas.");
				return;
			}

			showFloatingNotice("Nao foi possivel criar o grupo agora.");
		}
	});
}

function showFloatingNotice(message) {
	const existing = document.getElementById("timeflow-floating-notice");
	if (existing) {
		existing.remove();
	}

	const notice = document.createElement("div");
	notice.id = "timeflow-floating-notice";
	notice.textContent = message;
	notice.style.position = "fixed";
	notice.style.top = "20px";
	notice.style.left = "50%";
	notice.style.transform = "translateX(-50%)";
	notice.style.zIndex = "2147483647";
	notice.style.padding = "10px 12px";
	notice.style.borderRadius = "10px";
	notice.style.background = "rgba(25, 25, 25, 0.92)";
	notice.style.color = "#ffffff";
	notice.style.fontFamily = "Segoe UI, sans-serif";
	notice.style.fontSize = "12px";
	notice.style.fontWeight = "600";
	notice.style.boxShadow = "0 8px 20px rgba(0, 0, 0, 0.32)";
	notice.style.maxWidth = "280px";
	notice.style.lineHeight = "1.3";
	document.documentElement.appendChild(notice);

	setTimeout(() => {
		if (notice.isConnected) {
			notice.remove();
		}
	}, 2600);
}

function savePosition() {
	if (!wrapper) {
		return;
	}

	chrome.storage.local.set({
		[STORAGE_KEY_POSITION]: {
			left: wrapper.offsetLeft,
			top: wrapper.offsetTop
		}
	});
}

function positionWrapper(position) {
	if (!wrapper || !position || !isFinite(position.left) || !isFinite(position.top)) {
		return;
	}

	const safeLeft = clamp(
		Number(position.left),
		EDGE_PADDING,
		window.innerWidth - wrapper.offsetWidth - EDGE_PADDING
	);
	const safeTop = clamp(
		Number(position.top),
		EDGE_PADDING,
		window.innerHeight - wrapper.offsetHeight - EDGE_PADDING
	);

	wrapper.style.left = `${safeLeft}px`;
	wrapper.style.top = `${safeTop}px`;
	wrapper.style.right = "auto";
}

function clamp(value, min, max) {
	if (max < min) {
		return min;
	}
	return Math.min(Math.max(value, min), max);
}
