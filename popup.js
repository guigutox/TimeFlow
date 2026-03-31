const searchInput = document.getElementById("search");
const autoGroupCheckbox = document.getElementById("autoGroupTimers");
const floatingButtonCheckbox = document.getElementById("floatingButtonEnabled");
const mainScreen = document.getElementById("mainScreen");
const settingsScreen = document.getElementById("settingsScreen");
const shortcutsScreen = document.getElementById("shortcutsScreen");
const openSettingsButton = document.getElementById("openSettings");
const backToMainButton = document.getElementById("backToMain");
const openShortcutsButton = document.getElementById("openShortcuts");
const backToSettingsButton = document.getElementById("backToSettings");
const toggleDisplayModeButton = document.getElementById("toggleDisplayMode");
const toggleSortOrderButton = document.getElementById("toggleSortOrder");
const toggleThemeButton = document.getElementById("toggleTheme");
const themeModeLabel = document.getElementById("themeModeLabel");
const themeIcon = document.getElementById("themeIcon");
const exportDumpButton = document.getElementById("exportDump");
const importDumpButton = document.getElementById("importDump");
const importDumpInput = document.getElementById("importDumpInput");
const shortcutKeyInput = document.getElementById("shortcutKey");
const shortcutValueInput = document.getElementById("shortcutValue");
const shortcutFormTitle = document.getElementById("shortcutFormTitle");
const addShortcutButton = document.getElementById("addShortcut");
const cancelShortcutEditButton = document.getElementById("cancelShortcutEdit");
const shortcutsList = document.getElementById("shortcutsList");
const exportShortcutsButton = document.getElementById("exportShortcuts");
const importShortcutsButton = document.getElementById("importShortcuts");
const importShortcutsInput = document.getElementById("importShortcutsInput");
const confirmDialog = document.getElementById("confirmDialog");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancelButton = document.getElementById("confirmCancel");
const confirmAcceptButton = document.getElementById("confirmAccept");
const STORAGE_KEY_SHORTCUTS = "textShortcuts";
const SHORTCUTS_DUMP_VERSION = 1;
let allTimers = [];
let displayMode = "clock";
let sortOrder = "oldest";
let themeMode = "light";
let pendingConfirmResolver = null;
let textShortcuts = [];
let editingShortcutKey = null;

function updateThemeButton() {
  const darkModeEnabled = themeMode === "dark";
  themeIcon.textContent = darkModeEnabled ? "☀️" : "🌙";
  themeModeLabel.textContent = darkModeEnabled ? "Escuro" : "Claro";
  toggleThemeButton.title = darkModeEnabled ? "Ativar modo claro" : "Ativar modo escuro";
  toggleThemeButton.setAttribute("aria-label", darkModeEnabled ? "Alternar para tema claro" : "Alternar para tema escuro");
}

function applyTheme(theme) {
  themeMode = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", themeMode);
  updateThemeButton();
}

function toggleTheme() {
  const nextTheme = themeMode === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  chrome.storage.local.set({ themeMode: nextTheme });
}

function updateDisplayModeButton() {
  const decimalModeEnabled = displayMode === "decimal";
  toggleDisplayModeButton.textContent = decimalModeEnabled ? "00:00" : "1,5h";
  toggleDisplayModeButton.title = decimalModeEnabled
    ? "Mostrar no formato de relogio"
    : "Mostrar em horas decimais";
  toggleDisplayModeButton.classList.toggle("active", decimalModeEnabled);
}

function toggleDisplayMode() {
  displayMode = displayMode === "clock" ? "decimal" : "clock";
  chrome.storage.local.set({ displayMode });
  updateDisplayModeButton();
  renderTimers(getFilteredTimers(allTimers));
}

function updateSortOrderButton() {
  const newestFirst = sortOrder === "newest";
  toggleSortOrderButton.textContent = newestFirst ? "Novos" : "Antigos";
  toggleSortOrderButton.title = newestFirst
    ? "Ordenar: mais novos primeiro"
    : "Ordenar: mais antigos primeiro";
  toggleSortOrderButton.classList.toggle("active", newestFirst);
}

function toggleSortOrder() {
  sortOrder = sortOrder === "oldest" ? "newest" : "oldest";
  chrome.storage.local.set({ sortOrder });
  updateSortOrderButton();
  renderTimers(getSortedTimers(getFilteredTimers(allTimers)));
}

