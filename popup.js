const searchInput = document.getElementById("search");
const autoGroupCheckbox = document.getElementById("autoGroupTimers");
const mainScreen = document.getElementById("mainScreen");
const settingsScreen = document.getElementById("settingsScreen");
const openSettingsButton = document.getElementById("openSettings");
const backToMainButton = document.getElementById("backToMain");
let allTimers = [];

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

autoGroupCheckbox.addEventListener("change", () => {
  chrome.runtime.sendMessage({
    type: "SET_AUTO_GROUP_TIMERS",
    enabled: autoGroupCheckbox.checked
  });
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
    timeText.textContent = formatTime(time);

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

fetchTimers();
fetchSettings();
setInterval(fetchTimers, 1000);