import type { BattleViewModel } from "../battle/battleState";

type BattleSceneLayerProps = {
  model: BattleViewModel;
};

export default function BattleSceneLayer({ model }: BattleSceneLayerProps) {
  return (
    <div className="battle-scene-layer" aria-hidden="true">
      {model.zones.map((zone) => (
        <div key={zone.id} className={`battle-scene-lane lane-${zone.id}`} />
      ))}
    </div>
  );
}
