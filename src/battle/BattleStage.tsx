import type { Command } from "../../packages/rules/src";
import BattleSceneLayer from "../battle-scene/BattleSceneLayer";
import AiOpponentPanel from "../battle-ui/AiOpponentPanel";
import HandFan from "../battle-ui/HandFan";
import HeroSlot from "../battle-ui/HeroSlot";
import LegalCommandsDrawer from "../battle-ui/LegalCommandsDrawer";
import MatchHud from "../battle-ui/MatchHud";
import type { ConnectionStatus } from "../onlineProtocol";
import type { BattleViewModel } from "./battleState";
import { findActivateHeroCommand, findEndTurnCommand, findFocusTargetCommand, findPassCommand } from "./targetModel";

type BattleStageProps = {
  model: BattleViewModel;
  connectionStatus: ConnectionStatus;
  error: string | null;
  onSubmitCommand: (command: Command) => void;
  onExportReplay: () => void;
};

export default function BattleStage({ model, connectionStatus, error, onSubmitCommand, onExportReplay }: BattleStageProps) {
  function submitIfFound(command: Command | null) {
    if (command) onSubmitCommand(command);
  }

  return (
    <section className="battle-stage">
      <BattleSceneLayer model={model} />
      <MatchHud model={model} connectionStatus={connectionStatus} error={error} onExportReplay={onExportReplay} />
      <AiOpponentPanel model={model} />
      <div className="battle-zones">
        {model.zones.map((zone) => (
          <section key={zone.id} className="battle-zone">
            <span>{zone.label}</span>
            <div className="zone-row enemy-row">
              {zone.enemyHeroes.map((hero) => (
                <HeroSlot key={hero.id} hero={hero} alignment="enemy" onFocus={(heroId) => submitIfFound(findFocusTargetCommand(model.legalCommands, heroId))} />
              ))}
            </div>
            <div className="zone-row friendly-row">
              {zone.friendlyHeroes.map((hero) => (
                <HeroSlot key={hero.id} hero={hero} alignment="friendly" onActivate={(heroId) => submitIfFound(findActivateHeroCommand(model.legalCommands, heroId))} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="battle-actions">
        <button type="button" onClick={() => submitIfFound(findPassCommand(model.legalCommands))}>Pass</button>
        <button type="button" onClick={() => submitIfFound(findEndTurnCommand(model.legalCommands))}>End turn</button>
      </div>
      <HandFan cards={model.hand} />
      <LegalCommandsDrawer commands={model.legalCommands} onSubmitCommand={onSubmitCommand} />
    </section>
  );
}
