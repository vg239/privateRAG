// import { NovaSdk } from "nova-sdk-js";
// import { Buffer } from "buffer";

// Ensure Buffer is available globally
if (typeof window !== "undefined") {
    // window.Buffer = window.Buffer || Buffer;
}

export interface NovaUploadResult {
    cid: string;
    transactionHash: string;
    blockscanUrl: string;
}

/**
 * Upload a file to NOVA (IPFS) and return the transaction details.
 * 
 * @param file The file to upload
 * @param apiKey The NOVA API Key
 * @returns Promise<NovaUploadResult>
 */
export async function uploadToNova(_file: File, _apiKey: string): Promise<NovaUploadResult> {

    // Per user request: Disable logic and show unreachable message
    console.log("NOVA Upload Disabled: Simulating unreachable network");

    // Simulate a brief delay before failing
    await new Promise(resolve => setTimeout(resolve, 1000));

    throw new Error("NOVA Testnet Unreachable");
}
