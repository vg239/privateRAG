export type TOCNode = {
  title: string;
  level: number;
  start_index: number;
  end_index: number;
  text_preview?: string;
  summary?: string;
  node_id?: string;
  /** Child sections (subsections, sub-chapters, etc.) */
  nodes?: TOCNode[];
};

export type TOCResult = {
  doc_name: string;
  doc_hash: string;
  num_pages: number;
  structure: TOCNode[];
  needs_llm_enhancement?: boolean;
  doc_description?: string;
};

/**
 * Progress update during Pyodide/WebLLM loading
 */
export type LoadProgress = {
  stage: "loading" | "packages" | "ready" | "error";
  message: string;
  progress?: number;
};

/**
 * Progress update during document indexing
 */
export type IndexingProgress = {
  stage: "init" | "parsing" | "extracting" | "complete" | "error";
  message: string;
  progress?: number;
};

