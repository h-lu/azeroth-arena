import type { BattleHandCard } from "../battle/battleState";

type CardTileProps = {
  card: BattleHandCard;
};

export default function CardTile({ card }: CardTileProps) {
  return (
    <article className={card.legalCommandCount > 0 ? "card-tile playable" : "card-tile"}>
      <span>{card.type}</span>
      <strong>{card.name}</strong>
      <small>{card.role}</small>
      <b>{card.cost}</b>
    </article>
  );
}
