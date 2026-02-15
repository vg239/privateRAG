
import { initPyodide } from "./loader";
import type { TOCResult, TOCNode, IndexingProgress, LoadProgress } from "./types";
import {
  initNearAI,
  isNearAIReady,
  getNearAIClient,
  NEAR_AI_CONFIG,
} from "../nearai";
import {
  processPageIndex,
  addTextPreviews,
  type PageData,
  type PageIndexNode,
} from "../pageindex";

/**
 * Python code to extract text and basic TOC from PDF using pypdf
 */
const EXTRACT_PDF_DATA_PYTHON = `
import json
from io import BytesIO
from pypdf import PdfReader

def extract_text_from_page(page, page_num):
    """
    Extract text from a PDF page with multiple fallback methods.
    """
    text = ""
    
    # Method 1: Standard text extraction
    try:
        text = page.extract_text() or ""
    except Exception as e:
        pass
    
    # Method 2: Try with different extraction modes if available
    if not text.strip():
        try:
            text = page.extract_text(extraction_mode="layout") or ""
        except Exception:
            pass
    
    # Clean up the text
    if text:
        text = ' '.join(text.split())
        return text
    
    return ""


def extract_pdf_data(pdf_bytes, filename):
    """
    Extract page text and basic TOC from PDF bytes using pypdf.
    Returns page data for further processing.
    """
    pdf_stream = BytesIO(bytes(pdf_bytes))
    reader = PdfReader(pdf_stream)
    
    num_pages = len(reader.pages)
    pages = []
    
    # Extract text from each page
    for i in range(num_pages):
        page = reader.pages[i]
        text = extract_text_from_page(page, i + 1)
        pages.append({
            "pageNumber": i + 1,
            "text": text,
            "tokenCount": len(text) // 4  # Rough token estimate
        })
    
    # Try to get the outline (TOC) from PDF metadata
    basic_structure = []
    has_outline = False
    
    try:
        outline = reader.outline
        if outline and len(outline) > 0:
            basic_structure = parse_outline(outline, reader)
            if basic_structure:
                has_outline = True
    except Exception as e:
        print(f"Outline extraction error: {e}")
    
    # If no outline, create basic page structure
    if not has_outline:
        for i in range(num_pages):
            text = pages[i]["text"]
            title = f"Page {i + 1}"
            if text:
                first_line = text.split('\\n')[0].strip()[:80]
                if first_line and len(first_line) > 5:
                    title = f"Page {i + 1}: {first_line}"
            
            basic_structure.append({
                "title": title,
                "start_index": i + 1,
                "end_index": i + 1,
                "text_preview": text[:500] if text else f"[Page {i + 1}]",
            })
    
    return {
        "doc_name": filename,
        "num_pages": num_pages,
        "pages": pages,
        "basic_structure": basic_structure,
        "has_outline": has_outline,
    }


def parse_outline(outline, reader, level=1):
    """
    Recursively parse PDF outline (bookmarks) into structure.
    """
    result = []
    
    for item in outline:
        if isinstance(item, list):
            if result:
                children = parse_outline(item, reader, level + 1)
                if children:
                    result[-1]["nodes"] = children
        else:
            try:
                title = ""
                if hasattr(item, 'title'):
                    title = item.title
                elif isinstance(item, dict) and 'title' in item:
                    title = item['title']
                else:
                    title = str(item)
                
                page_num = 1
                try:
                    if hasattr(item, 'page'):
                        page_ref = item.page
                        if page_ref is not None:
                            for idx, page in enumerate(reader.pages):
                                try:
                                    page_id = id(page.get_object()) if hasattr(page, 'get_object') else id(page)
                                    ref_id = id(page_ref.get_object()) if hasattr(page_ref, 'get_object') else id(page_ref)
                                    if page_id == ref_id:
                                        page_num = idx + 1
                                        break
                                except:
                                    pass
                except Exception:
                    pass
                
                if title:
                    node = {
                        "title": title.strip()[:100],
                        "start_index": page_num,
                        "end_index": page_num,
                    }
                    result.append(node)
            except Exception as e:
                print(f"Error parsing outline item: {e}")
    
    return result


# Main execution
result = extract_pdf_data(pdf_bytes, filename)
json.dumps(result)
`;

/**
 * Calculate SHA256 hash of file bytes
 */
