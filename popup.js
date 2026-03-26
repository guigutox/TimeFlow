const searchInput = document.getElementById("search");
const autoGroupCheckbox = document.getElementById("autoGroupTimers");
const mainScreen = document.getElementById("mainScreen");
const settingsScreen = document.getElementById("settingsScreen");
const openSettingsButton = document.getElementById("openSettings");
const backToMainButton = document.getElementById("backToMain");
const toggleDisplayModeButton = document.getElementById("toggleDisplayMode");
const toggleThemeButton = document.getElementById("toggleTheme");
const themeModeLabel = document.getElementById("themeModeLabel");
const themeIcon = document.getElementById("themeIcon");
const exportDumpButton = document.getElementById("exportDump");
const importDumpButton = document.getElementById("importDump");
const importDumpInput = document.getElementById("importDumpInput");
let allTimers = [];
let displayMode = "clock";
let themeMode = "light";

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
    renderTimers(getFilteredTimers(allTimers));
  });
}

function fetchSettings() {
  chrome.storage.local.get(["displayMode", "themeMode"], (storageData) => {
    if (storageData.displayMode === "decimal") {
      displayMode = "decimal";
    }

    if (storageData.themeMode === "dark") {
      applyTheme("dark");
    } else {
      applyTheme("light");
    }

    updateDisplayModeButton();
  });

  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
    const settings = response || {};
    autoGroupCheckbox.checked = Boolean(settings.autoGroupTimersEnabled);
  });
}

searchInput.addEventListener("input", () => {
  renderTimers(getFilteredTimers(allTimers));
});

openSettingsButton.addEventListener("click", showSettingsScreen);
backToMainButton.addEventListener("click", showMainScreen);
toggleDisplayModeButton.addEventListener("click", toggleDisplayMode);
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
    resetButton.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "RESET_TIMER", id: timer.id }, fetchTimers);
    });

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Excluir";
    deleteButton.className = "danger";
    deleteButton.addEventListener("click", () => {
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

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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