(function () {
  // Only run on main YouTube Music page
  if (window.location.hostname !== "music.youtube.com") {
    return;
  }

  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    return;
  }

  const safeInvoke = (cmd, args) => {
    return invoke(cmd, args).catch(() => {});
  };

  let hooked = false;

  function findPlayerBar() {
    return document.querySelector("ytmusic-app-layout > ytmusic-player-bar") ||
           document.querySelector("ytmusic-player-bar");
  }

  function trySetup() {
    if (hooked) return true;

    const playerBar = findPlayerBar();
    if (!playerBar) return false;

    const api = playerBar.playerApi;
    if (!api) return false;

    if (typeof api.isReady === "function" && !api.isReady()) return false;

    hooked = true;

    const sendProgress = seconds => {
      const duration = typeof api.getDuration === "function" ? api.getDuration() : 0;
      if (!duration || Number.isNaN(duration)) return;
      const percent = Math.max(0, Math.min(100, (seconds / duration) * 100));
      safeInvoke("set_progress_bar", { progress: percent });
    };

    api.addEventListener("onVideoProgress", sendProgress);

    api.addEventListener("onStateChange", state => {
      if (state === 0) {
        safeInvoke("clear_progress_bar");
      } else if (state === 2) {
        sendProgress(api.getCurrentTime ? api.getCurrentTime() : 0);
      }
    });

    return true;
  }

  function startPolling() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (trySetup() || tries > 300) {
        clearInterval(timer);
      }
    }, 500);
  }

  if (document.readyState === "complete") {
    startPolling();
  } else {
    window.addEventListener("load", startPolling);
  }
})();
