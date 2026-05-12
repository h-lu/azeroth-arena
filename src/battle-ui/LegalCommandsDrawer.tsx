import type { Command } from "../../packages/rules/src";

type LegalCommandsDrawerProps = {
  commands: Command[];
  onSubmitCommand: (command: Command) => void;
};

function commandLabel(command: Command) {
  if (command.type === "playCard") return `Play ${command.cardId}`;
  if (command.type === "activateHero") return `Activate ${command.heroId}`;
  if (command.type === "moveHero") return `Move ${command.heroId}`;
  if (command.type === "selectFocusTarget") return `Focus ${command.targetId}`;
  if (command.type === "resolveReaction") return command.pass ? "Pass reaction" : "Resolve reaction";
  if (command.type === "useTrinket") return `Trinket ${command.heroId}`;
  if (command.type === "discardCards") return `Discard ${command.cardIds.length}`;
  return command.type;
}

export default function LegalCommandsDrawer({ commands, onSubmitCommand }: LegalCommandsDrawerProps) {
  return (
    <details className="legal-drawer">
      <summary>Legal commands</summary>
      <div>
        {commands.map((command, index) => (
          <button key={`${command.type}-${index}`} type="button" onClick={() => onSubmitCommand(command)}>
            {commandLabel(command)}
          </button>
        ))}
      </div>
    </details>
  );
}
