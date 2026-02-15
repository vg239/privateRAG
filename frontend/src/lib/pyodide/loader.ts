import type { LoadProgress } from "./types";

// Pyodide types (loaded from CDN, so we define minimal types)
export interface PyodideInterface {
  runPythonAsync(code: string): Promise<unknown>;
  loadPackage(packages: string[]): Promise<void>;
  pyimport(name: string): unknown;
  globals: {
    get(name: string): unknown;
    set(name: string, value: unknown): void;
  };
}

// Singleton state - module level to persist across re-renders
let pyodideInstance: PyodideInterface | null = null;
let initPromise: Promise<PyodideInterface> | null = null;
let isInitializing = false;

// Pyodide CDN URL
const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/";

/**
 * Load Pyodide script from CDN (only once)
 */
let scriptLoaded = false;
let scriptLoadPromise: Promise<void> | null = null;

async function loadPyodideScript(): Promise<void> {
  // Already loaded
  if (scriptLoaded && (window as unknown as Record<string, unknown>).loadPyodide) {
    return;
  }

  // Loading in progress
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    // Check if already in DOM
    if ((window as unknown as Record<string, unknown>).loadPyodide) {
      scriptLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `${PYODIDE_CDN}pyodide.js`;
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error("Failed to load Pyodide script from CDN"));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export async function initPyodide(
  onProgress?: (p: LoadProgress) => void
): Promise<PyodideInterface> {
  // Return existing instance if available
  if (pyodideInstance) {
    onProgress?.({ stage: "ready", message: "Pyodide ready", progress: 100 });
    return pyodideInstance;
  }

  // Return existing promise if initialization is in progress
  if (initPromise) {
    return initPromise;
  }

  // Prevent multiple simultaneous init attempts
  if (isInitializing) {
    // Wait a bit and check again
    await new Promise(resolve => setTimeout(resolve, 100));
    if (pyodideInstance) return pyodideInstance;
    if (initPromise) return initPromise;
  }

  isInitializing = true;

  // Start initialization
  initPromise = (async () => {
    try {
      onProgress?.({ stage: "loading", message: "Loading Pyodide script...", progress: 10 });

      // Load Pyodide script from CDN
      await loadPyodideScript();

      onProgress?.({ stage: "loading", message: "Initializing Python runtime...", progress: 30 });

      // Initialize Pyodide
      const loadPyodideFn = (window as unknown as Record<string, (config: { indexURL: string }) => Promise<PyodideInterface>>).loadPyodide;
      
      if (!loadPyodideFn) {
        throw new Error("loadPyodide function not found after script load");
      }

      const pyodide = await loadPyodideFn({
        indexURL: PYODIDE_CDN,
      });

      onProgress?.({ stage: "packages", message: "Loading micropip...", progress: 50 });

      // Load micropip for package installation
      await pyodide.loadPackage(["micropip"]);

      onProgress?.({ stage: "packages", message: "Installing pypdf (pure Python PDF parser)...", progress: 70 });
      
      // Install pypdf - a pure Python PDF library that works in Pyodide
      // Note: PyMuPDF doesn't work because it has C extensions
      const micropip = pyodide.pyimport("micropip") as { install: (pkg: string | string[]) => Promise<void> };
      await micropip.install("pypdf");

      onProgress?.({ stage: "ready", message: "Python runtime ready!", progress: 100 });

      // Store instance BEFORE returning
      pyodideInstance = pyodide;
      isInitializing = false;
      
      return pyodide;

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onProgress?.({ stage: "error", message: `Initialization failed: ${message}` });
      
      // Reset state on error so user can retry
      initPromise = null;
      isInitializing = false;
      
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Get the current Pyodide instance (or null if not initialized)
 */
export function getPyodide(): PyodideInterface | null {
  return pyodideInstance;
}

/**
 * Check if Pyodide is initialized
 */
export function isPyodideReady(): boolean {
  return pyodideInstance !== null;
}

/**
 * Check if Pyodide is currently initializing
 */
export function isPyodideInitializing(): boolean {
  return isInitializing;
}
