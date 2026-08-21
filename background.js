let timers = [];
let autoGroupTimersEnabled = false;
let floatingButtonEnabled = false;
let pauseOnWindowBlurEnabled = false;
let timersReady = false;
let pendingGroupTasks = [];
const DUMP_VERSION = 1;

// carregar timers ao iniciar
chrome.storage.local.get(["timers", "autoGroupTimersEnabled", "floatingButtonEnabled", "pauseOnWindowBlurEnabled"], (data) => {
  timers = data.timers || [];
  autoGroupTimersEnabled = Boolean(data.autoGroupTimersEnabled);
  floatingButtonEnabled = Boolean(data.floatingButtonEnabled);
  pauseOnWindowBlurEnabled = Boolean(data.pauseOnWindowBlurEnabled);

  reconcileAutoTimers(() => {
    timersReady = true;
    const tasks = pendingGroupTasks;
    pendingGroupTasks = [];
    tasks.forEach((task) => task());
  });
});

// evita que eventos de tabGroups sejam processados antes dos timers
// serem carregados do storage, o que causaria cronometros duplicados
// (ex: grupos restaurados ao reabrir o Chrome disparando onCreated/onUpdated
// antes da reconciliacao terminar)
function runWhenTimersReady(task) {
  if (timersReady) {
    task();
    return;
  }

  pendingGroupTasks.push(task);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "GET_TIMERS") {
    sendResponse(timers);
  }

  if (msg.type === "GET_SETTINGS") {
    sendResponse({ autoGroupTimersEnabled, floatingButtonEnabled, pauseOnWindowBlurEnabled });
  }

  if (msg.type === "SET_AUTO_GROUP_TIMERS") {
    autoGroupTimersEnabled = Boolean(msg.enabled);
    chrome.storage.local.set({ autoGroupTimersEnabled });
    sendResponse({ autoGroupTimersEnabled });
  }

  if (msg.type === "SET_FLOATING_BUTTON_ENABLED") {
    floatingButtonEnabled = Boolean(msg.enabled);
    chrome.storage.local.set({ floatingButtonEnabled });
    sendResponse({ floatingButtonEnabled });
  }

  if (msg.type === "SET_PAUSE_ON_WINDOW_BLUR") {
    pauseOnWindowBlurEnabled = Boolean(msg.enabled);
    chrome.storage.local.set({ pauseOnWindowBlurEnabled });

    if (!pauseOnWindowBlurEnabled) {
      resumeTimersPausedByBlur();
    }

    sendResponse({ pauseOnWindowBlurEnabled });
  }

  if (msg.type === "CREATE_GROUP_WITH_CURRENT_TAB") {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    const fallbackTabUrl = sender && sender.tab ? sender.tab.url : "";

    if (tabId == null) {
      sendResponse({ ok: false, error: "Aba atual nao encontrada." });
      return;
    }

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      if (tab && typeof tab.groupId === "number" && tab.groupId >= 0) {
        sendResponse({
          ok: false,
          alreadyGrouped: true,
          error: "Esta aba ja esta em um grupo."
        });
        return;
      }

      const resolvedUrl = !chrome.runtime.lastError && tab && typeof tab.url === "string"
        ? tab.url
        : fallbackTabUrl;

      chrome.tabs.group({ tabIds: [tabId] }, (groupId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        const groupTitle = getDomainLabelFromUrl(resolvedUrl);

        chrome.tabGroups.update(groupId, { title: groupTitle }, () => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }

          sendResponse({ ok: true, groupId, groupTitle });
        });
      });
    });

    return true;
  }

  if (msg.type === "CREATE_TIMER") {
    const newTimer = {
      id: Date.now().toString(),
      name: msg.name,
      startTime: Date.now(),
      elapsed: 0,
      running: true
    };

    timers.push(newTimer);
    saveTimers();
    sendResponse(timers);
  }

  if (msg.type === "TOGGLE_TIMER") {
    timers = timers.map((timer) => {
      if (timer.id !== msg.id) {
        return timer;
      }

      if (timer.running) {
        return {
          ...timer,
          elapsed: timer.elapsed + (Date.now() - timer.startTime),
          startTime: null,
          running: false
        };
      }

      return {
        ...timer,
        startTime: Date.now(),
        running: true
      };
    });

    saveTimers();
    sendResponse(timers);
  }

  if (msg.type === "RESET_TIMER") {
    timers = timers.map((timer) => {
      if (timer.id !== msg.id) {
        return timer;
      }

      if (timer.running) {
        return {
          ...timer,
          elapsed: 0,
          startTime: Date.now()
        };
      }

      return {
        ...timer,
        elapsed: 0,
        startTime: null
      };
    });

    saveTimers();
    sendResponse(timers);
  }

  if (msg.type === "DELETE_TIMER") {
    timers = timers.filter((timer) => timer.id !== msg.id);
    saveTimers();
    sendResponse(timers);
  }

  if (msg.type === "EXPORT_TIMERS_DUMP") {
    chrome.storage.local.get(["displayMode", "themeMode"], (storageData) => {
      const dump = {
        app: "TimeFlow",
        version: DUMP_VERSION,
        exportedAt: new Date().toISOString(),
        timers: createTimersDump(),
        settings: {
          autoGroupTimersEnabled,
          displayMode: storageData.displayMode === "decimal" ? "decimal" : "clock",
          themeMode: storageData.themeMode === "dark" ? "dark" : "light"
        }
      };

      sendResponse({ ok: true, dump });
    });

    return true;
  }

  if (msg.type === "IMPORT_TIMERS_DUMP") {
    const result = importDump(msg.dump);

    if (!result.ok) {
      sendResponse(result);
      return;
    }

    chrome.storage.local.set({
      timers,
      autoGroupTimersEnabled,
      displayMode: result.displayMode,
      themeMode: result.themeMode
    }, () => {
      sendResponse({
        ok: true,
        timersCount: timers.length,
        autoGroupTimersEnabled,
        displayMode: result.displayMode,
        themeMode: result.themeMode
      });
    });

    return true;
  }

});

