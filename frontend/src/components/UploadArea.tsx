import { useRef, useState } from "react";
import { uploadDocument, type DocumentDetail } from "../api/client";

type Props = {
  onUploaded: (doc: DocumentDetail) => void;
};

export function UploadArea({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      const doc = await uploadDocument(file, file.name.replace(/\.pdf$/i, ""));
      onUploaded(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="upload-area">
      <button
        type="button"
        className="primary-button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? "Uploading & indexing..." : "Upload PDF"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error ? <p className="error-text">{error}</p> : null}
      <p className="muted small">We run PageIndex locally over your PDF using your OpenAI key.</p>
    </div>
  );
}

