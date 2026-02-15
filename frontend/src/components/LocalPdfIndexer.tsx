
import { useRef, useState, useCallback } from "react";
import { usePyodide } from "../hooks/usePyodide";
import {
  generateTOC,
  type TOCResult,
  type IndexingProgress
} from "../lib/pyodide";
import "./LocalPdfIndexer.css";



type Props = {
  onTOCGenerated: (toc: TOCResult, file: File) => void;
  onProgress?: (progress: IndexingProgress) => void;
};

// Local storage key for API key
const API_KEY_STORAGE_KEY = "to_be_put_by_the_user";

export function LocalPdfIndexer({ onTOCGenerated, onProgress }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);
  const { isReady: pyodideReady, isLoading: pyodideLoading, progress: pyodideProgress, error: pyodideError } = usePyodide(true);

  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingProgress, setIndexingProgress] = useState<IndexingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // API Key state
  const [apiKey, setApiKey] = useState<string>(() => {
    // Load from localStorage on init
    if (typeof window !== "undefined") {
      return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
    }
    return "";
  });
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [useEnhancedMode, setUseEnhancedMode] = useState(true);

  // Save API key to localStorage
  const saveApiKey = useCallback((key: string) => {
    setApiKey(key);
    if (key) {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  }, []);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;

    const file = files[0];

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }

    const MAX_SIZE = 25 * 1024 * 1024; // 25MB limit for browser processing
    if (file.size > MAX_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      setError(`File too large (${sizeMB}MB). Maximum size is 25MB for client-side processing.`);
      return;
    }

    if (isIndexing) return;

    setError(null);
    setIsIndexing(true);

    try {
      const toc = await generateTOC(
        file,
        (p) => {
          setIndexingProgress(p);
          onProgress?.(p);
        },
        {
          apiKey: useEnhancedMode && apiKey ? apiKey : undefined,
          generateSummaries: true,
        }
      );

      onTOCGenerated(toc, file);

    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate TOC";
      setError(message);
      console.error("TOC generation error:", err);
    } finally {
      setIsIndexing(false);
      setIndexingProgress(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }, [isIndexing, onProgress, onTOCGenerated, useEnhancedMode, apiKey]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const isDisabled = !pyodideReady || isIndexing;
  const currentProgress = indexingProgress || pyodideProgress;
  const showProgress = pyodideLoading || isIndexing;
  const hasApiKey = apiKey.length > 0;

  return (
    <div className="pdf-indexer">
      {/* Drop Zone */}
      <div
        ref={dropZoneRef}
        className={`drop-zone ${isDragging ? "dragging" : ""} ${isDisabled ? "disabled" : ""}`}
        onClick={() => !isDisabled && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {showProgress ? (
          <div className="progress-state">
            <div className="progress-spinner" />
            <span className="progress-text">{currentProgress.message}</span>
            {typeof currentProgress.progress === "number" && (
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${currentProgress.progress}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="upload-state nova-theme">
            <div className="nova-card">

              <div className="nova-logo-wrapper">
                <img src="NOVA.ico" className="nova-logo" alt="NOVA Logo" />
              </div>

              <span className="upload-text nova-title">
                Upload Securely to NOVA
              </span>

              <span className="upload-subhint">
                Max 25MB • Encrypted • Decentralized
              </span>

            </div>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* NEAR AI Mode Toggle */}
      <div className="mode-toggle">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={useEnhancedMode}
            onChange={(e) => setUseEnhancedMode(e.target.checked)}
            disabled={isIndexing}
          />
          <span className="toggle-text">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            AI-Enhanced (NEAR AI TEE)
          </span>
        </label>

        {useEnhancedMode && (
          <div className="api-key-section">
            {hasApiKey ? (
              <div className="api-key-status">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>API key configured</span>
                <button
                  className="api-key-edit"
                  onClick={(e) => { e.stopPropagation(); setShowApiKeyInput(true); }}
                >
                  Edit
                </button>
              </div>
            ) : (
              <button
                className="api-key-setup"
                onClick={(e) => { e.stopPropagation(); setShowApiKeyInput(true); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
                Set up NEAR AI API Key
              </button>
            )}

            {showApiKeyInput && (
              <div className="api-key-modal" onClick={() => setShowApiKeyInput(false)}>
                <div className="api-key-modal-content" onClick={(e) => e.stopPropagation()}>
                  <h3>NEAR AI API Key</h3>
                  <p className="api-key-description">
                    Your API key is used to access NEAR AI's Trusted Execution Environment (TEE)
                    for private document analysis. The key is stored locally in your browser.
                  </p>
                  <input
                    type="password"
                    className="api-key-input"
                    placeholder="Enter your NEAR AI API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoFocus
                  />
                  <div className="api-key-actions">
                    <button
                      className="api-key-clear"
                      onClick={() => { saveApiKey(""); setShowApiKeyInput(false); }}
                    >
                      Clear
                    </button>
                    <button
                      className="api-key-save"
                      onClick={() => { saveApiKey(apiKey); setShowApiKeyInput(false); }}
                    >
                      Save
                    </button>
                  </div>
                  <p className="api-key-hint">
                    Get your API key at <a href="https://app.near.ai" target="_blank" rel="noopener noreferrer">app.near.ai</a>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {useEnhancedMode && hasApiKey && (
          <span className="mode-hint">
            Uses NEAR AI TEE for intelligent structure extraction
          </span>
        )}
        {useEnhancedMode && !hasApiKey && (
          <span className="mode-hint warning">
            API key required for AI-enhanced mode
          </span>
        )}
        {!useEnhancedMode && (
          <span className="mode-hint">
            Basic PDF outline extraction only
          </span>
        )}
      </div>

      {(error || pyodideError) && (
        <div className="error-msg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>{error || pyodideError}</span>
        </div>
      )}
    </div>
  );
}