function saveTimers() {
  chrome.storage.local.set({ timers });
}

function createTimersDump() {
  const now = Date.now();

  return timers.map((timer) => {
    const elapsed = getCurrentElapsed(timer, now);

    return {
      id: typeof timer.id === "string" ? timer.id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: typeof timer.name === "string" ? timer.name : "Cronometro",
      elapsed,
      running: Boolean(timer.running),
      autoManaged: Boolean(timer.autoManaged)
    };
  });
}

function getCurrentElapsed(timer, now) {
  const baseElapsed = Number.isFinite(timer.elapsed) ? Math.max(0, timer.elapsed) : 0;

  if (timer.running && Number.isFinite(timer.startTime)) {
    return baseElapsed + Math.max(0, now - timer.startTime);
  }

  return baseElapsed;
}

function importDump(dump) {
  if (!dump || typeof dump !== "object") {
    return { ok: false, error: "Arquivo de backup invalido." };
  }

  if (!Array.isArray(dump.timers)) {
    return { ok: false, error: "Backup sem lista de cronometros." };
  }

  const now = Date.now();
  const importedTimers = dump.timers
    .map((timer, index) => normalizeImportedTimer(timer, index, now))
    .filter(Boolean);

  if (!importedTimers.length && dump.timers.length) {
    return { ok: false, error: "Nao foi possivel importar os cronometros desse backup." };
  }

  timers = importedTimers;

  const settings = dump.settings && typeof dump.settings === "object" ? dump.settings : {};
  autoGroupTimersEnabled = Boolean(settings.autoGroupTimersEnabled);

  return {
    ok: true,
    displayMode: settings.displayMode === "decimal" ? "decimal" : "clock",
    themeMode: settings.themeMode === "dark" ? "dark" : "light"
  };
}

function normalizeImportedTimer(timer, index, now) {
  if (!timer || typeof timer !== "object") {
    return null;
  }

  const rawName = typeof timer.name === "string" ? timer.name.trim() : "";
  if (!rawName) {
    return null;
  }

  const elapsed = Number.isFinite(timer.elapsed) ? Math.max(0, timer.elapsed) : 0;
  const running = Boolean(timer.running);

  return {
    id: typeof timer.id === "string" && timer.id.trim()
      ? timer.id
      : `${now}-${index}-${Math.random().toString(16).slice(2)}`,
    name: rawName,
    elapsed,
    running,
    startTime: running ? now : null,
    autoManaged: Boolean(timer.autoManaged),
    groupId: null
  };
}

function pauseTimer(timer) {
  if (!timer.running || !timer.startTime) {
    return timer;
  }

  return {
    ...timer,
    elapsed: timer.elapsed + (Date.now() - timer.startTime),
    startTime: null,
    running: false
  };
}

function resumeTimer(timer) {
  if (timer.running) {
    return timer;
  }

  return {
    ...timer,
    startTime: Date.now(),
    running: true
  };
}

function findAutoTimerByGroupId(groupId) {
  return timers.findIndex(
    (timer) => timer.autoManaged && timer.groupId === groupId
  );
}

function getDomainLabelFromUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    return "grupo";
  }

  try {
    const ticketId = getTicketIdFromUrl(url);
    if (ticketId) {
      return ticketId;
    }

    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const segments = hostname.split(".").filter(Boolean);

    if (!segments.length) {
      return "grupo";
    }

    if (segments.length === 1) {
      return sanitizeLabel(segments[0]);
    }

    return sanitizeLabel(segments[0]);
  } catch (error) {
    return "grupo";
  }
}

function getTicketIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/tickets\/(\d+)(?:\/|$)/i);

    if (!match || !match[1]) {
      return "";
    }

    return match[1];
  } catch (error) {
    return "";
  }
}

function sanitizeLabel(value) {
  const cleaned = value
    .replace(/[^a-z0-9-]/gi, "")
    .trim();

  if (!cleaned) {
    return "grupo";
  }

  return cleaned.slice(0, 50);
}

