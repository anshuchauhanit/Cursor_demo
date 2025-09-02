import { useState } from "react";
import "./App.css";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Call backend to generate UI options
  const generateOptions = async () => {
    if (!prompt.trim()) {
      alert("Please enter a prompt!");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("http://localhost:5000/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      setOptions(data.files || []);
      setSelectedCode("");
    } catch (err) {
      console.error(err);
      alert("Failed to generate options");
    } finally {
      setLoading(false);
    }
  };

  // Call backend to select one option
  const selectOption = async (file, action) => {
    try {
      const res = await fetch("http://localhost:5000/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file }),
      });
      const data = await res.json();
      setSelectedCode(data.code || "");

      if (action === "preview") {
        window.open(`http://localhost:5000${file}`, "_blank");
      } else if (action === "showCode") {
        setShowModal(true);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to select option");
    }
  };

  // Confirm option → send to backend and push to GitHub
  const confirmOption = async (file) => {
    const screenName = prompt("Enter a screen name:");
    if (!screenName) return;

    try {
      const res = await fetch("http://localhost:5000/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file, screenName }),
      });

      const data = await res.json();
      if (res.ok) {
        alert(`✅ Screen "${screenName}" added to repo!`);
      } else {
        alert(`❌ Failed: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("❌ Confirm failed");
    }
  };

  // Copy selected code to clipboard
  const copyCode = () => {
    navigator.clipboard.writeText(selectedCode);
    alert("✅ Code copied!");
  };

  return (
    <div className="app-container">
      {/* Left Panel (40%) */}
      <div className="sidebar">
        <h2>💡 UI Prompt</h2>
        <textarea
          className="prompt-box"
          placeholder="Describe your UI..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button className="btn-primary" onClick={generateOptions} disabled={loading}>
          {loading ? "Generating..." : "Generate Options"}
        </button>
      </div>

      {/* Right Panel (60%) */}
      <div className="main">
        {options.length > 0 && (
          <>
            <h3>Select a UI Option</h3>
            <div className="options-grid">
              {options.map((file, i) => (
                <div key={i} className="option-card">
                  <iframe
                    src={`http://localhost:5000${file}`}
                    className="preview-frame"
                    title={`Option ${i + 1}`}
                  ></iframe>
                  <div className="option-actions">
                    <button
                      className="btn-success"
                      onClick={() => selectOption(file, "preview")}
                    >
                      Preview UI
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => selectOption(file, "showCode")}
                    >
                      Show Code
                    </button>
                    <button
                      className="btn-confirm"
                      onClick={() => confirmOption(file)}
                    >
                      Confirm Option
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Generated Code</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                ✖
              </button>
            </div>
            <textarea className="code-box" value={selectedCode} readOnly />
            <button className="btn-primary" onClick={copyCode}>
              Copy Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

