import { CSS } from "@dnd-kit/utilities";
import { useDraggable } from "@dnd-kit/core";
import type { BattleHandCard } from "../battle/battleState";

type CardTileProps = {
  card: BattleHandCard;
  selected?: boolean;
  onSelect?: (cardId: string) => void;
};

export default function CardTile({ card, selected = false, onSelect }: CardTileProps) {
  const draggable = useDraggable({
    id: `card:${card.id}`,
    data: { kind: "card", cardId: card.id },
    disabled: card.legalCommandCount === 0,
  });

  return (
    <button
      ref={draggable.setNodeRef}
      type="button"
      className={[
        "card-tile",
        card.legalCommandCount > 0 ? "playable" : "",
        selected ? "selected" : "",
        draggable.isDragging ? "dragging" : "",
      ].filter(Boolean).join(" ")}
      disabled={card.legalCommandCount === 0}
      onClick={() => onSelect?.(card.id)}
      style={{
        transform: CSS.Translate.toString(draggable.transform),
      }}
      {...draggable.attributes}
      {...draggable.listeners}
    >
      <span>{card.type}</span>
      <strong>{card.name}</strong>
      <small>{card.role}</small>
      <b>{card.cost}</b>
    </button>
  );
}
