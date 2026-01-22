import { getCurrentWindow } from "@tauri-apps/api/window";

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
};

const noop = () => {};

const memoryState: MemoryStoreState = {
  ytmViewLoading: false,
  ytmViewLoadingError: false,
  ytmViewLoadTimedout: false,
  ytmViewLoadingStatus: "",
  ytmViewUnresponsive: false,
  appUpdateDownloaded: false
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

if (!("windowControlsOverlay" in window.navigator)) {
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

  const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

  // Using Record type for the shim object since it provides mock implementations
  // that don't fully match the Window["ytmd"] interface
  const ytmd: Record<string, unknown> = {
    isDarwin: false,
    isLinux: true,
    isWindows: false,
    store: {
      get: async (): Promise<unknown> => undefined,
      set: (): void => {},
      reset: (): void => {},
      onStateChanged: (): void => {}
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

  if (isTauri) {
    ytmd.isWindows = navigator.userAgent.includes("Windows");
    ytmd.isLinux = navigator.userAgent.includes("Linux");
    ytmd.isDarwin = navigator.userAgent.includes("Mac");

    const win = getCurrentWindow();

    ytmd.minimizeWindow = () => {
      void win.minimize();
    };
    ytmd.maximizeWindow = () => {
      void win.maximize();
    };
    ytmd.restoreWindow = () => {
      void win.unmaximize();
    };
    ytmd.closeWindow = () => {
      void win.close();
    };

    ytmd.requestWindowState = async () => {
      windowState.maximized = await win.isMaximized();
      windowState.fullscreen = await win.isFullscreen();
    };

    ytmd.handleWindowEvents = (callback: (event: unknown, args: WindowState) => void): void => {
      void (async () => {
        windowState.maximized = await win.isMaximized();
        windowState.fullscreen = await win.isFullscreen();
        callback(null, { ...windowState });

        await win.listen("tauri://resize", async () => {
          windowState.maximized = await win.isMaximized();
          windowState.fullscreen = await win.isFullscreen();
          callback(null, { ...windowState });
        });

        await win.listen("tauri://unmaximize", () => {
          windowState.maximized = false;
          callback(null, { ...windowState });
        });

        await win.listen("tauri://maximize", () => {
          windowState.maximized = true;
          callback(null, { ...windowState });
        });
      })();
    };
  }

  window.ytmd = ytmd as Window["ytmd"];
}
