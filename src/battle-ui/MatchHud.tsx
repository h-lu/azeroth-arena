import type { BattleViewModel } from "../battle/battleState";
import type { ConnectionStatus } from "../onlineProtocol";

type MatchHudProps = {
  model: BattleViewModel;
  connectionStatus: ConnectionStatus;
  error: string | null;
  onExportReplay: () => void;
};

export default function MatchHud({ model, connectionStatus, error, onExportReplay }: MatchHudProps) {
  return (
    <header className="battle-hud">
      <div>
        <span className="battle-kicker">Azeroth Arena</span>
        <strong>AI Encounter</strong>
      </div>
      <div className="battle-hud-pills">
        <span>Round {model.round}</span>
        <span>{model.phase}</span>
        <span>{model.currentPlayer === model.viewerSide ? "Your turn" : "Enemy turn"}</span>
        <span>{connectionStatus}</span>
      </div>
      <button type="button" onClick={onExportReplay}>Replay</button>
      {error ? <p role="alert">{error}</p> : null}
    </header>
  );
}
