import {
  ArrowUp,
  GitCompareArrows,
  Lightbulb,
  Paperclip,
  ScanSearch,
  Search,
  Sparkles,
} from "lucide-react";

const suggestions = [
  {
    title: "Analyse BOM",
    prompt: "Analyse my BOM for lifecycle risks and availability.",
    icon: <ScanSearch size={16} />,
  },
  {
    title: "Find part",
    prompt: "Find a part that meets my BOM requirements.",
    icon: <Search size={16} />,
  },
  {
    title: "Compare parts",
    prompt: "Compare specifications and lifecycle of two parts.",
    icon: <GitCompareArrows size={16} />,
  },
  {
    title: "Suggest part",
    prompt: "Suggest a replacement for a part in my BOM.",
    icon: <Lightbulb size={16} />,
  },
];

export function AI() {
  return (
    <div className="ai-page" aria-disabled="true">
      <div className="page-header detail-page-header">
        <div className="detail-page-heading">
          <h1 className="page-title">AI</h1>
          <p className="page-subtitle">Your BOM assistant</p>
        </div>
      </div>

      <section className="ai-chat" aria-label="AI chat preview">
        <div className="ai-chat__welcome">
          <Sparkles size={36} aria-hidden="true" />
          <h2>How can I help with your BOM?</h2>
          <p>Analyse a BOM, explore parts, or find a suitable replacement.</p>
        </div>

        <div className="ai-chat__suggestions" aria-label="Suggested prompts">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.title}
              type="button"
              className="ai-chat__suggestion"
              title={suggestion.prompt}
              disabled
            >
              <span aria-hidden="true">{suggestion.icon}</span>
              {suggestion.title}
            </button>
          ))}
        </div>

        <div className="ai-chat__composer">
          <textarea
            aria-label="Message the BOM assistant"
            placeholder="Ask about your BOM or a part…"
            rows={3}
            disabled
          />
          <div className="ai-chat__actions">
            <button
              type="button"
              className="button"
              aria-label="Attach BOM"
              title="Attach BOM"
              disabled
            >
              <Paperclip size={18} aria-hidden="true" />
              Attach BOM
            </button>
            <button
              type="button"
              className="button"
              aria-label="Send message"
              title="Send message"
              disabled
            >
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
