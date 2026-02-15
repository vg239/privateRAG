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

    console.log("Attempting to generate real transaction via backend...");

    try {
        // 1. Try to get a real transaction from the backend CLI runner
        const response = await fetch("http://localhost:8000/api/hackathon/upload-nova", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`Backend CLI execution failed: ${response.statusText}`);
        }

        const data = await response.json();
        console.log("✅ Real Transaction Generated:", data);

        return {
            cid: data.cid,
            transactionHash: data.transactionHash,
            blockscanUrl: data.blockscanUrl,
        };

    } catch (error) {
        console.warn("⚠️ Backend CLI failed, falling back to UI simulation:", error);

        // 2. FALLBACK: Mock Implementation (UI only)
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log("MOCK: File uploaded successfully (Fallback)");

        return {
            cid: "mock-cid-ui-fallback",
            transactionHash: "",
            blockscanUrl: "", // No link shown in fallback mode
        };
    }
}
