import { useState, useEffect, useRef, useCallback } from "react";
import { initPyodide, isPyodideReady, isPyodideInitializing, type LoadProgress } from "../lib/pyodide";

type UsePyodideReturn = {
  isReady: boolean;
  isLoading: boolean;
  progress: LoadProgress;
  error: string | null;
  initialize: () => Promise<void>;
};

/**
 * Hook to manage Pyodide initialization.
 * 
 * @param autoInit - Whether to automatically initialize on mount (default: true)
 */
export function usePyodide(autoInit = true): UsePyodideReturn {
  const [isReady, setIsReady] = useState(isPyodideReady());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<LoadProgress>({
    stage: "loading",
    message: "Not started",
    progress: 0,
  });

  // Use ref to track if we've already started initialization
  const initStartedRef = useRef(false);
  const mountedRef = useRef(true);

  const initialize = useCallback(async () => {
    // Already ready - nothing to do
    if (isPyodideReady()) {
      setIsReady(true);
      setProgress({ stage: "ready", message: "Pyodide ready", progress: 100 });
      return;
    }

    // Already initializing (either by us or another call)
    if (isPyodideInitializing() || initStartedRef.current) {
      return;
    }

    // Mark that we started initialization
    initStartedRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      await initPyodide((p) => {
        // Only update state if still mounted
        if (mountedRef.current) {
          setProgress(p);
          if (p.stage === "error") {
            setError(p.message);
          }
        }
      });
      
      if (mountedRef.current) {
        setIsReady(true);
      }
    } catch (err) {
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setProgress({ stage: "error", message });
      }
      // Reset so user can retry
      initStartedRef.current = false;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Auto-initialize on mount (only once)
  useEffect(() => {
    mountedRef.current = true;

    if (autoInit && !isPyodideReady() && !initStartedRef.current) {
      initialize();
    }

    return () => {
      mountedRef.current = false;
    };
  }, []); // Empty deps - only run on mount

  return {
    isReady,
    isLoading,
    progress,
    error,
    initialize,
  };
}
