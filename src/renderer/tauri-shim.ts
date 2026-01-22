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
      get: async (key: string): Promise<unknown> => (defaultStoreState as Record<string, unknown>)[key],
      set: (): void => {},
      reset: (): void => {},
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
    }
  };

  // Proxy functions that always call the current implementation
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
        // Close the current window (main or settings)
        void currentWindow.close();
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

      // Re-request window state now that handlers are ready
      ytmd.requestWindowState();
      } catch (e) {
        console.error("Failed to initialize Tauri APIs:", e);
      }
    })();
  }

  window.ytmd = ytmd as Window["ytmd"];
}