function showSettingsScreen() {
  mainScreen.classList.add("hidden");
  mainScreen.classList.remove("active");
  shortcutsScreen.classList.add("hidden");
  shortcutsScreen.classList.remove("active");
  settingsScreen.classList.remove("hidden");
  settingsScreen.classList.add("active");
}

function showMainScreen() {
  shortcutsScreen.classList.add("hidden");
  shortcutsScreen.classList.remove("active");
  settingsScreen.classList.add("hidden");
  settingsScreen.classList.remove("active");
  mainScreen.classList.remove("hidden");
  mainScreen.classList.add("active");
}

function showShortcutsScreen() {
  mainScreen.classList.add("hidden");
  mainScreen.classList.remove("active");
  settingsScreen.classList.add("hidden");
  settingsScreen.classList.remove("active");
  shortcutsScreen.classList.remove("hidden");
  shortcutsScreen.classList.add("active");
  shortcutKeyInput.focus();
}

function fetchTimers() {
  chrome.runtime.sendMessage({ type: "GET_TIMERS" }, (response) => {
    allTimers = response || [];
    renderTimers(getSortedTimers(getFilteredTimers(allTimers)));
  });
}

function fetchSettings() {
  chrome.storage.local.get(["displayMode", "themeMode", "sortOrder"], (storageData) => {
    if (storageData.displayMode === "decimal") {
      displayMode = "decimal";
    }

    if (storageData.themeMode === "dark") {
      applyTheme("dark");
    } else {
      applyTheme("light");
    }

    if (storageData.sortOrder === "newest") {
      sortOrder = "newest";
    } else {
      sortOrder = "oldest";
    }

    updateDisplayModeButton();
    updateSortOrderButton();
  });

  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
    const settings = response || {};
    autoGroupCheckbox.checked = Boolean(settings.autoGroupTimersEnabled);
    floatingButtonCheckbox.checked = Boolean(settings.floatingButtonEnabled);
  });
}

searchInput.addEventListener("input", () => {
  renderTimers(getSortedTimers(getFilteredTimers(allTimers)));
});

openSettingsButton.addEventListener("click", showSettingsScreen);
backToMainButton.addEventListener("click", showMainScreen);
openShortcutsButton.addEventListener("click", showShortcutsScreen);
backToSettingsButton.addEventListener("click", showSettingsScreen);
toggleDisplayModeButton.addEventListener("click", toggleDisplayMode);
toggleSortOrderButton.addEventListener("click", toggleSortOrder);
toggleThemeButton.addEventListener("click", toggleTheme);

autoGroupCheckbox.addEventListener("change", () => {
  chrome.runtime.sendMessage({
    type: "SET_AUTO_GROUP_TIMERS",
    enabled: autoGroupCheckbox.checked
  });
});

floatingButtonCheckbox.addEventListener("change", () => {
  chrome.runtime.sendMessage({
    type: "SET_FLOATING_BUTTON_ENABLED",
    enabled: floatingButtonCheckbox.checked
  });
});

exportDumpButton.addEventListener("click", exportDump);
importDumpButton.addEventListener("click", () => importDumpInput.click());
importDumpInput.addEventListener("change", importDumpFromFile);
addShortcutButton.addEventListener("click", onSaveShortcut);
cancelShortcutEditButton.addEventListener("click", resetShortcutForm);
exportShortcutsButton.addEventListener("click", exportShortcuts);
importShortcutsButton.addEventListener("click", () => importShortcutsInput.click());
importShortcutsInput.addEventListener("change", importShortcutsFromFile);
shortcutKeyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    onSaveShortcut();
  }
});

