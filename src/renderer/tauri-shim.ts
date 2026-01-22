// Tauri imports are loaded dynamically to avoid errors in non-Tauri environments

type WindowState = {
  minimized: boolean;
  maximized: boolean;
  fullscreen: boolean;
};

type MemoryStoreState = {
  ytmViewLoading: boolean;
  ytmViewLoadingError: boolean;
  ytmViewLoadTimedout: boolean;
  ytmViewLoadingStatus: string;
  ytmViewUnresponsive: boolean;
  appUpdateDownloaded: boolean;
  safeStorageAvailable: boolean;
};

// Default store values for settings page
const defaultStoreState = {
  general: {
    disableHardwareAcceleration: false,
    hideToTrayOnClose: false,
    showNotificationOnSongChange: true,
    startOnBoot: false,
    startMinimized: false
  },
  appearance: {
    alwaysShowVolumeSlider: false,
    customCSSEnabled: false,
    customCSSPath: null,
    zoom: 100,
    trayIconStyle: 0
  },
  playback: {
    continueWhereYouLeftOff: true,
    continueWhereYouLeftOffPaused: false,
    enableSpeakerFill: false,
    progressInTaskbar: true,
    ratioVolume: false
  },
  integrations: {
    companionServerEnabled: false,
    companionServerAuthTokens: null,
    companionServerCORSWildcardEnabled: false,
    discordPresenceEnabled: false,
    lastFMEnabled: false
  },
  shortcuts: {
    playPause: "",
    next: "",
    previous: "",
    thumbsUp: "",
    thumbsDown: "",
    volumeUp: "",
    volumeDown: ""
  },
  lastfm: {
    api_key: "",
    secret: "",
    token: null,
    sessionKey: null,
    scrobblePercent: 50
  }
};

const noop = () => {};

const memoryState: MemoryStoreState = {
  ytmViewLoading: false,
  ytmViewLoadingError: false,
  ytmViewLoadTimedout: false,
  ytmViewLoadingStatus: "",
  ytmViewUnresponsive: false,
  appUpdateDownloaded: false,
  safeStorageAvailable: false
};

const memoryListeners: Array<(newState: MemoryStoreState, oldState: MemoryStoreState) => void> = [];

const memoryStore = {
  set: (key: keyof MemoryStoreState, value?: unknown): void => {
    const previousState = { ...memoryState };
    (memoryState as Record<string, unknown>)[key as string] = value;
    memoryListeners.forEach(listener => listener({ ...memoryState }, previousState));
  },
  get: async (key: keyof MemoryStoreState): Promise<MemoryStoreState[keyof MemoryStoreState]> => memoryState[key],
  onStateChanged: (callback: (newState: MemoryStoreState, oldState: MemoryStoreState) => void): void => {
    memoryListeners.push(callback);
  }
};

// Force windowControlsOverlay.visible to false for Tauri (we use our own title bar)
if ("windowControlsOverlay" in window.navigator) {
  // Override existing property
  try {
    Object.defineProperty(window.navigator.windowControlsOverlay, "visible", {
      value: false,
      writable: false
    });
  } catch {
    // Property may not be configurable, create a proxy instead
  }
} else {
  Object.defineProperty(window.navigator, "windowControlsOverlay", {
    value: {
      visible: false,
      addEventListener: noop
    }
  });
}

