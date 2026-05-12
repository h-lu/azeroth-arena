import type { BattleHero } from "../battle/battleState";

type HeroSlotProps = {
  hero: BattleHero;
  alignment: "friendly" | "enemy";
  onActivate?: (heroId: string) => void;
  onFocus?: (heroId: string) => void;
  onTarget?: (heroId: string) => void;
};

export default function HeroSlot({ hero, alignment, onActivate, onFocus, onTarget }: HeroSlotProps) {
  return (
    <article className={`hero-slot ${alignment} ${hero.alive ? "" : "defeated"}`}>
      <button type="button" className="hero-main" onClick={() => onTarget ? onTarget(hero.id) : onActivate?.(hero.id)}>
        <span>{hero.displayName}</span>
        <small>{hero.role}</small>
        <meter min={0} max={100} value={hero.hpPercent}>{hero.hpPercent}%</meter>
      </button>
      <div className="hero-badges">
        {hero.statusLabels.map((label) => <span key={label}>{label}</span>)}
      </div>
      {alignment === "enemy" ? (
        <button type="button" className="focus-button" onClick={() => onFocus?.(hero.id)}>Focus</button>
      ) : null}
    </article>
  );
}
