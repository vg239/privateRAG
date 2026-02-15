
/**
 * Detect if a single page contains a Table of Contents
 */
export const TOC_DETECTOR_PROMPT = `Your job is to detect if there is a table of content provided in the given text.

Given text: {content}

return the following JSON format:
{
    "thinking": "<why do you think there is a table of content in the given text>",
    "toc_detected": "<yes or no>"
}

Directly return the final JSON structure. Do not output anything else.
Please note: abstract, summary, notation list, figure list, table list, etc. are NOT table of contents.`;

/**
 * Detect if page numbers/indices are given in the TOC
 */
export const DETECT_PAGE_INDEX_PROMPT = `You will be given a table of contents.

Your job is to detect if there are page numbers/indices given within the table of contents.

Given text: {toc_content}

Reply format:
{
    "thinking": "<why do you think there are page numbers/indices given within the table of contents>",
    "page_index_given_in_toc": "<yes or no>"
}
Directly return the final JSON structure. Do not output anything else.`;

// ============================================================================
// TOC TRANSFORMATION PROMPTS
// ============================================================================

/**
 * Transform raw TOC text into structured JSON
 */
export const TOC_TRANSFORMER_PROMPT = `You are given a table of contents, You job is to transform the whole table of content into a JSON format included table_of_contents.

structure is the numeric system which represents the index of the hierarchy section in the table of contents. For example, the first section has structure index 1, the first subsection has structure index 1.1, the second subsection has structure index 1.2, etc.

The response should be in the following JSON format: 
{
"table_of_contents": [
    {
        "structure": "<structure index, 'x.x.x' or null>" (string),
        "title": "<title of the section>",
        "page": <page number or null>
    },
    ...
    ]
}
You should transform the full table of contents in one go.
Directly return the final JSON structure, do not output anything else.

Given table of contents:
{toc_content}`;

/**
 * Check if TOC transformation is complete
 */
export const CHECK_TOC_TRANSFORMATION_COMPLETE_PROMPT = `You are given a raw table of contents and a table of contents.
Your job is to check if the table of contents is complete.

Reply format:
{
    "thinking": "<why do you think the cleaned table of contents is complete or not>",
    "completed": "<yes or no>"
}
Directly return the final JSON structure. Do not output anything else.

Raw Table of contents:
{raw_toc}

Cleaned Table of contents:
{cleaned_toc}`;

/**
 * Continue TOC transformation if incomplete
 */
export const CONTINUE_TOC_TRANSFORMATION_PROMPT = `Your task is to continue the table of contents json structure, directly output the remaining part of the json structure.
The response should be in the following JSON format: 

The raw table of contents json structure is:
{raw_toc}

The incomplete transformed table of contents json structure is:
{incomplete_toc}

Please continue the json structure, directly output the remaining part of the json structure.`;

// ============================================================================
// TOC GENERATION PROMPTS (when no embedded TOC exists)
// ============================================================================

/**
 * Generate initial TOC structure from document text
 */
export const GENERATE_TOC_INIT_PROMPT = `You are an expert in extracting hierarchical tree structure, your task is to generate the tree structure of the document.

The structure variable is the numeric system which represents the index of the hierarchy section in the table of contents. For example, the first section has structure index 1, the first subsection has structure index 1.1, the second subsection has structure index 1.2, etc.

For the title, you need to extract the original title from the text, only fix the space inconsistency.

The provided text contains tags like <physical_index_X> and <physical_index_X> to indicate the start and end of page X. 

For the physical_index, you need to extract the physical index of the start of the section from the text. Keep the <physical_index_X> format.

The response should be in the following format. 
    [
        {
            "structure": "<structure index, 'x.x.x'>" (string),
            "title": "<title of the section, keep the original title>",
            "physical_index": "<physical_index_X> (keep the format)"
        },
        ...
    ]

Directly return the final JSON structure. Do not output anything else.

Given text:
{text}`;

/**
 * Continue generating TOC structure for subsequent pages
 */
export const GENERATE_TOC_CONTINUE_PROMPT = `You are an expert in extracting hierarchical tree structure.
You are given a tree structure of the previous part and the text of the current part.
Your task is to continue the tree structure from the previous part to include the current part.

The structure variable is the numeric system which represents the index of the hierarchy section in the table of contents. For example, the first section has structure index 1, the first subsection has structure index 1.1, the second subsection has structure index 1.2, etc.

For the title, you need to extract the original title from the text, only fix the space inconsistency.

The provided text contains tags like <physical_index_X> and <physical_index_X> to indicate the start and end of page X. 

For the physical_index, you need to extract the physical index of the start of the section from the text. Keep the <physical_index_X> format.

The response should be in the following format. 
    [
        {
            "structure": "<structure index, 'x.x.x'>" (string),
            "title": "<title of the section, keep the original title>",
            "physical_index": "<physical_index_X> (keep the format)"
        },
        ...
    ]

Directly return the additional part of the final JSON structure. Do not output anything else.

Given text:
{text}

Previous tree structure:
{previous_structure}`;

// ============================================================================
// PAGE NUMBER EXTRACTION PROMPTS
// ============================================================================

/**
 * Extract physical indices for TOC items from document pages
 */