function findReusableAutoTimerByName(name) {
  return timers.findIndex(
    (timer) => timer.autoManaged && timer.groupId == null && timer.name === name
  );
}

function createOrReuseAutoTimer(group) {
  const groupName = group.title && group.title.trim()
    ? group.title.trim()
    : null;

  if (!groupName) {
    return false;
  }

  // ja existe um timer monitorando exatamente esse grupo: nao criar outro
  const exactTimerIndex = findAutoTimerByGroupId(group.id);
  if (exactTimerIndex !== -1) {
    return true;
  }

  const existingTimerIndex = findReusableAutoTimerByName(groupName);

  if (existingTimerIndex !== -1) {
    const updatedTimer = resumeTimer({
      ...timers[existingTimerIndex],
      groupId: group.id,
      name: groupName
    });

    timers[existingTimerIndex] = updatedTimer;
    saveTimers();
    return true;
  }

  const newTimer = {
    id: `${Date.now()}-${group.id}`,
    name: groupName,
    startTime: Date.now(),
    elapsed: 0,
    running: true,
    groupId: group.id,
    autoManaged: true
  };

  timers.push(newTimer);
  saveTimers();
  return true;
}

// verifica quais grupos de abas realmente existem e libera (groupId: null)
// qualquer timer automatico que ainda aponte para um grupo que nao existe
// mais (ex: apos reiniciar o Chrome os grupos restaurados recebem novos
// ids). Sem isso, o timer antigo nunca e reencontrado por nome e um novo
// cronometro e criado, duplicando o existente.
function reconcileAutoTimers(callback) {
  if (!chrome.tabGroups || typeof chrome.tabGroups.query !== "function") {
    if (callback) callback();
    return;
  }

  chrome.tabGroups.query({}, (groups) => {
    if (chrome.runtime.lastError) {
      if (callback) callback();
      return;
    }

    const existingGroupIds = new Set((groups || []).map((group) => group.id));
    let changed = false;

    timers = timers.map((timer) => {
      if (!timer.autoManaged || timer.groupId == null) {
        return timer;
      }

      if (existingGroupIds.has(timer.groupId)) {
        return timer;
      }

      changed = true;
      return pauseTimer({ ...timer, groupId: null });
    });

    if (changed) {
      saveTimers();
    }

    if (callback) callback();
  });
}

// pausa os cronometros automaticos (de grupo de abas) que estao rodando
// quando o Chrome perde o foco (usuario troca de app/minimiza), para evitar
// esquecer de pausar manualmente. Marca cada um com pausedByBlur para saber
// depois que foi esta funcionalidade que pausou, e nao o usuario.
function pauseTimersOnBlur() {
  let changed = false;

  timers = timers.map((timer) => {
    if (!timer.autoManaged || !timer.running) {
      return timer;
    }

    changed = true;
    return { ...pauseTimer(timer), pausedByBlur: true };
  });

  if (changed) {
    saveTimers();
  }
}

// retoma somente os cronometros que foram pausados automaticamente pela
// perda de foco, preservando os que o usuario pausou manualmente antes de
// trocar de janela/app.
function resumeTimersPausedByBlur() {
  let changed = false;

  timers = timers.map((timer) => {
    if (!timer.pausedByBlur) {
      return timer;
    }

    changed = true;
    return { ...resumeTimer(timer), pausedByBlur: false };
  });

  if (changed) {
    saveTimers();
  }
}

chrome.windows.onFocusChanged.addListener((windowId) => {
  runWhenTimersReady(() => {
    if (!pauseOnWindowBlurEnabled) {
      return;
    }

    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      pauseTimersOnBlur();
      return;
    }

    resumeTimersPausedByBlur();
  });
});

chrome.tabGroups.onCreated.addListener((group) => {
  runWhenTimersReady(() => {
    if (!autoGroupTimersEnabled) {
      return;
    }

    createOrReuseAutoTimer(group);
  });
});

chrome.tabGroups.onRemoved.addListener((group) => {
  runWhenTimersReady(() => {
    const timerIndex = findAutoTimerByGroupId(group.id);

    if (timerIndex === -1) {
      return;
    }

    const updatedTimer = pauseTimer({
      ...timers[timerIndex],
      groupId: null
    });

    timers[timerIndex] = updatedTimer;
    saveTimers();
  });
});

chrome.tabGroups.onUpdated.addListener((group) => {
  runWhenTimersReady(() => {
    let timerIndex = findAutoTimerByGroupId(group.id);

    if (timerIndex === -1 && autoGroupTimersEnabled) {
      createOrReuseAutoTimer(group);
      timerIndex = findAutoTimerByGroupId(group.id);
    }

    if (timerIndex === -1) {
      return;
    }

    let timer = timers[timerIndex];

    if (group.title && group.title.trim()) {
      timer.name = group.title.trim();
    }

    if (group.collapsed && timer.running) {
      timer = pauseTimer(timer);
    }

    if (!group.collapsed && !timer.running) {
      timer = resumeTimer(timer);
    }

    timers[timerIndex] = timer;
    saveTimers();
  });
});