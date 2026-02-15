

import { useNavigate } from "react-router-dom";
import { ArrowLeft, Cpu, Lock, Key, Database, Shield, HelpCircle, Server } from "lucide-react";
import "./Docs.css";

export function Docs() {
  const navigate = useNavigate();

  return (
    <div className="docs-page">
      <div className="docs-bg">
        <div className="bg-gradient" />
      </div>

      <header className="docs-header">
        <button className="back-btn" onClick={() => navigate("/")}>
          <ArrowLeft size={20} />
          Home
        </button>
        <h1 className="docs-title">How PrivateRAG Works</h1>
        <div className="header-spacer" />
      </header>

      <main className="docs-main">
        <div className="docs-container">
          {/* Intro */}
          <section className="docs-intro">
            <h2>Privacy-First Document Intelligence</h2>
            <p>
              PrivateRAG is built for the <strong>NEAR AI privacy track</strong>. Your PDF is processed
              in your browser; structure analysis runs inside NEAR AI's Trusted Execution Environment (TEE).
              The server only stores encrypted data it cannot read. Your encryption key is derived from your
              wallet and never stored anywhere.
            </p>
            <p>
              We use a <strong>vectorless RAG</strong> approach inspired by{" "}
              <a href="https://github.com/VectifyAI/PageIndex" target="_blank" rel="noopener noreferrer" className="docs-link">PageIndex</a>
              {" "}(<a href="https://docs.pageindex.ai/cookbook/vectorless-rag-pageindex" target="_blank" rel="noopener noreferrer" className="docs-link">vectorless RAG cookbook</a>).
              Instead of embeddings and a vector DB, we build a hierarchical table of contents (TOC) over your document.
              To keep everything client-side, we use a <strong>TypeScript implementation</strong> of the PageIndex logic
              that talks to NEAR AI's TEE — no Python on the server for your PDF.
            </p>
          </section>

          {/* Section 1: Client-Side PDF Processing */}
          <section className="docs-section">
            <div className="section-header">
              <div className="section-icon"><Cpu size={24} /></div>
              <div>
                <h3>1. Client-Side PDF Processing</h3>
                <p>Your PDF never leaves your device</p>
              </div>
            </div>
            <div className="section-content">
              <p>
                When you upload a PDF, <strong>text extraction</strong> happens entirely in your browser using
                <strong> Pyodide</strong> — a Python runtime compiled to WebAssembly. We use <strong>pypdf</strong> to
                extract page text and basic structure. The original PDF file is never uploaded to any server.
              </p>
              <p>
                Only the extracted text (and optional outline) is used for the next step — structure analysis —
                which runs in NEAR AI's TEE, not on our servers.
              </p>
            </div>
          </section>

          {/* Section 2: NEAR AI TEE */}
          <section className="docs-section highlight">
            <div className="section-header">
              <div className="section-icon"><Shield size={24} /></div>
              <div>
                <h3>2. NEAR AI Trusted Execution Environment (TEE)</h3>
                <p>Private structure analysis with your API key</p>
              </div>
            </div>
            <div className="section-content">
              <p>
                To build a rich <strong>PageIndex</strong> (hierarchical table of contents) we send only the
                extracted text to <strong>NEAR AI</strong> at <code>cloud-api.near.ai</code>. NEAR AI runs inside a
                <strong> Trusted Execution Environment (TEE)</strong> — confidential computing where even the
                operator cannot see your data. This is the same privacy guarantee we rely on for the privacy track.
              </p>
              <p>
                You provide your own <strong>NEAR AI API key</strong> in the app. The key is stored locally in your
                browser (e.g. localStorage) and is sent only to NEAR AI for requests. Our backend never sees your
                PDF or your API key for this flow. The TEE returns a structured TOC (sections, page ranges,
                summaries) that we then encrypt and store.
              </p>
            </div>
          </section>

          {/* Section 3: Why Two Signatures */}
          <section className="docs-section">
            <div className="section-header">
              <div className="section-icon"><Key size={24} /></div>
              <div>
                <h3>3. Why Two Wallet Signatures?</h3>
                <p>Different purposes, both important</p>
              </div>
            </div>
            <div className="section-content">
              <div className="signature-explanation">
                <div className="sig-card">
                  <div className="sig-number">1</div>
                  <div className="sig-content">
                    <h4>Key Derivation Signature</h4>
                    <p className="sig-message">"PrivateRAG-Key-Derivation &#123;accountId&#125;"</p>
                    <p>
                      This signature is used to <strong>derive your encryption key</strong>.
                      The same wallet signing the same message always produces the same signature,
                      which means the same encryption key every time.
                    </p>
                    <p className="sig-why">
                      <HelpCircle size={14} />
                      Why? So you can decrypt your documents later without storing the key anywhere.
                    </p>
                  </div>
                </div>

                <div className="sig-card">
                  <div className="sig-number">2</div>
                  <div className="sig-content">
                    <h4>TOC Ownership Signature</h4>
                    <p className="sig-message">"PrivateRAG-TOC-Ownership:&#123;hash&#125;"</p>
                    <p>
                      This signature proves <strong>you created this specific TOC</strong>.
                      It signs the document's unique hash, creating a verifiable proof of ownership.
                    </p>
                    <p className="sig-why">
                      <HelpCircle size={14} />
                      Why? Anyone can verify this signature matches your NEAR account.
                      It proves the document belongs to you without revealing its contents.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4: Encryption */}
          <section className="docs-section">
            <div className="section-header">
              <div className="section-icon"><Lock size={24} /></div>
              <div>
                <h3>4. AES-256-GCM Encryption</h3>
                <p>Military-grade protection for your data</p>
              </div>
            </div>
            <div className="section-content">
              <p>
                Your TOC is encrypted using <strong>AES-256-GCM</strong>, the same encryption
                used by governments and financial institutions. The encryption happens
                entirely in your browser using the Web Crypto API.
              </p>
              <p>
                The key is derived from your wallet signature using SHA-256 hashing.
                Even if someone gets the encrypted blob, they cannot decrypt it without
                your wallet's signature.
              </p>
            </div>
          </section>

          {/* Section 5: What Gets Stored */}
          <section className="docs-section">
            <div className="section-header">
              <div className="section-icon"><Database size={24} /></div>
              <div>
                <h3>5. What Gets Stored</h3>
                <p>Only encrypted data reaches our server</p>
              </div>
            </div>
            <div className="section-content">
              <div className="storage-table">
                <div className="storage-row header">
                  <span>Data</span>
                  <span>Where</span>
                  <span>Can Server Read?</span>
                </div>
                <div className="storage-row local">
                  <span>Original PDF</span>
                  <span>Your browser only</span>
                  <span>No</span>
                </div>
                <div className="storage-row local">
                  <span>Extracted text (for TEE)</span>
                  <span>Browser → NEAR AI TEE only</span>
                  <span>No (TEE is confidential)</span>
                </div>
                <div className="storage-row local">
                  <span>NEAR AI API key</span>
                  <span>Your browser (e.g. localStorage)</span>
                  <span>No</span>
                </div>
                <div className="storage-row local">
                  <span>Decrypted TOC</span>
                  <span>Your browser memory</span>
                  <span>No</span>
                </div>
                <div className="storage-row local">
                  <span>Encryption Key</span>
                  <span>Derived on-demand</span>
                  <span>No (never stored)</span>
                </div>
                <div className="storage-row server">
                  <span>Encrypted TOC</span>
                  <span>Our database</span>
                  <span>No (encrypted)</span>
                </div>
                <div className="storage-row server">
                  <span>Ownership Signature</span>
                  <span>Our database</span>
                  <span>Yes (proof only)</span>
                </div>
                <div className="storage-row server">
                  <span>Wallet Address</span>
                  <span>Our database</span>
                  <span>Yes (public info)</span>
                </div>
              </div>
            </div>
          </section>

          {/* Section 6: Summary */}
          <section className="docs-section">
            <div className="section-header">
              <div className="section-icon"><Server size={24} /></div>
              <div>
                <h3>6. Privacy Track Summary</h3>
                <p>NEAR AI + client-side encryption</p>
              </div>
            </div>
            <div className="section-content">
              <p>
                For the <strong>NEAR AI privacy track</strong>, PrivateRAG ensures:
              </p>
              <ul className="docs-list">
                <li><strong>PDF stays on device</strong> — only text is extracted in-browser (Pyodide/pypdf).</li>
                <li><strong>Structure analysis in TEE</strong> — extracted text is sent to NEAR AI (<code>cloud-api.near.ai</code>), which runs in a Trusted Execution Environment.</li>
                <li><strong>Your API key</strong> — you use your own NEAR AI API key; we don't store or proxy it for TOC generation.</li>
                <li><strong>Encrypted storage</strong> — the resulting TOC is encrypted with a key derived from your wallet and only the ciphertext is stored.</li>
                <li><strong>Zero knowledge</strong> — our server cannot decrypt your documents or see the content sent to NEAR AI.</li>
              </ul>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