confirmCancelButton.addEventListener("click", () => resolveConfirm(false));
confirmAcceptButton.addEventListener("click", () => resolveConfirm(true));
confirmDialog.addEventListener("click", (event) => {
  if (event.target === confirmDialog) {
    resolveConfirm(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmDialog.classList.contains("hidden")) {
    resolveConfirm(false);
  }
});

document.getElementById("create").addEventListener("click", () => {
  const nameInput = document.getElementById("name");
  const name = nameInput.value.trim();

  if (!name) {
    return;
  }

  chrome.runtime.sendMessage({
    type: "CREATE_TIMER",
    name
  }, () => {
    nameInput.value = "";
    fetchTimers();
  });
});

function renderTimers(timers) {
  const container = document.getElementById("timers");
  container.innerHTML = "";

  if (!timers.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    if (allTimers.length && searchInput.value.trim()) {
      empty.textContent = "Nenhum cronometro encontrado para sua busca.";
    } else {
      empty.textContent = "Nenhum cronometro criado ainda.";
    }
    container.appendChild(empty);
    return;
  }

  timers.forEach(timer => {
    const div = document.createElement("div");
    div.className = "timer";

    const time = calculateTime(timer);

    const title = document.createElement("strong");
    title.textContent = timer.name;

    const timeRow = document.createElement("div");
    timeRow.className = "time-row";

    const timeText = document.createElement("p");
    timeText.textContent = formatTimerValue(time);

    const copyTimeButton = document.createElement("button");
    copyTimeButton.type = "button";
    copyTimeButton.textContent = "Copiar";
    copyTimeButton.className = "copy-time-button";
    copyTimeButton.setAttribute("aria-label", `Copiar tempo de ${timer.name}`);
    copyTimeButton.addEventListener("click", async () => {
      const copied = await copyTextToClipboard(timeText.textContent);

      if (!copied) {
        alert("Nao foi possivel copiar o tempo para a area de transferencia.");
        return;
      }

      const originalLabel = copyTimeButton.textContent;
      copyTimeButton.textContent = "Copiado!";
      copyTimeButton.disabled = true;

      setTimeout(() => {
        copyTimeButton.textContent = originalLabel;
        copyTimeButton.disabled = false;
      }, 1200);
    });

    const controls = document.createElement("div");
    controls.className = "controls";

    const toggleButton = document.createElement("button");
    toggleButton.textContent = timer.running ? "Pausar" : "Retomar";
    toggleButton.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "TOGGLE_TIMER", id: timer.id }, fetchTimers);
    });

    const resetButton = document.createElement("button");
    resetButton.textContent = "Zerar";
    resetButton.className = "secondary";
    resetButton.addEventListener("click", async () => {
      const shouldReset = await showConfirmDialog({
        title: "Zerar cronometro",
        message: `Tem certeza que deseja zerar \"${timer.name}\"?`,
        kind: "default",
        confirmText: "Zerar"
      });
      if (!shouldReset) {
        return;
      }

      chrome.runtime.sendMessage({ type: "RESET_TIMER", id: timer.id }, fetchTimers);
    });

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Excluir";
    deleteButton.className = "danger";
    deleteButton.addEventListener("click", async () => {
      const shouldDelete = await showConfirmDialog({
        title: "Excluir cronometro",
        message: `Voce realmente deseja excluir "${timer.name}"? Esta acao nao pode ser desfeita.`,
        kind: "danger",
        confirmText: "Excluir"
      });
      if (!shouldDelete) {
        return;
      }

      chrome.runtime.sendMessage({ type: "DELETE_TIMER", id: timer.id }, fetchTimers);
    });

    controls.appendChild(toggleButton);
    controls.appendChild(resetButton);
    controls.appendChild(deleteButton);

    div.appendChild(title);
    timeRow.appendChild(timeText);
    timeRow.appendChild(copyTimeButton);
    div.appendChild(timeRow);
    div.appendChild(controls);

    container.appendChild(div);
  });
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // Continua para o fallback quando a API de clipboard falhar.
    }
  }

  const fallbackInput = document.createElement("textarea");
  fallbackInput.value = text;
  fallbackInput.setAttribute("readonly", "");
  fallbackInput.style.position = "fixed";
  fallbackInput.style.opacity = "0";
  fallbackInput.style.pointerEvents = "none";
  document.body.appendChild(fallbackInput);
  fallbackInput.select();
  fallbackInput.setSelectionRange(0, text.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (error) {
    copied = false;
  }

  document.body.removeChild(fallbackInput);
  return copied;
}

