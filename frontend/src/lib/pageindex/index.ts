
export { 
  processPageIndex, 
  addTextPreviews,
  fixSingleTocItem,
  generateDocDescription,
} from "./processor";

export type { 
  PageData, 
  PageIndexNode, 
  PageIndexConfig, 
  PageIndexProgressCallback,
} from "./processor";

export { 
  fillPrompt,
  transformDotsToColon,
} from "./prompts";
