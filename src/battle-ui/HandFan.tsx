import type { CSSProperties } from "react";
import type { BattleHandCard } from "../battle/battleState";
import CardTile from "./CardTile";

type HandFanProps = {
  cards: BattleHandCard[];
  selectedCardId: string | null;
  onSelectCard: (cardId: string) => void;
};

export default function HandFan({ cards, selectedCardId, onSelectCard }: HandFanProps) {
  return (
    <section className="hand-fan" aria-label="Player hand">
      {cards.map((card, index) => (
        <div key={`${card.id}-${index}`} className="hand-card" style={{ "--card-index": index, "--hand-count": cards.length } as CSSProperties}>
          <CardTile card={card} selected={selectedCardId === card.id} onSelect={onSelectCard} />
        </div>
      ))}
    </section>
  );
}
