(function () {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) {
    console.warn("[ytm-progress-hook] tauri invoke not available");
    return;
  }

  const safeInvoke = (cmd, args) => invoke(cmd, args).catch(err => console.warn("[ytm-progress-hook] invoke failed", err));

  const selectors = [
    "ytmusic-player-bar",
    "ytmusic-app-layout ytmusic-player-bar",
    "ytmusic-app ytmusic-player-bar",
    "ytmusic-app-layout>ytmusic-player-bar"
  ];

  let hooked = false;

  function findPlayerApi() {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.playerApi) return el.playerApi;
    }
    return null;
  }

  function trySetup() {
    if (hooked) return true;
    const api = findPlayerApi();
    if (!api) {
      console.debug("[ytm-progress-hook] playerApi not ready");
      return false;
    }

    console.debug("[ytm-progress-hook] hooked playerApi events");
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

  // Interval retry as before
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    const ok = trySetup();
    if (ok) {
      console.debug("[ytm-progress-hook] setup success at attempt", tries);
      clearInterval(timer);
    } else if (tries > 200) {
      console.warn("[ytm-progress-hook] setup timed out after", tries, "tries");
      clearInterval(timer);
    }
  }, 500);

  // Mutation observer to catch late-loaded player bar
  const observer = new MutationObserver(() => {
    if (trySetup()) {
      observer.disconnect();
    }
  });
  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();