export const TOC_INDEX_EXTRACTOR_PROMPT = `You are given a table of contents in a json format and several pages of a document, your job is to add the physical_index to the table of contents in the json format.

The provided pages contains tags like <physical_index_X> and <physical_index_X> to indicate the physical location of the page X.

The structure variable is the numeric system which represents the index of the hierarchy section in the table of contents. For example, the first section has structure index 1, the first subsection has structure index 1.1, the second subsection has structure index 1.2, etc.

The response should be in the following JSON format: 
[
    {
        "structure": "<structure index, 'x.x.x' or null>" (string),
        "title": "<title of the section>",
        "physical_index": "<physical_index_X>" (keep the format)
    },
    ...
]

Only add the physical_index to the sections that are in the provided pages.
If the section is not in the provided pages, do not add the physical_index to it.
Directly return the final JSON structure. Do not output anything else.

Table of contents:
{toc}

Document pages:
{content}`;

/**
 * Add page numbers to TOC from document content
 */
export const ADD_PAGE_NUMBER_TO_TOC_PROMPT = `You are given an JSON structure of a document and a partial part of the document. Your task is to check if the title that is described in the structure is started in the partial given document.

The provided text contains tags like <physical_index_X> and <physical_index_X> to indicate the physical location of the page X. 

If the full target section starts in the partial given document, insert the given JSON structure with the "start": "yes", and "start_index": "<physical_index_X>".

If the full target section does not start in the partial given document, insert "start": "no",  "start_index": null.

The response should be in the following format. 
    [
        {
            "structure": "<structure index, 'x.x.x' or null>" (string),
            "title": "<title of the section>",
            "start": "<yes or no>",
            "physical_index": "<physical_index_X> (keep the format)" or null
        },
        ...
    ]    
The given structure contains the result of the previous part, you need to fill the result of the current part, do not change the previous result.
Directly return the final JSON structure. Do not output anything else.

Current Partial Document:
{part}

Given Structure:
{structure}`;

// ============================================================================
// VERIFICATION PROMPTS
// ============================================================================

/**
 * Check if a section title appears on a specific page
 */
export const CHECK_TITLE_APPEARANCE_PROMPT = `Your job is to check if the given section appears or starts in the given page_text.

Note: do fuzzy matching, ignore any space inconsistency in the page_text.

The given section title is {title}.
The given page_text is {page_text}.

Reply format:
{
    "thinking": "<why do you think the section appears or starts in the page_text>",
    "answer": "<yes or no>" (yes if the section appears or starts in the page_text, no otherwise)
}
Directly return the final JSON structure. Do not output anything else.`;

/**
 * Check if a section starts at the beginning of a page
 */
export const CHECK_TITLE_APPEARANCE_IN_START_PROMPT = `You will be given the current section title and the current page_text.
Your job is to check if the current section starts in the beginning of the given page_text.
If there are other contents before the current section title, then the current section does not start in the beginning of the given page_text.
If the current section title is the first content in the given page_text, then the current section starts in the beginning of the given page_text.

Note: do fuzzy matching, ignore any space inconsistency in the page_text.

The given section title is {title}.
The given page_text is {page_text}.

reply format:
{
    "thinking": "<why do you think the section appears or starts in the page_text>",
    "start_begin": "<yes or no>" (yes if the section starts in the beginning of the page_text, no otherwise)
}
Directly return the final JSON structure. Do not output anything else.`;

/**
 * Fix incorrect TOC item index
 */
export const SINGLE_TOC_ITEM_INDEX_FIXER_PROMPT = `You are given a section title and several pages of a document, your job is to find the physical index of the start page of the section in the partial document.

The provided pages contains tags like <physical_index_X> and <physical_index_X> to indicate the physical location of the page X.

Reply in a JSON format:
{
    "thinking": "<explain which page, started and closed by <physical_index_X>, contains the start of this section>",
    "physical_index": "<physical_index_X>" (keep the format)
}
Directly return the final JSON structure. Do not output anything else.

Section Title:
{section_title}

Document pages:
{content}`;

// ============================================================================
// SUMMARY GENERATION PROMPTS
// ============================================================================

/**
 * Generate a summary for a document section
 */
export const GENERATE_NODE_SUMMARY_PROMPT = `You are given a part of a document, your task is to generate a description of the partial document about what are main points covered in the partial document.

Partial Document Text: {text}

Directly return the description, do not include any other text.`;

/**
 * Generate a one-sentence document description
 */
export const GENERATE_DOC_DESCRIPTION_PROMPT = `Your are an expert in generating descriptions for a document.
You are given a structure of a document. Your task is to generate a one-sentence description for the document, which makes it easy to distinguish the document from other documents.
    
Document Structure: {structure}

Directly return the description, do not include any other text.`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fill prompt template with values
 */
export function fillPrompt(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Transform dots in TOC to colons (e.g., "Chapter 1 ..... 5" -> "Chapter 1 : 5")
 */
export function transformDotsToColon(text: string): string {
  // Replace 5+ consecutive dots with ": "
  let result = text.replace(/\.{5,}/g, ': ');
  // Handle dots separated by spaces
  result = result.replace(/(?:\. ){5,}\.?/g, ': ');
  return result;
}
