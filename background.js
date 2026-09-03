let timers = [];
let autoGroupTimersEnabled = false;
let floatingButtonEnabled = false;
let pauseOnWindowBlurEnabled = false;
let autoPinNewTimerEnabled = false;
let timersReady = false;
let pendingGroupTasks = [];
const DUMP_VERSION = 1;

// carregar timers ao iniciar
chrome.storage.local.get(["timers", "autoGroupTimersEnabled", "floatingButtonEnabled", "pauseOnWindowBlurEnabled", "autoPinNewTimerEnabled"], (data) => {
  timers = data.timers || [];
  autoGroupTimersEnabled = Boolean(data.autoGroupTimersEnabled);
  floatingButtonEnabled = Boolean(data.floatingButtonEnabled);
  pauseOnWindowBlurEnabled = Boolean(data.pauseOnWindowBlurEnabled);
  autoPinNewTimerEnabled = Boolean(data.autoPinNewTimerEnabled);

  reconcileAutoTimers(() => {
    timersReady = true;
    const tasks = pendingGroupTasks;
    pendingGroupTasks = [];
    tasks.forEach((task) => task());

    // corrige um eventual estado travado (timer pausado por foco que
    // deveria ter sido retomado) sempre que o service worker acorda
    syncAutoTimersWithWindowFocus();
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
    // aproveita a abertura do popup para corrigir um eventual timer
    // travado pausado por foco (ex: evento de retomada de foco perdido)
    runWhenTimersReady(scheduleFocusSync);
  }

  if (msg.type === "GET_SETTINGS") {
    sendResponse({ autoGroupTimersEnabled, floatingButtonEnabled, pauseOnWindowBlurEnabled, autoPinNewTimerEnabled });
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

  if (msg.type === "SET_AUTO_PIN_NEW_TIMER") {
    autoPinNewTimerEnabled = Boolean(msg.enabled);
    chrome.storage.local.set({ autoPinNewTimerEnabled });
    sendResponse({ autoPinNewTimerEnabled });
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
      dailyLog: {},
      running: true
    };

    timers.push(newTimer);
    saveTimers();
    pinTimerIfAutoPinEnabled(newTimer.id);
    sendResponse(timers);
  }

  if (msg.type === "TOGGLE_TIMER") {
    timers = timers.map((timer) => {
      if (timer.id !== msg.id) {
        return timer;
      }

      return timer.running ? pauseTimer(timer) : resumeTimer(timer);
    });

    saveTimers();
    sendResponse(timers);
  }

  if (msg.type === "RESET_TIMER") {
    timers = timers.map((timer) => {
      if (timer.id !== msg.id) {
        return timer;
      }

      return {
        ...timer,
        elapsed: 0,
        dailyLog: {},
        startTime: timer.running ? Date.now() : null
      };
    });

    saveTimers();
    sendResponse(timers);
  }

  if (msg.type === "DELETE_TIMER") {
    timers = timers.filter((timer) => timer.id !== msg.id);
    saveTimers();
    clearPinnedTimerIfMatches(msg.id);
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
      chrome.storage.local.get(["pinnedTimerId"], (data) => {
        if (data.pinnedTimerId && !timers.some((timer) => timer.id === data.pinnedTimerId)) {
          chrome.storage.local.set({ pinnedTimerId: null });
        }
      });

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

// evita deixar o storage apontando para um cronometro fixado que acabou de
// ser removido (exclusao manual ou substituicao via import de backup)
function clearPinnedTimerIfMatches(timerId) {
  chrome.storage.local.get(["pinnedTimerId"], (data) => {
    if (data.pinnedTimerId === timerId) {
      chrome.storage.local.set({ pinnedTimerId: null });
    }
  });
}

function createTimersDump() {
  const now = Date.now();

  return timers.map((timer) => {
    const elapsed = getCurrentElapsed(timer, now);

    return {
      id: typeof timer.id === "string" ? timer.id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: typeof timer.name === "string" ? timer.name : "Cronometro",
      elapsed,
      dailyLog: getCurrentDailyLog(timer, now),
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

// retorna o registro diario (data -> ms) incluindo, se o timer estiver
// rodando, o trecho ainda nao consolidado entre o inicio da sessao atual e
// "now" (distribuido pelos dias que essa sessao atravessar)
function getCurrentDailyLog(timer, now) {
  if (timer.running && Number.isFinite(timer.startTime)) {
    return addDurationToDailyLog(timer.dailyLog, timer.startTime, now);
  }

  return { ...(timer.dailyLog || {}) };
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
    dailyLog: sanitizeDailyLog(timer.dailyLog),
    running,
    startTime: running ? now : null,
    autoManaged: Boolean(timer.autoManaged),
    groupId: null
  };
}

// mantem apenas entradas com chave "YYYY-MM-DD" e valor numerico >= 0,
// para nao herdar dados corrompidos de um backup editado manualmente
function sanitizeDailyLog(rawDailyLog) {
  if (!rawDailyLog || typeof rawDailyLog !== "object") {
    return {};
  }

  const sanitized = {};

  Object.keys(rawDailyLog).forEach((key) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      return;
    }

    const value = rawDailyLog[key];

    if (Number.isFinite(value) && value >= 0) {
      sanitized[key] = value;
    }
  });

  return sanitized;
}

// data local (YYYY-MM-DD) de um timestamp, usada como chave do registro
// diario
function getDateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// distribui o intervalo [startTime, endTime) pelos dias locais que ele
// atravessa, somando ao registro diario existente (sem mutar o original)
function addDurationToDailyLog(dailyLog, startTime, endTime) {
  const result = { ...(dailyLog || {}) };

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return result;
  }

  let cursor = startTime;

  while (cursor < endTime) {
    const cursorDate = new Date(cursor);
    const nextMidnight = new Date(
      cursorDate.getFullYear(),
      cursorDate.getMonth(),
      cursorDate.getDate() + 1
    ).getTime();
    const segmentEnd = Math.min(endTime, nextMidnight);
    const dateKey = getDateKey(cursor);

    result[dateKey] = (result[dateKey] || 0) + (segmentEnd - cursor);
    cursor = segmentEnd;
  }

  return result;
}

function pauseTimer(timer) {
  if (!timer.running || !timer.startTime) {
    return timer;
  }

  const now = Date.now();

  return {
    ...timer,
    elapsed: timer.elapsed + (now - timer.startTime),
    dailyLog: addDurationToDailyLog(timer.dailyLog, timer.startTime, now),
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
      windowId: group.windowId,
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
    dailyLog: {},
    running: true,
    groupId: group.id,
    windowId: group.windowId,
    autoManaged: true
  };

  timers.push(newTimer);
  saveTimers();
  pinTimerIfAutoPinEnabled(newTimer.id);
  return true;
}

function pinTimerIfAutoPinEnabled(timerId) {
  if (!autoPinNewTimerEnabled) {
    return;
  }

  chrome.storage.local.set({ pinnedTimerId: timerId });
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

    const groupsById = new Map((groups || []).map((group) => [group.id, group]));
    let changed = false;

    timers = timers.map((timer) => {
      if (!timer.autoManaged || timer.groupId == null) {
        return timer;
      }

      const liveGroup = groupsById.get(timer.groupId);

      if (!liveGroup) {
        changed = true;
        return pauseTimer({ ...timer, groupId: null, windowId: null });
      }

      if (liveGroup.windowId !== timer.windowId) {
        changed = true;
        return { ...timer, windowId: liveGroup.windowId };
      }

      return timer;
    });

    if (changed) {
      saveTimers();
    }

    if (callback) callback();
  });
}

// retoma incondicionalmente todos os cronometros que foram pausados
// automaticamente pela perda de foco. Usado quando a funcionalidade e
// desativada pelo usuario, ja que nesse caso nao faz sentido continuar
// pausado esperando um foco que nao sera mais verificado.
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

// chrome.windows.onFocusChanged e o windowId recebido nao sao confiaveis:
// o Chrome dispara WINDOW_ID_NONE de forma transitoria em interacoes
// internas (ex: menus e bolhas da propria UI de grupos de abas) mesmo sem o
// usuario ter saido do Chrome. Por isso, em vez de confiar no windowId do
// evento, ele so serve de gatilho para consultar o estado real de foco das
// janelas e sincronizar os timers com essa verdade.
//
// A verificacao e por janela: quando ha grupos em janelas diferentes do
// Chrome, apenas o cronometro do grupo que esta na janela atualmente em
// foco deve continuar rodando; os demais (em janelas sem foco) sao
// pausados, mesmo que alguma outra janela do Chrome esteja em foco.
let focusSyncTimeoutId = null;

function syncAutoTimersWithWindowFocus() {
  if (!pauseOnWindowBlurEnabled) {
    return;
  }

  if (!chrome.windows || typeof chrome.windows.getAll !== "function") {
    return;
  }

  chrome.windows.getAll({ windowTypes: ["normal", "popup"] }, (windows) => {
    if (chrome.runtime.lastError) {
      return;
    }

    const focusedWindowIds = new Set(
      (windows || []).filter((win) => win.focused).map((win) => win.id)
    );
    const anyWindowFocused = focusedWindowIds.size > 0;
    let changed = false;

    timers = timers.map((timer) => {
      if (!timer.autoManaged) {
        return timer;
      }

      // timers antigos sem windowId (criados antes desta funcionalidade)
      // caem no comportamento anterior: qualquer janela do Chrome em foco
      // conta como foco
      const isTimerWindowFocused = timer.windowId != null
        ? focusedWindowIds.has(timer.windowId)
        : anyWindowFocused;

      if (isTimerWindowFocused) {
        if (!timer.pausedByBlur) {
          return timer;
        }

        changed = true;
        return { ...resumeTimer(timer), pausedByBlur: false };
      }

      if (!timer.running) {
        return timer;
      }

      changed = true;
      return { ...pauseTimer(timer), pausedByBlur: true };
    });

    if (changed) {
      saveTimers();
    }
  });
}

function scheduleFocusSync() {
  if (focusSyncTimeoutId !== null) {
    clearTimeout(focusSyncTimeoutId);
  }

  focusSyncTimeoutId = setTimeout(() => {
    focusSyncTimeoutId = null;
    syncAutoTimersWithWindowFocus();
  }, 300);
}

chrome.windows.onFocusChanged.addListener(() => {
  runWhenTimersReady(scheduleFocusSync);
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
      groupId: null,
      windowId: null
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

    if (typeof group.windowId === "number") {
      timer.windowId = group.windowId;
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