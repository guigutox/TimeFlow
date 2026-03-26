const searchInput = document.getElementById("search");
const autoGroupCheckbox = document.getElementById("autoGroupTimers");
const mainScreen = document.getElementById("mainScreen");
const settingsScreen = document.getElementById("settingsScreen");
const openSettingsButton = document.getElementById("openSettings");
const backToMainButton = document.getElementById("backToMain");
const toggleDisplayModeButton = document.getElementById("toggleDisplayMode");
const toggleSortOrderButton = document.getElementById("toggleSortOrder");
const toggleThemeButton = document.getElementById("toggleTheme");
const themeModeLabel = document.getElementById("themeModeLabel");
const themeIcon = document.getElementById("themeIcon");
const exportDumpButton = document.getElementById("exportDump");
const importDumpButton = document.getElementById("importDump");
const importDumpInput = document.getElementById("importDumpInput");
const confirmDialog = document.getElementById("confirmDialog");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancelButton = document.getElementById("confirmCancel");
const confirmAcceptButton = document.getElementById("confirmAccept");
let allTimers = [];
let displayMode = "clock";
let sortOrder = "oldest";
let themeMode = "light";
let pendingConfirmResolver = null;

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
  settingsScreen.classList.remove("hidden");
  settingsScreen.classList.add("active");
}

function showMainScreen() {
  settingsScreen.classList.add("hidden");
  settingsScreen.classList.remove("active");
  mainScreen.classList.remove("hidden");
  mainScreen.classList.add("active");
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
  });
}

searchInput.addEventListener("input", () => {
  renderTimers(getSortedTimers(getFilteredTimers(allTimers)));
});

openSettingsButton.addEventListener("click", showSettingsScreen);
backToMainButton.addEventListener("click", showMainScreen);
toggleDisplayModeButton.addEventListener("click", toggleDisplayMode);
toggleSortOrderButton.addEventListener("click", toggleSortOrder);
toggleThemeButton.addEventListener("click", toggleTheme);

autoGroupCheckbox.addEventListener("change", () => {
  chrome.runtime.sendMessage({
    type: "SET_AUTO_GROUP_TIMERS",
    enabled: autoGroupCheckbox.checked
  });
});

exportDumpButton.addEventListener("click", exportDump);
importDumpButton.addEventListener("click", () => importDumpInput.click());
importDumpInput.addEventListener("change", importDumpFromFile);

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

    const timeText = document.createElement("p");
    timeText.textContent = formatTimerValue(time);

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
    div.appendChild(timeText);
    div.appendChild(controls);

    container.appendChild(div);
  });
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

fetchTimers();
fetchSettings();
setInterval(fetchTimers, 1000);