async function calculateDocHash(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Convert PageIndexNode to TOCNode format
 */
function convertToTOCNode(node: PageIndexNode, level = 1): TOCNode {
  const tocNode: TOCNode = {
    title: node.title,
    level,
    start_index: node.start_index,
    end_index: node.end_index,
    text_preview: node.text_preview,
    summary: node.summary,
    node_id: node.node_id,
  };

  if (node.nodes && node.nodes.length > 0) {
    tocNode.nodes = node.nodes.map(child => convertToTOCNode(child, level + 1));
  }

  return tocNode;
}

/**
 * Add text previews to basic structure from pages
 */
function addTextPreviewsToBasicStructure(structure: TOCNode[], pages: PageData[]): void {
  for (const node of structure) {
    const page = pages.find(p => p.pageNumber === node.start_index);
    if (page && !node.text_preview) {
      node.text_preview = page.text.slice(0, 500);
    }
    if (node.nodes) {
      addTextPreviewsToBasicStructure(node.nodes, pages);
    }
  }
}

/**
 * Options for TOC generation
 */
export interface GenerateTOCOptions {
  /** NEAR AI API key (required for enhanced processing) */
  apiKey?: string;
  /** Model to use for processing */
  model?: string;
  /** Whether to generate summaries (slower but more informative) */
  generateSummaries?: boolean;
}

/**
 * Generate TOC from a PDF file.
 * 
 * This runs with maximum privacy:
 * - PDF text extraction happens client-side (Pyodide/pypdf)
 * - Structure analysis uses NEAR AI TEE (if API key provided)
 * - Falls back to basic extraction if no API key
 * 
 * @param pdfFile - The PDF file to process
 * @param onProgress - Optional progress callback
 * @param options - Processing options including API key
 * @returns TOCResult with document structure
 */
export async function generateTOC(
  pdfFile: File,
  onProgress?: (p: IndexingProgress) => void,
  options: GenerateTOCOptions = {}
): Promise<TOCResult> {
  const {
    apiKey,
    model = NEAR_AI_CONFIG.defaultModel,
    generateSummaries = true,
  } = options;

  // Step 1: Initialize Pyodide
  onProgress?.({ stage: "init", message: "Initializing Python runtime...", progress: 5 });
  
  const pyodide = await initPyodide((p: LoadProgress) => {
    if (p.stage === "loading" || p.stage === "packages") {
      onProgress?.({ stage: "init", message: p.message, progress: p.progress ? p.progress * 0.2 : 5 });
    }
  });

  // Step 2: Read and hash PDF
  onProgress?.({ stage: "parsing", message: "Reading PDF file...", progress: 25 });
  
  const arrayBuffer = await pdfFile.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  onProgress?.({ stage: "parsing", message: "Calculating document hash...", progress: 28 });
  const docHash = await calculateDocHash(bytes);

  // Step 3: Extract PDF data with pypdf
  onProgress?.({ stage: "extracting", message: "Extracting text from PDF...", progress: 30 });
  
  pyodide.globals.set("pdf_bytes", bytes);
  pyodide.globals.set("filename", pdfFile.name);

  const resultJson = await pyodide.runPythonAsync(EXTRACT_PDF_DATA_PYTHON) as string;
  const pdfData = JSON.parse(resultJson) as {
    doc_name: string;
    num_pages: number;
    pages: PageData[];
    basic_structure: TOCNode[];
    has_outline: boolean;
  };

  console.log(`[PageIndex] Extracted ${pdfData.num_pages} pages, has_outline: ${pdfData.has_outline}`);

  // Step 4: Process with NEAR AI if API key provided
  let structure: TOCNode[] = pdfData.basic_structure;
  let usedNearAI = false;

  if (apiKey) {
    try {
      // Initialize NEAR AI client
      onProgress?.({ stage: "init", message: "Connecting to NEAR AI TEE...", progress: 35 });
      initNearAI(apiKey, { model });

      // Test connection
      const client = getNearAIClient();
      if (client) {
        onProgress?.({ stage: "extracting", message: "Analyzing document structure with AI...", progress: 40 });
        
        const pageIndexResult = await processPageIndex(
          pdfData.pages,
          {
            generateSummaries,
            addNodeIds: true,
          },
          (_stage, message, progress) => {
            // Map progress from 0-100 to 40-95
            const mappedProgress = 40 + (progress * 0.55);
            onProgress?.({
              stage: "extracting",
              message,
              progress: mappedProgress,
            });
          }
        );

        if (pageIndexResult.length > 0) {
          // Add text previews
          addTextPreviews(pageIndexResult, pdfData.pages);
          
          // Convert to TOCNode format
          structure = pageIndexResult.map(node => convertToTOCNode(node));
          usedNearAI = true;
          console.log(`[PageIndex] NEAR AI generated ${structure.length} top-level nodes`);
        }
      }
    } catch (error) {
      console.warn("[PageIndex] NEAR AI processing failed, using basic extraction:", error);
      // Fall through to use basic_structure
    }
  } else {
    console.log("[PageIndex] No API key provided, using basic extraction");
  }

  // Add text previews to basic structure if not using NEAR AI
  if (!usedNearAI) {
    addTextPreviewsToBasicStructure(structure, pdfData.pages);
  }

  onProgress?.({ stage: "complete", message: "TOC generation complete!", progress: 100 });

  return {
    doc_name: pdfData.doc_name,
    doc_hash: docHash,
    num_pages: pdfData.num_pages,
    structure,
    needs_llm_enhancement: !usedNearAI && !pdfData.has_outline,
  };
}

/**
 * Check if NEAR AI enhanced processing is available
 */
export function isEnhancedProcessingAvailable(): boolean {
  return isNearAIReady();
}

/**
 * Initialize NEAR AI for enhanced processing
 */
export function setupNearAI(apiKey: string, model?: string): void {
  initNearAI(apiKey, { model });
}

/**
 * Re-export types for convenience
 */
export type { TOCResult, TOCNode, IndexingProgress };
