# Week 6 Vertical Slice Playtest Report

## Scope

- Matches in run: `3`
- Blue heroes: blue-rogue:rogue, blue-mage:mage, blue-priest:priest
- Red heroes: red-warrior:warrior, red-warlock:warlock, red-druid:druid
- AI styles covered: `aggressive`, `control`, `sustain`
- Encounter templates available: `5` (`rival-burst-check`, `mentor-stability-check`, `trickster-reaction-trap`, `sustain-dampening-race`, `controller-caster-lock`)

## Match Results

### Match 1: Burst readability check

- Encounter: `rival-burst-check`
- Styles: blue `sustain`, red `aggressive`
- Winner: `red`; stopped: `winner`; final round: `4`
- Commands: `81`; decisions: `81`; replay entries: `92`
- Intent hints: `4`; Director traces: `9`; fallbacks: `0`
- Intent mix: setup=45, no-op=14, pressure=7, bait=12, finish=1, survive=2
- Command mix: activateHero=21, moveHero=8, endTurn=14, selectFocusTarget=8, playCard=13, startTurn=3, resolveReaction=14
- AI review: Turn 3 was decisive because a trinket was spent in the replay.
- Replay JSON: `playtest-results/ai-vertical-slice/match-1-replay.json`
- Review MD: `playtest-results/ai-vertical-slice/match-1-ai-review.md`

### Match 2: Caster lock control check

- Encounter: `controller-caster-lock`
- Styles: blue `aggressive`, red `control`
- Winner: `red`; stopped: `winner`; final round: `4`
- Commands: `84`; decisions: `84`; replay entries: `95`
- Intent hints: `4`; Director traces: `9`; fallbacks: `0`
- Intent mix: setup=46, pressure=7, no-op=15, survive=2, bait=13, finish=1
- Command mix: selectFocusTarget=8, activateHero=21, playCard=12, moveHero=9, endTurn=15, resolveReaction=16, startTurn=3
- AI review: Turn 3 was decisive because an interrupt was recorded in the replay.
- Replay JSON: `playtest-results/ai-vertical-slice/match-2-replay.json`
- Review MD: `playtest-results/ai-vertical-slice/match-2-ai-review.md`

### Match 3: Dampening recovery check

- Encounter: `sustain-dampening-race`
- Styles: blue `control`, red `sustain`
- Winner: `red`; stopped: `winner`; final round: `4`
- Commands: `88`; decisions: `88`; replay entries: `99`
- Intent hints: `4`; Director traces: `9`; fallbacks: `0`
- Intent mix: setup=52, survive=2, no-op=15, pressure=7, bait=11, finish=1
- Command mix: selectFocusTarget=8, activateHero=23, playCard=14, resolveReaction=14, moveHero=11, endTurn=15, startTurn=3
- AI review: Turn 3 was decisive because an interrupt was recorded in the replay.
- Replay JSON: `playtest-results/ai-vertical-slice/match-3-replay.json`
- Review MD: `playtest-results/ai-vertical-slice/match-3-ai-review.md`

## Readability Notes

- The run covers distinct aggressive, control, and sustain enemy styles through the same legal-command BotPolicy path.
- Each match records replay entries plus a replay-derived AI post-game review with concrete key turns or fallback checkpoints.
- Five Director templates are whitelisted for the vertical slice; the 3-match run samples one template per AI style while leaving the extra templates available for Web debug selection.
