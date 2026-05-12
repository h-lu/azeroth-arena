import type { BattleViewModel } from "../battle/battleState";

type AiOpponentPanelProps = {
  model: BattleViewModel;
};

export default function AiOpponentPanel({ model }: AiOpponentPanelProps) {
  return (
    <aside className="ai-panel">
      <span className="battle-kicker">{model.aiPanel.confidence} confidence</span>
      <strong>{model.aiPanel.personaName}</strong>
      <p>{model.aiPanel.intentText}</p>
      <div>
        {model.aiPanel.objectives.map((objective) => <span key={objective}>{objective}</span>)}
      </div>
      <small>{model.opponent.handCount} cards in hand</small>
    </aside>
  );
}