function calculateTime(timer) {
  if (timer.running) {
    return timer.elapsed + (Date.now() - timer.startTime);
  }
  return timer.elapsed;
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDecimalHours(ms) {
  const hours = ms / (60 * 60 * 1000);
  const truncatedHours = Math.floor(hours * 100) / 100;
  const normalized = truncatedHours.toFixed(2);

  return normalized.replace(".", ",");
}

function formatTimerValue(ms) {
  if (displayMode === "decimal") {
    return formatDecimalHours(ms);
  }

  return formatTime(ms);
}

function getFilteredTimers(timers) {
  const query = normalizeText(searchInput.value.trim());

  if (!query) {
    return timers;
  }

  return timers.filter((timer) => normalizeText(timer.name).includes(query));
}

function getSortedTimers(timers) {
  const sortedTimers = [...timers].sort((a, b) => {
    const aCreatedAt = typeof a.id === "number" ? a.id : 0;
    const bCreatedAt = typeof b.id === "number" ? b.id : 0;
    return aCreatedAt - bCreatedAt;
  });

  if (sortOrder === "newest") {
    sortedTimers.reverse();
  }

  return sortedTimers;
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function showConfirmDialog({ title, message, kind, confirmText }) {
  if (pendingConfirmResolver) {
    pendingConfirmResolver(false);
    pendingConfirmResolver = null;
  }

  confirmTitle.textContent = title || "Confirmar acao";
  confirmMessage.textContent = message || "Tem certeza?";
  confirmAcceptButton.textContent = confirmText || "Confirmar";
  confirmDialog.classList.toggle("danger", kind === "danger");
  confirmDialog.classList.remove("hidden");
  confirmCancelButton.focus();

  return new Promise((resolve) => {
    pendingConfirmResolver = resolve;
  });
}

function resolveConfirm(accepted) {
  if (!pendingConfirmResolver) {
    return;
  }

  const resolver = pendingConfirmResolver;
  pendingConfirmResolver = null;
  confirmDialog.classList.add("hidden");
  confirmDialog.classList.remove("danger");
  resolver(Boolean(accepted));
}

function exportDump() {
  chrome.runtime.sendMessage({ type: "EXPORT_TIMERS_DUMP" }, (response) => {
    if (!response || !response.ok || !response.dump) {
      alert("Nao foi possivel gerar o backup agora.");
      return;
    }

    const backupName = `timeflow-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const backupContent = JSON.stringify(response.dump, null, 2);
    const backupBlob = new Blob([backupContent], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(backupBlob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = backupName;
    link.click();

    URL.revokeObjectURL(downloadUrl);
  });
}

function importDumpFromFile(event) {
  const file = event.target.files && event.target.files[0];

  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const dump = JSON.parse(reader.result);

      chrome.runtime.sendMessage({ type: "IMPORT_TIMERS_DUMP", dump }, (response) => {
        if (!response || !response.ok) {
          alert((response && response.error) || "Nao foi possivel importar o backup.");
          return;
        }

        fetchSettings();
        fetchTimers();
        alert(`Backup importado com sucesso. ${response.timersCount} cronometro(s) restaurado(s).`);
      });
    } catch (error) {
      alert("Arquivo JSON invalido.");
    } finally {
      importDumpInput.value = "";
    }
  };

  reader.onerror = () => {
    alert("Falha ao ler o arquivo selecionado.");
    importDumpInput.value = "";
  };

  reader.readAsText(file);
}

function onSaveShortcut() {
  const key = normalizeShortcutKey(shortcutKeyInput.value);
  const value = shortcutValueInput.value.trim();

  if (!key) {
    alert("Informe um atalho valido. Exemplo: /inicio");
    shortcutKeyInput.focus();
    return;
  }

  if (!value) {
    alert("Informe o texto que sera inserido para esse atalho.");
    shortcutValueInput.focus();
    return;
  }

  if (editingShortcutKey && editingShortcutKey !== key) {
    textShortcuts = textShortcuts.filter((item) => item.key !== editingShortcutKey);
  }

  const existingIndex = textShortcuts.findIndex((item) => item.key === key);
  if (existingIndex >= 0) {
    textShortcuts[existingIndex] = { key, value };
  } else {
    textShortcuts.push({ key, value });
    textShortcuts.sort((a, b) => a.key.localeCompare(b.key));
  }

  saveShortcuts(() => {
    resetShortcutForm();
  });
}

function onRemoveShortcut(key) {
  textShortcuts = textShortcuts.filter((item) => item.key !== key);

  if (editingShortcutKey === key) {
    resetShortcutForm();
  }

  saveShortcuts();
}

function onEditShortcut(key) {
  const shortcut = textShortcuts.find((item) => item.key === key);
  if (!shortcut) {
    return;
  }

  editingShortcutKey = shortcut.key;
  shortcutKeyInput.value = shortcut.key;
  shortcutValueInput.value = shortcut.value;
  shortcutFormTitle.textContent = `Editando ${shortcut.key}`;
  addShortcutButton.textContent = "Salvar edicao";
  cancelShortcutEditButton.classList.remove("hidden-inline");
  shortcutKeyInput.focus();
}

function resetShortcutForm() {
  editingShortcutKey = null;
  shortcutKeyInput.value = "";
  shortcutValueInput.value = "";
  shortcutFormTitle.textContent = "Novo atalho";
  addShortcutButton.textContent = "Salvar atalho";
  cancelShortcutEditButton.classList.add("hidden-inline");
  shortcutKeyInput.focus();
}

function saveShortcuts(onDone) {
  chrome.storage.local.set({ [STORAGE_KEY_SHORTCUTS]: textShortcuts }, () => {
    renderShortcuts();
    if (typeof onDone === "function") {
      onDone();
    }
  });
}

function exportShortcuts() {
  const dump = {
    app: "TimeFlow",
    type: "shortcuts",
    version: SHORTCUTS_DUMP_VERSION,
    exportedAt: new Date().toISOString(),
    shortcuts: textShortcuts
  };

  const fileName = `timeflow-shortcuts-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const content = JSON.stringify(dump, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}

function importShortcutsFromFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      const importedShortcuts = normalizeImportedShortcuts(parsed);

      if (!importedShortcuts.length) {
        alert("Nao foi encontrado nenhum atalho valido no arquivo.");
        return;
      }

      const shouldReplace = await showConfirmDialog({
        title: "Importar shortcuts",
        message: `Substituir os atalhos atuais por ${importedShortcuts.length} atalho(s) importado(s)?`,
        kind: "default",
        confirmText: "Importar"
      });

      if (!shouldReplace) {
        return;
      }

      textShortcuts = importedShortcuts;
      saveShortcuts(() => {
        resetShortcutForm();
        alert(`Shortcuts importados com sucesso. ${importedShortcuts.length} atalho(s) ativo(s).`);
      });
    } catch (error) {
      alert("Arquivo JSON invalido para importacao de shortcuts.");
    } finally {
      importShortcutsInput.value = "";
    }
  };

  reader.onerror = () => {
    alert("Falha ao ler o arquivo de shortcuts.");
    importShortcutsInput.value = "";
  };

  reader.readAsText(file);
}

function normalizeImportedShortcuts(data) {
  const sourceList = Array.isArray(data)
    ? data
    : (data && Array.isArray(data.shortcuts) ? data.shortcuts : []);

  const merged = new Map();

  sourceList.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const key = normalizeShortcutKey(item.key);
    const value = typeof item.value === "string" ? item.value.trim() : "";

    if (!key || !value) {
      return;
    }

    merged.set(key, value);
  });

  return Array.from(merged.entries())
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function fetchShortcuts() {
  chrome.storage.local.get([STORAGE_KEY_SHORTCUTS], (data) => {
    const raw = data[STORAGE_KEY_SHORTCUTS];
    textShortcuts = Array.isArray(raw)
      ? raw
          .filter((item) => item && typeof item.key === "string" && typeof item.value === "string")
          .map((item) => ({
            key: normalizeShortcutKey(item.key),
            value: item.value
          }))
          .filter((item) => item.key && item.value)
      : [];

    textShortcuts.sort((a, b) => a.key.localeCompare(b.key));
    renderShortcuts();
  });
}

function renderShortcuts() {
  shortcutsList.innerHTML = "";

  if (!textShortcuts.length) {
    const empty = document.createElement("p");
    empty.className = "shortcut-empty";
    empty.textContent = "Nenhum atalho criado ainda.";
    shortcutsList.appendChild(empty);
    return;
  }

  textShortcuts.forEach((item) => {
    const shortcutCard = document.createElement("div");
    shortcutCard.className = "shortcut-item";

    const textWrapper = document.createElement("div");
    const keyLabel = document.createElement("strong");
    keyLabel.textContent = item.key;

    const valueLabel = document.createElement("p");
    valueLabel.textContent = item.value;

    textWrapper.appendChild(keyLabel);
    textWrapper.appendChild(valueLabel);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "shortcut-remove";
    removeButton.textContent = "Excluir";
    removeButton.addEventListener("click", () => onRemoveShortcut(item.key));

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "shortcut-edit";
    editButton.textContent = "Editar";
    editButton.addEventListener("click", () => onEditShortcut(item.key));

    const actions = document.createElement("div");
    actions.className = "shortcut-actions";
    actions.appendChild(editButton);
    actions.appendChild(removeButton);

    shortcutCard.appendChild(textWrapper);
    shortcutCard.appendChild(actions);
    shortcutsList.appendChild(shortcutCard);
  });
}

function normalizeShortcutKey(rawValue) {
  if (typeof rawValue !== "string") {
    return "";
  }

  const cleaned = rawValue.trim().toLowerCase();
  if (!cleaned) {
    return "";
  }

  const withSlash = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  if (withSlash.length < 2 || /\s/.test(withSlash)) {
    return "";
  }

  return withSlash;
}

fetchTimers();
fetchSettings();
fetchShortcuts();
setInterval(fetchTimers, 1000);