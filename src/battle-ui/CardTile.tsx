import type { BattleHandCard } from "../battle/battleState";

type CardTileProps = {
  card: BattleHandCard;
  selected?: boolean;
  onSelect?: (cardId: string) => void;
};

export default function CardTile({ card, selected = false, onSelect }: CardTileProps) {
  return (
    <button
      type="button"
      className={[
        "card-tile",
        card.legalCommandCount > 0 ? "playable" : "",
        selected ? "selected" : "",
      ].filter(Boolean).join(" ")}
      disabled={card.legalCommandCount === 0}
      onClick={() => onSelect?.(card.id)}
    >
      <span>{card.type}</span>
      <strong>{card.name}</strong>
      <small>{card.role}</small>
      <b>{card.cost}</b>
    </button>
  );
}
