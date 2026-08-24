(() => {
	const WRAPPER_ID = "timeflow-pinned-timer-wrapper";
	const STORAGE_KEY_TIMERS = "timers";
	const STORAGE_KEY_PINNED_ID = "pinnedTimerId";
	const STORAGE_KEY_PINNED_POSITION = "pinnedTimerPosition";
	const EDGE_PADDING = 8;

	let cachedTimers = [];
	let pinnedTimerId = null;
	let wrapper = null;
	let dotEl = null;
	let nameEl = null;
	let timeEl = null;
	let toggleButton = null;
	let unpinButton = null;
	let tickIntervalId = null;
	let isDragging = false;
	let pointerOffsetX = 0;
	let pointerOffsetY = 0;
	let activePointerId = null;

	initPinnedTimer();

	function initPinnedTimer() {
		chrome.storage.local.get(
			[STORAGE_KEY_TIMERS, STORAGE_KEY_PINNED_ID, STORAGE_KEY_PINNED_POSITION],
			(data) => {
				cachedTimers = Array.isArray(data[STORAGE_KEY_TIMERS]) ? data[STORAGE_KEY_TIMERS] : [];
				pinnedTimerId = data[STORAGE_KEY_PINNED_ID] || null;
				refreshBubble(data[STORAGE_KEY_PINNED_POSITION]);
			}
		);

		chrome.storage.onChanged.addListener((changes, areaName) => {
			if (areaName !== "local") {
				return;
			}

			if (changes[STORAGE_KEY_TIMERS]) {
				cachedTimers = Array.isArray(changes[STORAGE_KEY_TIMERS].newValue)
					? changes[STORAGE_KEY_TIMERS].newValue
					: [];
				refreshBubble();
			}

			if (changes[STORAGE_KEY_PINNED_ID]) {
				pinnedTimerId = changes[STORAGE_KEY_PINNED_ID].newValue || null;
				refreshBubble();
			}

			if (changes[STORAGE_KEY_PINNED_POSITION] && wrapper && !isDragging) {
				positionWrapper(changes[STORAGE_KEY_PINNED_POSITION].newValue);
			}
		});
	}

	function getPinnedTimer() {
		if (!pinnedTimerId) {
			return null;
		}

		return cachedTimers.find((timer) => timer.id === pinnedTimerId) || null;
	}

	function refreshBubble(savedPosition) {
		const timer = getPinnedTimer();

		if (!timer) {
			if (pinnedTimerId) {
				// o cronometro fixado foi excluido/nao existe mais: limpa o pin
				// orfao para nao deixar o storage apontando para um id invalido
				chrome.storage.local.set({ [STORAGE_KEY_PINNED_ID]: null });
			}

			unmountBubble();
			return;
		}

		if (!wrapper) {
			mountBubble(savedPosition);
		}

		updateBubbleContent();
	}

	function mountBubble(savedPosition) {
		wrapper = document.createElement("div");
		wrapper.id = WRAPPER_ID;
		wrapper.style.position = "fixed";
		wrapper.style.top = "16px";
		wrapper.style.left = "16px";
		wrapper.style.zIndex = "2147483647";
		wrapper.style.display = "flex";
		wrapper.style.alignItems = "center";
		wrapper.style.gap = "6px";
		wrapper.style.maxWidth = "190px";
		wrapper.style.padding = "6px 8px";
		wrapper.style.borderRadius = "999px";
		wrapper.style.background = "rgba(25, 25, 25, 0.92)";
		wrapper.style.boxShadow = "0 8px 20px rgba(0, 0, 0, 0.32)";
		wrapper.style.fontFamily = "Segoe UI, sans-serif";
		wrapper.style.cursor = "grab";
		wrapper.style.userSelect = "none";
		wrapper.style.touchAction = "none";
		wrapper.style.boxSizing = "border-box";

		dotEl = document.createElement("span");
		dotEl.style.flex = "0 0 auto";
		dotEl.style.width = "7px";
		dotEl.style.height = "7px";
		dotEl.style.borderRadius = "999px";

		nameEl = document.createElement("span");
		nameEl.style.flex = "1 1 auto";
		nameEl.style.minWidth = "0";
		nameEl.style.overflow = "hidden";
		nameEl.style.textOverflow = "ellipsis";
		nameEl.style.whiteSpace = "nowrap";
		nameEl.style.color = "#ffffff";
		nameEl.style.fontSize = "11px";
		nameEl.style.fontWeight = "600";

		timeEl = document.createElement("span");
		timeEl.style.flex = "0 0 auto";
		timeEl.style.color = "#ffffff";
		timeEl.style.fontSize = "12px";
		timeEl.style.fontWeight = "700";
		timeEl.style.fontVariantNumeric = "tabular-nums";

		toggleButton = document.createElement("button");
		toggleButton.type = "button";
		toggleButton.style.flex = "0 0 auto";
		toggleButton.style.width = "20px";
		toggleButton.style.height = "20px";
		toggleButton.style.padding = "0";
		toggleButton.style.border = "none";
		toggleButton.style.borderRadius = "999px";
		toggleButton.style.background = "rgba(255, 255, 255, 0.16)";
		toggleButton.style.color = "#ffffff";
		toggleButton.style.fontSize = "10px";
		toggleButton.style.lineHeight = "1";
		toggleButton.style.cursor = "pointer";
		toggleButton.addEventListener("click", onToggleClick);

		unpinButton = document.createElement("button");
		unpinButton.type = "button";
		unpinButton.textContent = "×";
		unpinButton.title = "Desafixar cronometro";
		unpinButton.setAttribute("aria-label", "Desafixar cronometro");
		unpinButton.style.flex = "0 0 auto";
		unpinButton.style.width = "20px";
		unpinButton.style.height = "20px";
		unpinButton.style.padding = "0";
		unpinButton.style.border = "none";
		unpinButton.style.borderRadius = "999px";
		unpinButton.style.background = "rgba(255, 255, 255, 0.16)";
		unpinButton.style.color = "#ffffff";
		unpinButton.style.fontSize = "13px";
		unpinButton.style.lineHeight = "1";
		unpinButton.style.cursor = "pointer";
		unpinButton.addEventListener("click", onUnpinClick);

		wrapper.appendChild(dotEl);
		wrapper.appendChild(nameEl);
		wrapper.appendChild(timeEl);
		wrapper.appendChild(toggleButton);
		wrapper.appendChild(unpinButton);

		wrapper.addEventListener("pointerdown", onPointerDown);
		wrapper.addEventListener("pointercancel", onPointerCancel);

		document.documentElement.appendChild(wrapper);

		if (savedPosition) {
			positionWrapper(savedPosition);
		}

		tickIntervalId = setInterval(updateBubbleContent, 1000);
	}

	function unmountBubble() {
		if (tickIntervalId !== null) {
			clearInterval(tickIntervalId);
			tickIntervalId = null;
		}

		if (!wrapper) {
			return;
		}

		wrapper.removeEventListener("pointerdown", onPointerDown);
		wrapper.removeEventListener("pointercancel", onPointerCancel);
		wrapper.remove();
		wrapper = null;
		dotEl = null;
		nameEl = null;
		timeEl = null;
		toggleButton = null;
		unpinButton = null;
	}

	function updateBubbleContent() {
		if (!wrapper) {
			return;
		}

		const timer = getPinnedTimer();
		if (!timer) {
			refreshBubble();
			return;
		}

		const elapsed = timer.running && Number.isFinite(timer.startTime)
			? timer.elapsed + (Date.now() - timer.startTime)
			: timer.elapsed;

		dotEl.style.background = timer.running ? "#3ddc84" : "#9a9a9a";
		nameEl.textContent = timer.name;
		nameEl.title = timer.name;
		timeEl.textContent = formatTime(elapsed);
		toggleButton.textContent = timer.running ? "⏸" : "▶";
		const toggleLabel = timer.running ? "Pausar" : "Retomar";
		toggleButton.title = toggleLabel;
		toggleButton.setAttribute("aria-label", toggleLabel);
	}

	function onToggleClick(event) {
		event.preventDefault();
		event.stopPropagation();

		if (!pinnedTimerId) {
			return;
		}

		chrome.runtime.sendMessage({ type: "TOGGLE_TIMER", id: pinnedTimerId });
	}

	function onUnpinClick(event) {
		event.preventDefault();
		event.stopPropagation();

		chrome.storage.local.set({ [STORAGE_KEY_PINNED_ID]: null });
	}

	function onPointerDown(event) {
		if (!wrapper || event.button !== 0) {
			return;
		}

		if (event.target && event.target.closest && event.target.closest("button")) {
			return;
		}

		const rect = wrapper.getBoundingClientRect();
		pointerOffsetX = event.clientX - rect.left;
		pointerOffsetY = event.clientY - rect.top;
		isDragging = true;
		wrapper.style.cursor = "grabbing";
		activePointerId = event.pointerId;

		try {
			wrapper.setPointerCapture(event.pointerId);
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

		wrapper.style.left = `${nextLeft}px`;
		wrapper.style.top = `${nextTop}px`;
	}

	function onPointerUp(event) {
		if (!isDragging || !wrapper) {
			return;
		}

		stopDragging();
		savePosition();
	}

	function onPointerCancel() {
		if (!isDragging) {
			return;
		}

		stopDragging();
	}

	function stopDragging() {
		isDragging = false;
		if (wrapper) {
			wrapper.style.cursor = "grab";

			if (activePointerId !== null) {
				try {
					if (wrapper.hasPointerCapture(activePointerId)) {
						wrapper.releasePointerCapture(activePointerId);
					}
				} catch (error) {
					// Ignora ponteiro invalido quando o navegador ja encerrou a captura.
				}
			}
		}

		activePointerId = null;
		window.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("pointerup", onPointerUp);
	}

	function savePosition() {
		if (!wrapper) {
			return;
		}

		chrome.storage.local.set({
			[STORAGE_KEY_PINNED_POSITION]: {
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
	}

	function clamp(value, min, max) {
		if (max < min) {
			return min;
		}
		return Math.min(Math.max(value, min), max);
	}

	function formatTime(ms) {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;

		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	}
})();
