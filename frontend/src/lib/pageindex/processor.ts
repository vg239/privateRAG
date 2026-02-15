
import {
  NearAIClient,
  extractJSON,
  isNearAIReady,
  getNearAIClient,
} from "../nearai";
import {
  TOC_DETECTOR_PROMPT,
  DETECT_PAGE_INDEX_PROMPT,
  TOC_TRANSFORMER_PROMPT,
  GENERATE_TOC_INIT_PROMPT,
  GENERATE_TOC_CONTINUE_PROMPT,
  TOC_INDEX_EXTRACTOR_PROMPT,
  CHECK_TITLE_APPEARANCE_PROMPT,
  SINGLE_TOC_ITEM_INDEX_FIXER_PROMPT,
  GENERATE_NODE_SUMMARY_PROMPT,
  GENERATE_DOC_DESCRIPTION_PROMPT,
  fillPrompt,
  transformDotsToColon,
} from "./prompts";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Page data with text and token count
 */
export interface PageData {
  pageNumber: number;
  text: string;
  tokenCount: number;
}

/**
 * Raw TOC item from LLM response
 */
interface RawTOCItem {
  structure: string | null;
  title: string;
  page?: number | null;
  physical_index?: number | string | null;
  list_index?: number;
  start?: string;
  appear_start?: string;
}

/**
 * PageIndex node in the final tree structure
 */
export interface PageIndexNode {
  title: string;
  node_id?: string;
  start_index: number;
  end_index: number;
  summary?: string;
  text?: string;
  text_preview?: string;
  nodes?: PageIndexNode[];
}

/**
 * Progress callback for PageIndex processing
 */
export type PageIndexProgressCallback = (stage: string, message: string, progress: number) => void;

/**
 * Configuration for PageIndex processing
 */
export interface PageIndexConfig {
  /** Maximum tokens per chunk sent to LLM */
  maxTokensPerChunk: number;
  /** Number of pages to check for TOC */
  tocCheckPages: number;
  /** Maximum pages per node before splitting */
  maxPagesPerNode: number;
  /** Maximum tokens per node before splitting */
  maxTokensPerNode: number;
  /** Whether to generate summaries */
  generateSummaries: boolean;
  /** Whether to add node IDs */
  addNodeIds: boolean;
  /** Whether to add document description */
  addDocDescription: boolean;
}

