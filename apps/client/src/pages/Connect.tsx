import { Plug, Terminal } from "lucide-react";
import { Card } from "../components/ui";

const connectors = [
  {
    name: "CLI",
    description: "Use PartPilot from your command line.",
    icon: <Terminal size={32} />,
  },
  {
    name: "KiCad plugin",
    description: "Connect your KiCad workflow to PartPilot.",
    icon: <img src="/kicad-logo.png" alt="" width={32} height={32} />,
  },
  {
    name: "MCP connector",
    description: "Connect AI tools to PartPilot through MCP.",
    icon: <Plug size={32} />,
  },
];

export function Connect() {
  return (
    <div className="stack">
      <div className="page-header detail-page-header">
        <div className="detail-page-heading">
          <h1 className="page-title">Connect</h1>
          <p className="page-subtitle">
            Connect PartPilot to your tools. Integrations are coming soon.
          </p>
        </div>
      </div>

      <section className="project-grid" aria-label="Connectors">
        {connectors.map((connector) => (
          <Card key={connector.name} className="project-card connector-card">
            <div className="connector-card__content" aria-disabled="true">
              <div className="project-card__top">
                <div>
                  <h3>{connector.name}</h3>
                  <p>{connector.description}</p>
                </div>
                <span aria-hidden="true">{connector.icon}</span>
              </div>
              <button
                type="button"
                className="button"
                disabled
                aria-label={`${connector.name} coming soon`}
              >
                Coming soon
              </button>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