if (!window.ytmd) {
  const windowState: WindowState = {
    minimized: false,
    maximized: false,
    fullscreen: false
  };

  const isTauri = typeof window !== "undefined" && (window as any).__TAURI__;

  const ytmd: any = {
    isDarwin: false,
    isLinux: true,
    isWindows: false,
    store: {
      get: async (key: string): Promise<unknown> => {
        if (!isTauri) {
          // Handle nested keys like "general.hideToTrayOnClose"
          const keys = key.split(".");
          let result: any = defaultStoreState;
          for (const k of keys) {
            result = result?.[k];
          }
          console.log("[store:get][mock]", key, result);
          return result;
        }
        try {
          const Store = (await import("@tauri-apps/plugin-store")).Store;
          const store = await Store.load("config.json");
          
          // Handle nested keys
          const keys = key.split(".");
          if (keys.length > 1) {
            // Prefer the dotted key (used by Rust backend)
            const dotted = await store.get(key);
            if (dotted !== null && dotted !== undefined) return dotted;
          }
          if (keys.length === 1) {
            // Top-level key
            const value = await store.get(key);
            if (value !== null && value !== undefined) {
              console.log("[store:get]", key, value);
              return value;
            }
            // Fallback to default
            return (defaultStoreState as Record<string, unknown>)[key];
          } else {
            // Nested key like "general.hideToTrayOnClose"
            const topKey = keys[0];
            const topValue: any = await store.get(topKey);
            if (topValue !== null && topValue !== undefined) {
              let result = topValue;
              for (let i = 1; i < keys.length; i++) {
                result = result?.[keys[i]];
              }
              if (result !== undefined) {
                console.log("[store:get]", key, result);
                return result;
              }
            }
            // Fallback to default
            let result: any = defaultStoreState;
            for (const k of keys) {
              result = result?.[k];
            }
            console.log("[store:get][default]", key, result);
            return result;
          }
        } catch (error) {
          console.error("Store get error:", error);
          const keys = key.split(".");
          let result: any = defaultStoreState;
          for (const k of keys) {
            result = result?.[k];
          }
          console.log("[store:get][error-fallback]", key, result);
          return result;
        }
      },
      set: async (key: string, value: unknown): Promise<void> => {
        if (!isTauri) return;
        try {
          const Store = (await import("@tauri-apps/plugin-store")).Store;
          const store = await Store.load("config.json");
          
          const keys = key.split(".");
          if (keys.length === 1) {
            // Top-level key
            await store.set(key, value);
          } else {
            // Nested key like "general.hideToTrayOnClose"
            const topKey = keys[0];
            let topValue: any = await store.get(topKey);
            
            // If top-level doesn't exist, initialize from defaults
            if (topValue === null || topValue === undefined) {
              topValue = JSON.parse(JSON.stringify((defaultStoreState as any)[topKey] || {}));
            }
            
            // Navigate to the nested property and set it
            let current = topValue;
            for (let i = 1; i < keys.length - 1; i++) {
              if (current[keys[i]] === undefined) {
                current[keys[i]] = {};
              }
              current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            
            // Save both dotted key (for Rust) and entire top-level object (for JS)
            await store.set(key, value);
            await store.set(topKey, topValue);
          }
          
          await store.save();
          console.log("[store:set]", key, value);
        } catch (error) {
          console.error("Store set error:", error);
        }
      },
      reset: async (): Promise<void> => {
        if (!isTauri) return;
        try {
          const Store = (await import("@tauri-apps/plugin-store")).Store;
          const store = await Store.load("config.json");
          await store.clear();
          await store.save();
        } catch (error) {
          console.error("Store reset error:", error);
        }
      },
      onStateChanged: (): void => {},
      onDidAnyChange: (): void => {}
    },
    memoryStore,
    safeStorage: {
      decryptString: (value: string) => value,
      encryptString: (value: string) => value as unknown as Buffer
    },
    openSettingsWindow: noop,
    restartApplication: noop,
    restartApplicationForUpdate: noop,
    getTrueFilePath: (file: File) => file.name,
    sendResult: noop,
    getAppName: async () => "",
    getCode: async () => "",
    switchFocus: noop,
    ytmViewNavigateDefault: noop,
    ytmViewRecreate: noop,
    minimizeWindow: noop,
    maximizeWindow: noop,
    restoreWindow: noop,
    closeWindow: noop,
    handleWindowEvents: (callback: (event: unknown, args: WindowState) => void): void => {
      callback(null, windowState);
    },
    requestWindowState: noop,
    getAppVersion: async () => "",
    checkForUpdates: noop,
    handleCheckingForUpdate: noop,
    handleUpdateAvailable: noop,
    handleUpdateNotAvailable: noop,
    handleUpdateDownloaded: noop,
    isAppUpdateAvailable: async () => false,
    isAppUpdateDownloaded: async () => false
  };

  // Internal implementations that can be updated after async init
  const impl = {
    minimizeWindow: noop,
    maximizeWindow: noop,
    restoreWindow: noop,
    closeWindow: noop,
    openSettingsWindow: noop,
    ytmViewNavigateDefault: noop,
    requestWindowState: noop as () => Promise<void>,
    handleWindowEvents: (callback: (event: unknown, args: WindowState) => void): void => {
      callback(null, windowState);
      pendingWindowEventHandlers.push(callback);
    }
  };

  // Proxy functions that always call the current implementation
  const pendingWindowEventHandlers: Array<(event: unknown, args: WindowState) => void> = [];

  ytmd.minimizeWindow = () => impl.minimizeWindow();
  ytmd.maximizeWindow = () => impl.maximizeWindow();
  ytmd.restoreWindow = () => impl.restoreWindow();
  ytmd.closeWindow = () => impl.closeWindow();
  ytmd.openSettingsWindow = () => impl.openSettingsWindow();
  ytmd.ytmViewNavigateDefault = () => impl.ytmViewNavigateDefault();
  ytmd.requestWindowState = () => impl.requestWindowState();
  ytmd.handleWindowEvents = (callback: (event: unknown, args: WindowState) => void) => impl.handleWindowEvents(callback);

  if (isTauri) {
    // Dynamic imports for Tauri APIs
    void (async () => {
      try {
        const { Window, getCurrentWindow } = await import("@tauri-apps/api/window");
        const { WebviewWindow, getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const { invoke } = await import("@tauri-apps/api/core");

        ytmd.isWindows = navigator.userAgent.includes("Windows");
        ytmd.isLinux = navigator.userAgent.includes("Linux");
        ytmd.isDarwin = navigator.userAgent.includes("Mac");

        // Get the main window for main window operations
        const mainWindow = new Window("main");
        // Get the current window/webview for close operation (so settings can close itself)
        const currentWindow = getCurrentWebviewWindow();
        const currentLabel = currentWindow.label;

        impl.minimizeWindow = () => {
          void mainWindow.minimize();
        };
        impl.maximizeWindow = () => {
          void mainWindow.maximize();
        };
        impl.restoreWindow = () => {
          void mainWindow.unmaximize();
        };
        impl.closeWindow = () => {
          // Close settings window if that's where we are; otherwise close main window
          if (currentLabel === "settings") {
            void currentWindow.close();
          } else {
            void mainWindow.close();
          }
        };

      // Open settings window
      impl.openSettingsWindow = async () => {
        const settingsUrl = (window as any).__TAURI__?.convertFileSrc
          ? "tauri://localhost/windows/settings/index.html"
          : "http://localhost:5173/windows/settings/index.html";
        
        try {
          const existingSettings = await WebviewWindow.getByLabel("settings");
          if (existingSettings) {
            await existingSettings.show();
            await existingSettings.setFocus();
            return;
          }
        } catch {
          // No existing settings window
        }

        new WebviewWindow("settings", {
          url: settingsUrl,
          title: "Settings",
          width: 800,
          height: 600,
          center: true,
          resizable: true,
          decorations: false
        });
      };

      // Navigate ytmview to default (home)
      impl.ytmViewNavigateDefault = () => {
        void invoke("ytmview_navigate_default");
      };

      impl.requestWindowState = async () => {
        windowState.maximized = await mainWindow.isMaximized();
        windowState.fullscreen = await mainWindow.isFullscreen();
      };

        impl.handleWindowEvents = (callback: (event: unknown, args: WindowState) => void): void => {
          void (async () => {
            windowState.maximized = await mainWindow.isMaximized();
            windowState.fullscreen = await mainWindow.isFullscreen();
            callback(null, { ...windowState });

            await mainWindow.listen("tauri://resize", async () => {
              windowState.maximized = await mainWindow.isMaximized();
              windowState.fullscreen = await mainWindow.isFullscreen();
              callback(null, { ...windowState });
            });

            await mainWindow.listen("tauri://unmaximize", () => {
              windowState.maximized = false;
              callback(null, { ...windowState });
            });

            await mainWindow.listen("tauri://maximize", () => {
              windowState.maximized = true;
              callback(null, { ...windowState });
            });
          })();
        };

        // Reattach any pending handlers that subscribed before Tauri APIs were ready
        pendingWindowEventHandlers.forEach(cb => impl.handleWindowEvents(cb));

        // Re-request window state now that handlers are ready
        void impl.requestWindowState();
      } catch (e) {
        console.error("Failed to initialize Tauri APIs:", e);
      }
    })();
  }

  window.ytmd = ytmd as Window["ytmd"];
}