const DEFAULT_CONFIG: PageIndexConfig = {
  maxTokensPerChunk: 15000,
  tocCheckPages: 10,
  maxPagesPerNode: 30,
  maxTokensPerNode: 20000,
  generateSummaries: true,
  addNodeIds: true,
  addDocDescription: true,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Estimate token count for text (~4 characters per token for English)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get the NEAR AI client or throw if not initialized
 */
function getClient(): NearAIClient {
  const client = getNearAIClient();
  if (!client) {
    throw new Error("NEAR AI client not initialized. Call initNearAI() first.");
  }
  return client;
}

/**
 * Convert physical_index string to integer
 * e.g., "<physical_index_5>" -> 5
 */
function convertPhysicalIndexToInt(data: string | number | null | undefined): number | null {
  if (data === null || data === undefined) return null;
  if (typeof data === 'number') return data;
  if (typeof data === 'string') {
    if (data.startsWith('<physical_index_')) {
      const match = data.match(/<physical_index_(\d+)>/);
      return match ? parseInt(match[1], 10) : null;
    }
    if (data.startsWith('physical_index_')) {
      const match = data.match(/physical_index_(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    }
    const num = parseInt(data, 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Convert page string to integer
 */
function convertPageToInt(page: string | number | null | undefined): number | null {
  if (page === null || page === undefined) return null;
  if (typeof page === 'number') return page;
  const num = parseInt(page, 10);
  return isNaN(num) ? null : num;
}

/**
 * Group pages into chunks that fit within token limit
 */
function pageListToGroupText(
  pageContents: string[],
  tokenLengths: number[],
  maxTokens: number = 15000,
  overlapPage: number = 1
): string[] {
  const numTokens = tokenLengths.reduce((a, b) => a + b, 0);
  
  if (numTokens <= maxTokens) {
    return [pageContents.join('')];
  }
  
  const subsets: string[] = [];
  let currentSubset: string[] = [];
  let currentTokenCount = 0;
  
  const expectedPartsNum = Math.ceil(numTokens / maxTokens);
  const averageTokensPerPart = Math.ceil(((numTokens / expectedPartsNum) + maxTokens) / 2);
  
  for (let i = 0; i < pageContents.length; i++) {
    const pageContent = pageContents[i];
    const pageTokens = tokenLengths[i];
    
    if (currentTokenCount + pageTokens > averageTokensPerPart && currentSubset.length > 0) {
      subsets.push(currentSubset.join(''));
      // Start new subset from overlap
      const overlapStart = Math.max(i - overlapPage, 0);
      currentSubset = pageContents.slice(overlapStart, i);
      currentTokenCount = tokenLengths.slice(overlapStart, i).reduce((a, b) => a + b, 0);
    }
    
    currentSubset.push(pageContent);
    currentTokenCount += pageTokens;
  }
  
  if (currentSubset.length > 0) {
    subsets.push(currentSubset.join(''));
  }
  
  console.log(`[PageIndex] Divided pages into ${subsets.length} groups`);
  return subsets;
}

// ============================================================================
// TOC DETECTION
// ============================================================================

/**
 * Detect if a single page contains a Table of Contents
 */
async function tocDetectorSinglePage(content: string): Promise<boolean> {
  const client = getClient();
  const prompt = fillPrompt(TOC_DETECTOR_PROMPT, { content: content.slice(0, 4000) });
  
  try {
    const response = await client.prompt(prompt, { maxTokens: 256 });
    const result = extractJSON<{ toc_detected: string }>(response);
    return result?.toc_detected?.toLowerCase() === 'yes';
  } catch (error) {
    console.warn('[PageIndex] TOC detection failed:', error);
    return false;
  }
}

/**
 * Find pages that contain TOC
 */
async function findTocPages(
  pages: PageData[],
  config: PageIndexConfig,
  onProgress?: PageIndexProgressCallback
): Promise<number[]> {
  const tocPageList: number[] = [];
  let lastPageIsToc = false;
  
  for (let i = 0; i < Math.min(pages.length, config.tocCheckPages); i++) {
    onProgress?.('detecting', `Checking page ${i + 1} for TOC...`, 15 + (i / config.tocCheckPages) * 10);
    
    const isToc = await tocDetectorSinglePage(pages[i].text);
    
    if (isToc) {
      console.log(`[PageIndex] Page ${i + 1} has TOC`);
      tocPageList.push(i);
      lastPageIsToc = true;
    } else if (lastPageIsToc) {
      // Stop when we find a non-TOC page after TOC pages
      console.log(`[PageIndex] Found last TOC page: ${i}`);
      break;
    }
  }
  
  return tocPageList;
}

/**
 * Detect if page numbers are given in the TOC
 */
async function detectPageIndex(tocContent: string): Promise<boolean> {
  const client = getClient();
  const prompt = fillPrompt(DETECT_PAGE_INDEX_PROMPT, { toc_content: tocContent.slice(0, 4000) });
  
  try {
    const response = await client.prompt(prompt, { maxTokens: 256 });
    const result = extractJSON<{ page_index_given_in_toc: string }>(response);
    return result?.page_index_given_in_toc?.toLowerCase() === 'yes';
  } catch (error) {
    console.warn('[PageIndex] Page index detection failed:', error);
    return false;
  }
}

/**
 * Extract TOC content from pages
 */
function tocExtractor(pages: PageData[], tocPageList: number[]): { tocContent: string; hasPageIndex: boolean } {
  let tocContent = '';
  for (const pageIndex of tocPageList) {
    tocContent += pages[pageIndex].text + '\n';
  }
  tocContent = transformDotsToColon(tocContent);
  
  return {
    tocContent,
    hasPageIndex: false, // Will be detected separately
  };
}

// ============================================================================
// TOC TRANSFORMATION
// ============================================================================

/**
 * Transform raw TOC text into structured JSON
 */
async function tocTransformer(tocContent: string): Promise<RawTOCItem[]> {
  const client = getClient();
  const prompt = fillPrompt(TOC_TRANSFORMER_PROMPT, { toc_content: tocContent });
  
  try {
    const response = await client.prompt(prompt, { maxTokens: 4096 });
    const result = extractJSON<{ table_of_contents: RawTOCItem[] }>(response);
    
    if (result?.table_of_contents) {
      // Convert page to int
      return result.table_of_contents.map(item => ({
        ...item,
        page: convertPageToInt(item.page),
      }));
    }
    return [];
  } catch (error) {
    console.warn('[PageIndex] TOC transformation failed:', error);
    return [];
  }
}

// ============================================================================
// TOC GENERATION (when no embedded TOC exists)
// ============================================================================

/**
 * Generate initial TOC structure from document text
 */
async function generateTocInit(part: string): Promise<RawTOCItem[]> {
  const client = getClient();
  const prompt = fillPrompt(GENERATE_TOC_INIT_PROMPT, { text: part });
  
  try {
    const response = await client.prompt(prompt, { maxTokens: 4096 });
    const result = extractJSON<RawTOCItem[]>(response);
    return result || [];
  } catch (error) {
    console.warn('[PageIndex] Initial TOC generation failed:', error);
    return [];
  }
}

/**
 * Continue generating TOC structure for subsequent pages
 */
async function generateTocContinue(tocContent: RawTOCItem[], part: string): Promise<RawTOCItem[]> {
  const client = getClient();
  const prompt = fillPrompt(GENERATE_TOC_CONTINUE_PROMPT, {
    text: part,
    previous_structure: JSON.stringify(tocContent.slice(-10), null, 2),
  });
  
  try {
    const response = await client.prompt(prompt, { maxTokens: 4096 });
    const result = extractJSON<RawTOCItem[]>(response);
    return result || [];
  } catch (error) {
    console.warn('[PageIndex] TOC continuation failed:', error);
    return [];
  }
}

/**
 * Process document without TOC - generate structure from text
 */
async function processNoToc(
  pages: PageData[],
  config: PageIndexConfig,
  startIndex: number = 1,
  onProgress?: PageIndexProgressCallback
): Promise<RawTOCItem[]> {
  // Build page contents with physical index tags
  const pageContents: string[] = [];
  const tokenLengths: number[] = [];
  
  for (let i = 0; i < pages.length; i++) {
    const pageIndex = startIndex + i;
    const pageText = `<physical_index_${pageIndex}>\n${pages[i].text}\n<physical_index_${pageIndex}>\n\n`;
    pageContents.push(pageText);
    tokenLengths.push(estimateTokens(pageText));
  }
  
  const groupTexts = pageListToGroupText(pageContents, tokenLengths, config.maxTokensPerChunk);
  console.log(`[PageIndex] Processing ${groupTexts.length} text groups`);
  
  onProgress?.('generating', `Analyzing ${groupTexts.length} text chunks...`, 35);
  
  // Generate initial TOC from first group
  let tocWithPageNumber = await generateTocInit(groupTexts[0]);
  onProgress?.('generating', `Analyzed chunk 1/${groupTexts.length}...`, 40);
  
  // Continue with remaining groups
  for (let i = 1; i < groupTexts.length; i++) {
    const progress = 40 + (i / groupTexts.length) * 25;
    onProgress?.('generating', `Analyzing chunk ${i + 1}/${groupTexts.length}...`, progress);
    
    const additional = await generateTocContinue(tocWithPageNumber, groupTexts[i]);
    tocWithPageNumber.push(...additional);
  }
  
  // Convert physical_index strings to integers
  tocWithPageNumber = tocWithPageNumber.map(item => ({
    ...item,
    physical_index: convertPhysicalIndexToInt(item.physical_index),
  }));
  
  console.log(`[PageIndex] Generated ${tocWithPageNumber.length} TOC items`);
  return tocWithPageNumber;
}

// ============================================================================
// TOC WITH PAGE NUMBERS PROCESSING
// ============================================================================

/**
 * Extract physical indices for TOC items
 */
async function tocIndexExtractor(toc: RawTOCItem[], content: string): Promise<RawTOCItem[]> {
  const client = getClient();
  const prompt = fillPrompt(TOC_INDEX_EXTRACTOR_PROMPT, {
    toc: JSON.stringify(toc, null, 2),
    content,
  });
  
  try {
    const response = await client.prompt(prompt, { maxTokens: 4096 });
    const result = extractJSON<RawTOCItem[]>(response);
    return result || [];
  } catch (error) {
    console.warn('[PageIndex] TOC index extraction failed:', error);
    return [];
  }
}

/**
 * Calculate page offset between TOC page numbers and physical indices
 */
function calculatePageOffset(pairs: Array<{ page: number | null; physical_index: number | null }>): number | null {
  const differences: number[] = [];
  
  for (const pair of pairs) {
    if (pair.physical_index !== null && pair.page !== null) {
      differences.push(pair.physical_index - pair.page);
    }
  }
  
  if (differences.length === 0) return null;
  
  // Find most common difference
  const counts = new Map<number, number>();
  for (const diff of differences) {
    counts.set(diff, (counts.get(diff) || 0) + 1);
  }
  
  let maxCount = 0;
  let mostCommon = 0;
  for (const [diff, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = diff;
    }
  }
  
  return mostCommon;
}

/**
 * Process TOC with page numbers
 */
async function processTocWithPageNumbers(
  tocContent: string,
  tocPageList: number[],
  pages: PageData[],
  config: PageIndexConfig,
  onProgress?: PageIndexProgressCallback
): Promise<RawTOCItem[]> {
  onProgress?.('transforming', 'Transforming TOC structure...', 30);
  
  // Transform TOC to JSON
  let tocWithPageNumber = await tocTransformer(tocContent);
  console.log(`[PageIndex] Transformed TOC: ${tocWithPageNumber.length} items`);
  
  if (tocWithPageNumber.length === 0) {
    // Fall back to no-TOC processing
    return processNoToc(pages, config, 1, onProgress);
  }
  
  // Build content for physical index extraction
  const startPageIndex = tocPageList[tocPageList.length - 1] + 1;
  let mainContent = '';
  const endPage = Math.min(startPageIndex + config.tocCheckPages, pages.length);
  
  for (let pageIndex = startPageIndex; pageIndex < endPage; pageIndex++) {
    mainContent += `<physical_index_${pageIndex + 1}>\n${pages[pageIndex].text}\n<physical_index_${pageIndex + 1}>\n\n`;
  }
  
  onProgress?.('extracting', 'Extracting physical indices...', 45);
  
  // Extract physical indices
  const tocNoPageNumber = tocWithPageNumber.map(item => ({
    structure: item.structure,
    title: item.title,
  }));
  
  const tocWithPhysicalIndex = await tocIndexExtractor(tocNoPageNumber, mainContent);
  
  // Convert physical indices to integers
  const convertedPhysicalIndex = tocWithPhysicalIndex.map(item => ({
    ...item,
    physical_index: convertPhysicalIndexToInt(item.physical_index),
  }));
  
  // Find matching pairs and calculate offset
  const pairs: Array<{ title: string; page: number | null; physical_index: number | null }> = [];
  for (const phyItem of convertedPhysicalIndex) {
    for (const pageItem of tocWithPageNumber) {
      if (phyItem.title === pageItem.title && phyItem.physical_index !== null) {
        pairs.push({
          title: phyItem.title,
          page: pageItem.page ?? null,
          physical_index: phyItem.physical_index,
        });
      }
    }
  }
  
  const offset = calculatePageOffset(pairs);
  console.log(`[PageIndex] Calculated page offset: ${offset}`);
  
  if (offset !== null) {
    // Apply offset to all items
    tocWithPageNumber = tocWithPageNumber.map(item => ({
      ...item,
      physical_index: item.page !== null && item.page !== undefined ? item.page + offset : null,
    }));
  }
  
  return tocWithPageNumber;
}

// ============================================================================
// VERIFICATION
// ============================================================================

/**
 * Check if a title appears on a specific page
 */
async function checkTitleAppearance(
  item: RawTOCItem,
  pages: PageData[],
  startIndex: number = 1
): Promise<{ listIndex: number; answer: string; title: string; pageNumber: number | null }> {
  const client = getClient();
  const title = item.title;
  const physicalIndex = item.physical_index as number | null;
  
  if (physicalIndex === null) {
    return { listIndex: item.list_index || 0, answer: 'no', title, pageNumber: null };
  }
  
  const pageIndex = physicalIndex - startIndex;
  if (pageIndex < 0 || pageIndex >= pages.length) {
    return { listIndex: item.list_index || 0, answer: 'no', title, pageNumber: physicalIndex };
  }
  
  const pageText = pages[pageIndex].text;
  const prompt = fillPrompt(CHECK_TITLE_APPEARANCE_PROMPT, {
    title,
    page_text: pageText.slice(0, 3000),
  });
  
  try {
    const response = await client.prompt(prompt, { maxTokens: 256 });
    const result = extractJSON<{ answer: string }>(response);
    return {
      listIndex: item.list_index || 0,
      answer: result?.answer?.toLowerCase() || 'no',
      title,
      pageNumber: physicalIndex,
    };
  } catch (error) {
    console.warn(`[PageIndex] Title appearance check failed for "${title}":`, error);
    return { listIndex: item.list_index || 0, answer: 'no', title, pageNumber: physicalIndex };
  }
}

/**
 * Verify TOC by checking title appearances
 */
async function verifyToc(
  pages: PageData[],
  listResult: RawTOCItem[],
  startIndex: number = 1,
  sampleSize?: number
): Promise<{ accuracy: number; incorrectResults: Array<{ listIndex: number; title: string; pageNumber: number | null }> }> {
  // Find last valid physical index
  let lastPhysicalIndex: number | null = null;
  for (let i = listResult.length - 1; i >= 0; i--) {
    if (listResult[i].physical_index !== null) {
      lastPhysicalIndex = listResult[i].physical_index as number;
      break;
    }
  }
  
  if (lastPhysicalIndex === null || lastPhysicalIndex < pages.length / 2) {
    return { accuracy: 0, incorrectResults: [] };
  }
  
  // Determine which items to check
  const validItems = listResult
    .map((item, idx) => ({ ...item, list_index: idx }))
    .filter(item => item.physical_index !== null);
  
  const itemsToCheck = sampleSize && sampleSize < validItems.length
    ? validItems.slice(0, sampleSize)
    : validItems;
  
  // Check items (in batches to avoid rate limiting)
  const results = await Promise.all(
    itemsToCheck.map(item => checkTitleAppearance(item, pages, startIndex))
  );
  
  // Process results
  let correctCount = 0;
  const incorrectResults: Array<{ listIndex: number; title: string; pageNumber: number | null }> = [];
  
  for (const result of results) {
    if (result.answer === 'yes') {
      correctCount++;
    } else {
      incorrectResults.push({
        listIndex: result.listIndex,
        title: result.title,
        pageNumber: result.pageNumber,
      });
    }
  }
  
  const accuracy = results.length > 0 ? correctCount / results.length : 0;
  console.log(`[PageIndex] Verification accuracy: ${(accuracy * 100).toFixed(1)}%`);
  
  return { accuracy, incorrectResults };
}

/**
 * Fix incorrect TOC item (exported for potential future use)
 */
export async function fixSingleTocItem(
  sectionTitle: string,
  content: string
): Promise<number | null> {
  const client = getClient();
  const prompt = fillPrompt(SINGLE_TOC_ITEM_INDEX_FIXER_PROMPT, {
    section_title: sectionTitle,
    content,
  });
  
  try {
    const response = await client.prompt(prompt, { maxTokens: 256 });
    const result = extractJSON<{ physical_index: string }>(response);
    return convertPhysicalIndexToInt(result?.physical_index);
  } catch (error) {
    console.warn(`[PageIndex] Fix single TOC item failed for "${sectionTitle}":`, error);
    return null;
  }
}

// ============================================================================
// POST-PROCESSING
// ============================================================================

/**
 * Build hierarchical tree from flat TOC list
 */
function postProcessing(tocItems: RawTOCItem[], totalPages: number): PageIndexNode[] {
  if (tocItems.length === 0) return [];
  
  // Add list_index and calculate end_index for each item
  const items = tocItems.map((item, idx) => ({
    ...item,
    list_index: idx,
    start_index: item.physical_index as number,
    end_index: totalPages,
  }));
  
  // Calculate end_index for each item
  for (let i = 0; i < items.length - 1; i++) {
    const nextStart = items[i + 1].start_index;
    if (nextStart !== null) {
      items[i].end_index = nextStart - 1;
    }
  }
  
  // Build tree based on structure
  const getParentStructure = (structure: string | null): string | null => {
    if (!structure) return null;
    const parts = structure.split('.');
    return parts.length > 1 ? parts.slice(0, -1).join('.') : null;
  };
  
  const nodes: Map<string, PageIndexNode & { structure: string | null }> = new Map();
  const rootNodes: PageIndexNode[] = [];
  
  for (const item of items) {
    if (item.start_index === null) continue;
    
    const node: PageIndexNode & { structure: string | null } = {
      structure: item.structure,
      title: item.title,
      start_index: item.start_index,
      end_index: Math.max(item.start_index, item.end_index),
      nodes: [],
    };
    
    if (item.structure) {
      nodes.set(item.structure, node);
    }
    
    // Find parent
    const parentStructure = getParentStructure(item.structure);
    if (parentStructure && nodes.has(parentStructure)) {
      nodes.get(parentStructure)!.nodes!.push(node);
    } else {
      rootNodes.push(node);
    }
  }
  
  // Clean up empty nodes arrays and remove structure field
  const cleanNode = (node: PageIndexNode & { structure?: string | null }): PageIndexNode => {
    delete node.structure;
    if (node.nodes && node.nodes.length === 0) {
      delete node.nodes;
    } else if (node.nodes) {
      node.nodes = node.nodes.map(cleanNode);
    }
    return node;
  };
  
  return rootNodes.map(cleanNode);
}

/**
 * Add node IDs to the tree structure
 */
function writeNodeId(nodes: PageIndexNode[], startId: number = 0): number {
  let currentId = startId;
  
  for (const node of nodes) {
    node.node_id = String(currentId).padStart(4, '0');
    currentId++;
    
    if (node.nodes) {
      currentId = writeNodeId(node.nodes, currentId);
    }
  }
  
  return currentId;
}

/**
 * Add text to nodes from page data
 */
function addNodeText(nodes: PageIndexNode[], pages: PageData[]): void {
  for (const node of nodes) {
    const startPage = node.start_index - 1;
    const endPage = node.end_index;
    
    const textParts: string[] = [];
    for (let i = startPage; i < endPage && i < pages.length; i++) {
      if (i >= 0) {
        textParts.push(pages[i].text);
      }
    }
    node.text = textParts.join('\n');
    
    if (node.nodes) {
      addNodeText(node.nodes, pages);
    }
  }
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

/**
 * Generate summary for a single node
 */
async function generateNodeSummary(node: PageIndexNode): Promise<string> {
  const client = getClient();
  const text = node.text || '';
  
  if (!text.trim()) {
    return '';
  }
  
  const prompt = fillPrompt(GENERATE_NODE_SUMMARY_PROMPT, {
    text: text.slice(0, 4000),
  });
  
  try {
    const response = await client.prompt(prompt, { maxTokens: 256 });
    return response.trim();
  } catch (error) {
    console.warn(`[PageIndex] Summary generation failed for "${node.title}":`, error);
    return '';
  }
}

/**
 * Generate summaries for all nodes in structure
 */
async function generateSummariesForStructure(
  nodes: PageIndexNode[],
  onProgress?: PageIndexProgressCallback
): Promise<void> {
  // Flatten nodes
  const flatNodes: PageIndexNode[] = [];
  const collectNodes = (nodeList: PageIndexNode[]) => {
    for (const node of nodeList) {
      flatNodes.push(node);
      if (node.nodes) {
        collectNodes(node.nodes);
      }
    }
  };
  collectNodes(nodes);
  
  // Limit to first 30 nodes for speed
  const nodesToSummarize = flatNodes.slice(0, 30);
  
  for (let i = 0; i < nodesToSummarize.length; i++) {
    const node = nodesToSummarize[i];
    const progress = 75 + (i / nodesToSummarize.length) * 20;
    onProgress?.('summarizing', `Generating summary ${i + 1}/${nodesToSummarize.length}...`, progress);
    
    node.summary = await generateNodeSummary(node);
  }
}

/**
 * Generate document description (exported for potential future use)
 */
export async function generateDocDescription(nodes: PageIndexNode[]): Promise<string> {
  const client = getClient();
  
  // Create clean structure for description
  const cleanStructure = nodes.map(node => ({
    title: node.title,
    node_id: node.node_id,
    summary: node.summary,
  }));
  
  const prompt = fillPrompt(GENERATE_DOC_DESCRIPTION_PROMPT, {
    structure: JSON.stringify(cleanStructure, null, 2),
  });
  
  try {
    const response = await client.prompt(prompt, { maxTokens: 256 });
    return response.trim();
  } catch (error) {
    console.warn('[PageIndex] Document description generation failed:', error);
    return '';
  }
}

/**
 * Remove text field from nodes (to reduce size)
 */
function removeStructureText(nodes: PageIndexNode[]): void {
  for (const node of nodes) {
    delete node.text;
    if (node.nodes) {
      removeStructureText(node.nodes);
    }
  }
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

/**
 * Check for TOC in document
 */
async function checkToc(
  pages: PageData[],
  config: PageIndexConfig,
  onProgress?: PageIndexProgressCallback
): Promise<{ tocContent: string | null; tocPageList: number[]; hasPageIndex: boolean }> {
  const tocPageList = await findTocPages(pages, config, onProgress);
  
  if (tocPageList.length === 0) {
    console.log('[PageIndex] No TOC found');
    return { tocContent: null, tocPageList: [], hasPageIndex: false };
  }
  
  console.log(`[PageIndex] Found TOC on pages: ${tocPageList.map(p => p + 1).join(', ')}`);
  
  const { tocContent } = tocExtractor(pages, tocPageList);
  const hasPageIndex = await detectPageIndex(tocContent);
  
  console.log(`[PageIndex] TOC has page indices: ${hasPageIndex}`);
  
  return { tocContent, tocPageList, hasPageIndex };
}

/**
 * Main PageIndex processing function
 * 
 * Implements the full PageIndex pipeline:
 * 1. Check for embedded TOC
 * 2. Extract/generate structure
 * 3. Verify and fix indices
 * 4. Build hierarchical tree
 * 5. Generate summaries
 * 
 * @param pages - Array of page data with text
 * @param config - Processing configuration
 * @param onProgress - Progress callback
 * @returns Hierarchical PageIndex tree structure
 */
export async function processPageIndex(
  pages: PageData[],
  config: Partial<PageIndexConfig> = {},
  onProgress?: PageIndexProgressCallback
): Promise<PageIndexNode[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  if (!isNearAIReady()) {
    throw new Error("NEAR AI client not initialized. Please provide your API key.");
  }
  
  onProgress?.('starting', 'Starting PageIndex processing...', 5);
  
  // Step 1: Check for embedded TOC
  onProgress?.('detecting', 'Looking for Table of Contents...', 10);
  const tocCheck = await checkToc(pages, cfg, onProgress);
  
  let tocItems: RawTOCItem[] = [];
  
  if (tocCheck.tocContent && tocCheck.hasPageIndex) {
    // Step 2a: Process TOC with page numbers
    onProgress?.('processing', 'Processing TOC with page numbers...', 25);
    tocItems = await processTocWithPageNumbers(
      tocCheck.tocContent,
      tocCheck.tocPageList,
      pages,
      cfg,
      onProgress
    );
  } else {
    // Step 2b: Generate TOC from document text
    onProgress?.('generating', 'Generating structure from document...', 30);
    tocItems = await processNoToc(pages, cfg, 1, onProgress);
  }
  
  // Filter out items without physical_index
  tocItems = tocItems.filter(item => item.physical_index !== null);
  
  if (tocItems.length === 0) {
    console.log('[PageIndex] No valid TOC items found');
    return [];
  }
  
  // Step 3: Verify TOC (sample check)
  onProgress?.('verifying', 'Verifying structure accuracy...', 65);
  const { accuracy, incorrectResults } = await verifyToc(pages, tocItems, 1, 10);
  
  console.log(`[PageIndex] Verification: ${(accuracy * 100).toFixed(1)}% accurate, ${incorrectResults.length} incorrect`);
  
  // Step 4: Build hierarchical tree
  onProgress?.('building', 'Building document tree...', 70);
  const tree = postProcessing(tocItems, pages.length);
  
  // Step 5: Add node IDs
  if (cfg.addNodeIds) {
    writeNodeId(tree);
  }
  
  // Step 6: Add text and generate summaries
  if (cfg.generateSummaries && tree.length > 0) {
    addNodeText(tree, pages);
    await generateSummariesForStructure(tree, onProgress);
    removeStructureText(tree); // Remove text to reduce size
  }
  
  onProgress?.('complete', 'PageIndex processing complete!', 100);
  
  return tree;
}

/**
 * Add text previews to nodes from page data
 */
export function addTextPreviews(nodes: PageIndexNode[], pages: PageData[]): void {
  for (const node of nodes) {
    const startPage = pages.find(p => p.pageNumber === node.start_index);
    if (startPage) {
      node.text_preview = startPage.text.slice(0, 500);
    }
    
    if (node.nodes) {
      addTextPreviews(node.nodes, pages);
    }
  }
}
