import type { ReactionCommand } from "../battle/targetModel";

type ReactionPromptProps = {
  commands: ReactionCommand[];
  onSubmitCommand: (command: ReactionCommand) => void;
};

function reactionLabel(command: ReactionCommand) {
  if (command.pass) return "Pass reaction";
  if (command.useTrinket) return "Use trinket";
  if (command.cardId) return `React with ${command.cardId}`;
  return "Resolve reaction";
}

export default function ReactionPrompt({ commands, onSubmitCommand }: ReactionPromptProps) {
  if (commands.length === 0) return null;

  return (
    <section className="reaction-prompt" aria-label="Reaction prompt">
      <span className="battle-kicker">Reaction window</span>
      <div>
        {commands.map((command, index) => (
          <button key={`${command.sourceHeroId}-${command.cardId ?? "pass"}-${index}`} type="button" onClick={() => onSubmitCommand(command)}>
            {reactionLabel(command)}
          </button>
        ))}
      </div>
    </section>
  );
}
