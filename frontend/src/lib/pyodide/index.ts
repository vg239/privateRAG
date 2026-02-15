

export { initPyodide, getPyodide, isPyodideReady, isPyodideInitializing } from "./loader";
export { 
  generateTOC, 
  isEnhancedProcessingAvailable,
  setupNearAI,
  type GenerateTOCOptions,
} from "./pageindex";
export type { PyodideInterface } from "./loader";
export type {
  TOCNode,
  TOCResult,
  LoadProgress,
  IndexingProgress,
} from "./types";
