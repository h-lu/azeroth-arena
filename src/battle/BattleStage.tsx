import { useEffect, useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import type { Command } from "../../packages/rules/src";
import BattleSceneLayer from "../battle-scene/BattleSceneLayer";
import AiOpponentPanel from "../battle-ui/AiOpponentPanel";
import HandFan from "../battle-ui/HandFan";
import HeroSlot from "../battle-ui/HeroSlot";
import LegalCommandsDrawer from "../battle-ui/LegalCommandsDrawer";
import MatchHud from "../battle-ui/MatchHud";
import ReactionPrompt from "../battle-ui/ReactionPrompt";
import ZoneTargetButton from "../battle-ui/ZoneTargetButton";
import type { ConnectionStatus } from "../onlineProtocol";
import type { BattleViewModel } from "./battleState";
import {
  findActivateHeroCommand,
  findEndTurnCommand,
  findFocusTargetCommand,
  findPassCommand,
  findPlayCardCommandForTarget,
  findPlayCardCommandForZone,
  getPlayableCardCommands,
  getReactionCommands,
} from "./targetModel";
import type { ZoneId } from "../../packages/data/src";
import { resolvePlayCardDrop, type BattleDropTarget } from "./dragModel";

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
    setInputFeedback(playableCommands.some((command) => command.toZone) ? "Choose a hero or lane target." : "Choose a highlighted hero target.");
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

  function targetZone(toZone: ZoneId) {
    if (!selectedCardId) return;
    const zoneCommands = getPlayableCardCommands(model.legalCommands, selectedCardId).filter((command) => command.toZone === toZone);
    const zoneOnlyCommand = zoneCommands.find((command) => command.targetIds.length === 0);
    if (zoneOnlyCommand) {
      setSelectedCardId(null);
      setInputFeedback(null);
      onSubmitCommand(zoneOnlyCommand);
      return;
    }
    const zoneCommand = findPlayCardCommandForZone(model.legalCommands, { cardId: selectedCardId, toZone });
    if (zoneCommand) {
      setInputFeedback("That card also needs a hero target before choosing this lane.");
      return;
    }
    setInputFeedback("That lane is not a legal target for the selected card.");
  }

  function parseDropTarget(event: DragEndEvent): { cardId: string; target: BattleDropTarget } | null {
    const cardId = event.active.data.current?.cardId;
    const target = event.over?.data.current;
    if (typeof cardId !== "string" || !target) return null;
    if (target.kind === "hero" && typeof target.heroId === "string") {
      return { cardId, target: { kind: "hero", heroId: target.heroId } };
    }
    if (target.kind === "zone" && typeof target.zoneId === "string") {
      return { cardId, target: { kind: "zone", zoneId: target.zoneId as ZoneId } };
    }
    return null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const dropTarget = parseDropTarget(event);
    if (!dropTarget) {
      setInputFeedback("Drop the card on a hero or lane target.");
      return;
    }
    const result = resolvePlayCardDrop(model.legalCommands, dropTarget.cardId, dropTarget.target);
    if (result.command) {
      setSelectedCardId(null);
      setInputFeedback(null);
      onSubmitCommand(result.command);
      return;
    }
    setSelectedCardId(dropTarget.cardId);
    setInputFeedback(result.feedback);
  }

  function activateOrTarget(heroId: string) {
    if (selectedCardId) {
      targetHero(heroId);
      return;
    }
    submitIfFound(findActivateHeroCommand(model.legalCommands, heroId));
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <section className="battle-stage">
      <BattleSceneLayer model={model} />
      <MatchHud model={model} connectionStatus={connectionStatus} error={error} onExportReplay={onExportReplay} />
      <AiOpponentPanel model={model} />
      <ReactionPrompt commands={reactionCommands} onSubmitCommand={onSubmitCommand} />
      {inputFeedback ? <div className="input-feedback" role="status">{inputFeedback}</div> : null}
      <div className="battle-zones">
        {model.zones.map((zone) => (
          <section key={zone.id} className="battle-zone">
            <ZoneTargetButton zoneId={zone.id} label={zone.label} onTargetZone={targetZone} />
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
    </DndContext>
  );
}
