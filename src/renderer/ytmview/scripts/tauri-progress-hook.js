(function () {
  // Only run on main YouTube Music page
  if (window.location.hostname !== "music.youtube.com") {
    return;
  }

  console.log("[ytm-progress-hook] script started");

  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    console.warn("[ytm-progress-hook] tauri invoke not available, window.__TAURI__ =", window.__TAURI__);
    return;
  }

  console.log("[ytm-progress-hook] tauri invoke available");

  const safeInvoke = (cmd, args) => {
    return invoke(cmd, args).catch(err => console.warn("[ytm-progress-hook] invoke failed", err));
  };

  let hooked = false;

  function findPlayerBar() {
    // YTM uses standard DOM, not shadow DOM for player bar
    return document.querySelector("ytmusic-app-layout > ytmusic-player-bar") ||
           document.querySelector("ytmusic-player-bar");
  }

  function trySetup() {
    if (hooked) return true;

    const playerBar = findPlayerBar();
    if (!playerBar) {
      return false;
    }

    const api = playerBar.playerApi;
    if (!api) {
      return false;
    }

    // Check if playerApi is ready (has isReady method and returns true)
    if (typeof api.isReady === "function" && !api.isReady()) {
      return false;
    }

    console.log("[ytm-progress-hook] hooked playerApi events successfully!");
    hooked = true;

    const sendProgress = seconds => {
      const duration = typeof api.getDuration === "function" ? api.getDuration() : 0;
      if (!duration || Number.isNaN(duration)) return;
      const percent = Math.max(0, Math.min(100, (seconds / duration) * 100));
      safeInvoke("set_progress_bar", { progress: percent });
    };

    api.addEventListener("onVideoProgress", seconds => {
      sendProgress(seconds);
    });

    api.addEventListener("onStateChange", state => {
      // 0 = ended, 2 = paused
      if (state === 0) {
        safeInvoke("clear_progress_bar");
      } else if (state === 2) {
        sendProgress(api.getCurrentTime ? api.getCurrentTime() : 0);
      }
    });

    return true;
  }

  // Wait for window load first, then start polling
  function startPolling() {
    console.log("[ytm-progress-hook] starting polling for playerApi");
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (trySetup()) {
        console.log("[ytm-progress-hook] setup success at attempt", tries);
        clearInterval(timer);
      } else if (tries > 300) {
        console.warn("[ytm-progress-hook] setup timed out after", tries, "tries (150 seconds)");
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
