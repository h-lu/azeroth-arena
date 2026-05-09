# Week 10 AI Director v1 Playtest Report

## Scope

- Runs: `3`
- Encounter templates available: `15` (`rival-burst-check`, `mentor-stability-check`, `trickster-reaction-trap`, `sustain-dampening-race`, `controller-caster-lock`, `rival-finisher-watch`, `rival-target-discipline`, `rival-overextend-punish`, `mentor-reaction-audit`, `mentor-healer-stress`, `mentor-memory-rematch`, `trickster-pass-punish`, `trickster-control-loop`, `trickster-memory-feint`, `controller-line-tax`)
- Final memory matches: `3`
- Estimated AI cost: `$0.000`
- Total fallbacks: `0`

## Runs

### Run 1: Baseline target discipline

- Encounter: `rival-target-discipline`
- Winner: `red`; stopped: `winner`; final round: `4`
- Commands: `81`; structured sections: `3`; memory matches: `1`
- Metrics: cost=$0.000, latency=28ms, fallbacks=0
- JSON: `playtest-results/ai-director-v1/director-v1-run-1.json`
- Markdown: `playtest-results/ai-director-v1/director-v1-run-1.md`

### Run 2: Memory rematch

- Encounter: `mentor-memory-rematch`
- Winner: `red`; stopped: `winner`; final round: `4`
- Commands: `88`; structured sections: `3`; memory matches: `2`
- Metrics: cost=$0.000, latency=0ms, fallbacks=0
- JSON: `playtest-results/ai-director-v1/director-v1-run-2.json`
- Markdown: `playtest-results/ai-director-v1/director-v1-run-2.md`

### Run 3: Memory feint

- Encounter: `trickster-memory-feint`
- Winner: `red`; stopped: `winner`; final round: `4`
- Commands: `84`; structured sections: `3`; memory matches: `3`
- Metrics: cost=$0.000, latency=0ms, fallbacks=0
- JSON: `playtest-results/ai-director-v1/director-v1-run-3.json`
- Markdown: `playtest-results/ai-director-v1/director-v1-run-3.md`

