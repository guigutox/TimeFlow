let timers = [];
let autoGroupTimersEnabled = false;

// carregar timers ao iniciar
chrome.storage.local.get(["timers", "autoGroupTimersEnabled"], (data) => {
  timers = data.timers || [];
  autoGroupTimersEnabled = Boolean(data.autoGroupTimersEnabled);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "GET_TIMERS") {
    sendResponse(timers);
  }

  if (msg.type === "GET_SETTINGS") {
    sendResponse({ autoGroupTimersEnabled });
  }

  if (msg.type === "SET_AUTO_GROUP_TIMERS") {
    autoGroupTimersEnabled = Boolean(msg.enabled);
    chrome.storage.local.set({ autoGroupTimersEnabled });
    sendResponse({ autoGroupTimersEnabled });
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

});

function saveTimers() {
  chrome.storage.local.set({ timers });
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

chrome.tabGroups.onCreated.addListener((group) => {
  if (!autoGroupTimersEnabled) {
    return;
  }

  createOrReuseAutoTimer(group);
});

chrome.tabGroups.onRemoved.addListener((group) => {
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

chrome.tabGroups.onUpdated.addListener((group) => {
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