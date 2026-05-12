import { useEffect, useState } from "react";
import type { Command } from "../../packages/rules/src";
import BattleSceneLayer from "../battle-scene/BattleSceneLayer";
import AiOpponentPanel from "../battle-ui/AiOpponentPanel";
import HandFan from "../battle-ui/HandFan";
import HeroSlot from "../battle-ui/HeroSlot";
import LegalCommandsDrawer from "../battle-ui/LegalCommandsDrawer";
import MatchHud from "../battle-ui/MatchHud";
import ReactionPrompt from "../battle-ui/ReactionPrompt";
import type { ConnectionStatus } from "../onlineProtocol";
import type { BattleViewModel } from "./battleState";
import {
  findActivateHeroCommand,
  findEndTurnCommand,
  findFocusTargetCommand,
  findPassCommand,
  findPlayCardCommandForTarget,
  getPlayableCardCommands,
  getReactionCommands,
} from "./targetModel";

type BattleStageProps = {
  model: BattleViewModel;
  connectionStatus: ConnectionStatus;
  error: string | null;
  onSubmitCommand: (command: Command) => void;
  onExportReplay: () => void;
};

export default function BattleStage({ model, connectionStatus, error, onSubmitCommand, onExportReplay }: BattleStageProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [inputFeedback, setInputFeedback] = useState<string | null>(null);
  const reactionCommands = getReactionCommands(model.legalCommands);

  useEffect(() => {
    setSelectedCardId(null);
    setInputFeedback(null);
  }, [model.version]);

  function submitIfFound(command: Command | null) {
    if (command) onSubmitCommand(command);
  }

  function selectCard(cardId: string) {
    const playableCommands = getPlayableCardCommands(model.legalCommands, cardId);
    if (playableCommands.length === 0) {
      setInputFeedback("That card has no legal play right now.");
      setSelectedCardId(null);
      return;
    }
    setSelectedCardId(cardId);
    setInputFeedback("Choose a highlighted hero target.");
  }

  function targetHero(heroId: string) {
    if (!selectedCardId) return;
    const command = findPlayCardCommandForTarget(model.legalCommands, { cardId: selectedCardId, targetId: heroId });
    if (!command) {
      setInputFeedback("That hero is not a legal target for the selected card.");
      return;
    }
    setSelectedCardId(null);
    setInputFeedback(null);
    onSubmitCommand(command);
  }

  function activateOrTarget(heroId: string) {
    if (selectedCardId) {
      targetHero(heroId);
      return;
    }
    submitIfFound(findActivateHeroCommand(model.legalCommands, heroId));
  }

  return (
    <section className="battle-stage">
      <BattleSceneLayer model={model} />
      <MatchHud model={model} connectionStatus={connectionStatus} error={error} onExportReplay={onExportReplay} />
      <AiOpponentPanel model={model} />
      <ReactionPrompt commands={reactionCommands} onSubmitCommand={onSubmitCommand} />
      {inputFeedback ? <div className="input-feedback" role="status">{inputFeedback}</div> : null}
      <div className="battle-zones">
        {model.zones.map((zone) => (
          <section key={zone.id} className="battle-zone">
            <span>{zone.label}</span>
            <div className="zone-row enemy-row">
              {zone.enemyHeroes.map((hero) => (
                <HeroSlot
                  key={hero.id}
                  hero={hero}
                  alignment="enemy"
                  onTarget={targetHero}
                  onFocus={(heroId) => submitIfFound(findFocusTargetCommand(model.legalCommands, heroId))}
                />
              ))}
            </div>
            <div className="zone-row friendly-row">
              {zone.friendlyHeroes.map((hero) => (
                <HeroSlot key={hero.id} hero={hero} alignment="friendly" onActivate={activateOrTarget} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="battle-actions">
        <button type="button" onClick={() => submitIfFound(findPassCommand(model.legalCommands))}>Pass</button>
        <button type="button" onClick={() => submitIfFound(findEndTurnCommand(model.legalCommands))}>End turn</button>
      </div>
      <HandFan cards={model.hand} selectedCardId={selectedCardId} onSelectCard={selectCard} />
      <LegalCommandsDrawer commands={model.legalCommands} onSubmitCommand={onSubmitCommand} />
    </section>
  );
}
