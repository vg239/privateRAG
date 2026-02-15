
import { useNavigate } from "react-router-dom";
import { ArrowRight, Shield, Zap, Lock } from "lucide-react";
import "./Landing.css";

const PAGEINDEX_GITHUB = "https://github.com/VectifyAI/PageIndex";
const PAGEINDEX_VECTORLESS_DOCS = "https://docs.pageindex.ai/cookbook/vectorless-rag-pageindex";

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      {/* Background effects */}
      <div className="landing-bg">
        <div className="gradient-orb orb-1" />
        <div className="gradient-orb orb-2" />
        <div className="noise-overlay" />
      </div>

      {/* Header */}
      <header className="landing-header">
        <div className="logo">
          <div className="logo-icon">
            <Shield size={20} />
          </div>
          <span className="logo-text">PrivateRAG</span>
        </div>
        <nav className="nav-links">
          <a href="/docs" className="nav-link">How it works</a>
          <a href="/chats" className="nav-link">My Documents</a>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="hero">
        <div className="hero-content">
          {/* Badge */}
          <div className="hero-badge">
            <Zap size={14} />
            <span>Vectorless RAG · NEAR AI privacy track</span>
          </div>

          {/* Title */}
          <h1 className="hero-title">
            Documents that stay
            <span className="title-highlight"> private</span>
          </h1>

          {/* Subtitle */}
          <p className="hero-subtitle">
            PDF text is extracted in your browser (Pyodide). Structure is built in NEAR AI&apos;s TEE via PageIndex-style logic.
            No vectors, no embeddings — your key, your encryption.
          </p>

          {/* CTA Buttons */}
          <div className="hero-actions">
            <button 
              className="btn btn-primary"
              onClick={() => navigate("/app")}
            >
              Get Started
              <ArrowRight size={18} />
            </button>
            <button 
              className="btn btn-ghost"
              onClick={() => navigate("/docs")}
            >
              Learn more
            </button>
          </div>

          {/* Features */}
          <div className="hero-features">
            <div className="feature">
              <div className="feature-icon">
                <Zap size={16} />
              </div>
              <div className="feature-text">
                <span className="feature-title">Pyodide</span>
                <span className="feature-desc">PDF text in browser</span>
              </div>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <Shield size={16} />
              </div>
              <div className="feature-text">
                <span className="feature-title">NEAR AI TEE</span>
                <span className="feature-desc">PageIndex-style TOC</span>
              </div>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <Lock size={16} />
              </div>
              <div className="feature-text">
                <span className="feature-title">AES-256-GCM</span>
                <span className="feature-desc">Wallet-derived encryption</span>
              </div>
            </div>
          </div>

          {/* PageIndex credit */}
          <p className="hero-credit">
            Inspired by{" "}
            <a href={PAGEINDEX_GITHUB} target="_blank" rel="noopener noreferrer" className="credit-link">
              PageIndex
            </a>{" "}
            <a href={PAGEINDEX_VECTORLESS_DOCS} target="_blank" rel="noopener noreferrer" className="credit-link" title="Vectorless RAG cookbook">
              (vectorless RAG)
            </a>.
            We use a <strong>TypeScript implementation</strong> so extraction stays client-side with NEAR AI TEE.
          </p>
        </div>

        {/* Visual: NEAR AI + Pyodide flow */}
        <div className="hero-visual">
          <div className="visual-card">
            <div className="visual-header">
              <div className="visual-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="visual-title">vectorless-flow.txt</span>
            </div>
            <div className="visual-content">
              <div className="flow-line">
                <span className="flow-label">PDF</span>
                <span className="flow-arrow">→</span>
                <span className="flow-value local">Browser</span>
              </div>
              <div className="flow-line">
                <span className="flow-label">Text</span>
                <span className="flow-arrow">→</span>
                <span className="flow-value local">Pyodide (pypdf)</span>
              </div>
              <div className="flow-line">
                <span className="flow-label">Extracted text</span>
                <span className="flow-arrow">→</span>
                <span className="flow-value remote">NEAR AI TEE</span>
              </div>
              <div className="flow-line">
                <span className="flow-label">PageIndex</span>
                <span className="flow-arrow">→</span>
                <span className="flow-value local">TOC (TS impl)</span>
              </div>
              <div className="flow-line">
                <span className="flow-label">Key</span>
                <span className="flow-arrow">→</span>
                <span className="flow-value local">Wallet Sign</span>
              </div>
              <div className="flow-line">
                <span className="flow-label">Encrypted TOC</span>
                <span className="flow-arrow">→</span>
                <span className="flow-value remote">Database</span>
              </div>
            </div>
            <div className="visual-footer">
              <span className="safe-badge">No vectors · Your data stays yours</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
