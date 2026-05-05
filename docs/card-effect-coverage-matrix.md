# Card Effect Coverage Matrix

This matrix freezes the current 50-card contract.

- `test coverage` names the closest existing regression surface.
- `setup` means the card is part of initial game-state contract only.
- `none` means there is no dedicated golden test for that card yet.
- `golden: mechanics-parity` covers the 2026-05-04 design-parity pass: fake cast, soft DR, round-1 burst lockout, suppression, DOT, line of sight, heal-reduction max, and recommended common package.
- `golden: command-parity` covers the 2026-05-04 command-complete pass: player-choice movement `toZone`, inline ordinary-damage defense, non-window trinket/insignia, fake-cast reveal, interrupt cooldown, focus selection, and hand-limit discard.
- `risk` is a freeze-time heuristic, not a balance rating.

| id | name | user | type | cost | effectKey | window | test coverage | risk | notes |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| 001-hero-rogue | 盗贼 | 蓝方 | 英雄 | 0 | hero | 否 | setup | low | opening state only; hero seed contract |
| 002-hero-mage | 法师 | 蓝方 | 英雄 | 0 | hero | 否 | setup | low | opening state only; hero seed contract |
| 003-hero-priest | 牧师 | 蓝方 | 英雄 | 0 | hero | 否 | setup | low | opening state only; hero seed contract |
| 004-hero-warrior | 战士 | 红方 | 英雄 | 0 | hero | 否 | setup | low | opening state only; hero seed contract |
| 005-hero-warlock | 术士 | 红方 | 英雄 | 0 | hero | 否 | setup | low | opening state only; hero seed contract |
| 006-hero-druid | 德鲁伊 | 红方 | 英雄 | 0 | hero | 否 | setup | low | opening state only; hero seed contract |
| 007-rogue-backstab | 背刺 | 盗贼 | 瞬发 / 伤害 | 1 | damage | 否 | golden: movement-damage | medium | melee opener and focus bonus path |
| 008-rogue-wound-poison | 致伤药膏 | 盗贼 | 瞬发 / 减疗 | 1 | damage-heal-reduction | 否 | golden: mechanics-parity | medium | heal-reduction max behavior covered |
| 009-rogue-kick | 脚踢 | 盗贼 | 反应 / 打断 | 1 | interrupt | 否 | golden: command-parity | high | interrupt cooldown contract applies to all interrupt ids |
| 010-rogue-kidney-shot | 肾击 | 盗贼 | 瞬发 / 硬控 | 2 | hard-control | 是：强控 | golden: high-risk-mechanics / mechanics-parity | high | trinket, DR, and control window covered |
| 011-rogue-shadowstep | 暗影步 | 盗贼 | 位移 / 关键位移 | 1 | key-move | 是：关键位移 | golden: mechanics-parity + playtest:mechanics | medium | movement plus next melee bonus in scripted playtest |
| 012-rogue-shadow-dance | 暗影之舞 | 盗贼 | 爆发 / 伤害 | 3 | burst-damage | 是：爆发 | none | high | burst damage pressure, no dedicated golden |
| 013-mage-frostbolt | 寒冰箭 | 法师 | 施法 / 伤害 / 软控 | 2 | spell-damage-soft-control | 是：施法 | golden: high-risk-mechanics / mechanics-parity | high | interrupt, line-of-sight, and soft-control DR covered |
| 014-mage-polymorph | 变形术 | 法师 | 施法 / 硬控 | 3 | hard-control | 是：施法 | golden: control-reaction | medium | window and trinket/cleanse flow |
| 015-mage-counterspell | 法术反制 | 法师 | 反应 / 打断 | 1 | interrupt | 否 | none | high | interrupt window, no dedicated golden |
| 016-mage-frost-nova | 冰霜新星 | 法师 | 瞬发 / 软控 | 2 | soft-control | 否 | golden: mechanics-parity | high | soft-control DR covered |
| 017-mage-ice-barrier | 寒冰屏障 | 法师 | 反应 / 防御 | 2 | damage-reduction | 否 | golden: command-parity | medium | inline ordinary-damage defense with move lock covered |
| 018-mage-pyroblast | 炎爆术 | 法师 | 施法 / 爆发 / 伤害 | 4 | burst-damage | 是：施法（同时视为爆发牌） | golden: high-risk-mechanics / mechanics-parity | high | spell-window burst defense and round-1 lockout covered |
| 019-priest-flash-heal | 快速治疗 | 牧师 | 施法 / 治疗 | 2 | heal | 是：施法 | golden: healing-shield-mortal / mechanics-parity | medium | spell window, healing math, and suppression interaction |
| 020-priest-power-word-shield | 真言术：盾 | 牧师 | 瞬发 / 护盾 | 1 | shield | 否 | golden: healing-shield-mortal / mechanics-parity | medium | shield math, opening shield, and suppression interaction |
| 021-priest-dispel-magic | 驱散魔法 | 牧师 | 瞬发 / 驱散 | 1 | dispel | 否 | none | medium | cleanse semantics, no dedicated golden |
| 022-priest-psychic-scream | 心灵尖啸 | 牧师 | 瞬发 / 硬控 | 3 | hard-control | 是：强控 | golden: command-parity | high | control window and owner-choice movement branch covered |
| 023-priest-pain-suppression | 痛苦压制 | 牧师 | 反应 / 防御 | 2 | damage-reduction | 否 | none | medium | burst defense, no dedicated golden |
| 024-priest-shadow-word-death | 暗言术：灭 | 牧师 | 瞬发 / 伤害 | 1 | damage | 否 | golden: focus-fire | medium | finisher pressure and focus target interaction |
| 025-warrior-heroic-strike | 英勇打击 | 战士 | 瞬发 / 伤害 | 1 | damage | 否 | golden: command-parity | medium | basic ordinary damage plus inline defense covered |
| 026-warrior-mortal-strike | 致死打击 | 战士 | 瞬发 / 减疗 / 伤害 | 2 | damage-heal-reduction | 否 | golden: healing-shield-mortal / mechanics-parity | medium | heal reduction plus corrected 3 damage |
| 027-warrior-pummel | 拳击 | 战士 | 反应 / 打断 | 1 | interrupt | 否 | none | high | interrupt window, no dedicated golden |
| 028-warrior-charge | 冲锋 | 战士 | 位移 / 关键位移 | 1 | key-move | 是：关键位移 | none | medium | movement opener, no dedicated golden |
| 029-warrior-intimidating-shout | 破胆怒吼 | 战士 | 瞬发 / 硬控 | 3 | hard-control | 是：强控 | none | high | hard-control window, no dedicated golden |
| 030-warrior-recklessness | 鲁莽 | 战士 | 爆发 / 伤害 | 3 | burst-damage | 是：爆发 | none | high | burst damage window, no dedicated golden |
| 031-warlock-corruption | 腐蚀术 | 术士 | 瞬发 / 持续伤害 | 1 | dot | 否 | golden: mechanics-parity | medium | delayed end-round damage covered |
| 032-warlock-drain-life | 吸取生命 | 术士 | 施法 / 伤害 / 治疗 | 2 | spell-damage-heal | 是：施法 | none | medium | cast damage plus self-heal, no dedicated golden |
| 033-warlock-fear | 恐惧术 | 术士 | 施法 / 硬控 | 3 | hard-control | 是：施法 | none | high | cast hard-control window, no dedicated golden |
| 034-warlock-spell-lock | 法术封锁 | 术士 | 反应 / 打断 | 1 | interrupt | 否 | golden: high-risk-mechanics / command-parity | high | interrupt window, fake-cast bait, and cooldown lifecycle covered |
| 035-warlock-curse-of-agony | 痛苦诅咒 | 术士 | 施法 / 减疗 / 压力 | 2 | debuff | 是：施法 | golden: mechanics-parity | medium | cast debuff, 2 damage, and heal-reduction max covered |
| 036-warlock-chaos-bolt | 混乱箭 | 术士 | 施法 / 爆发 / 伤害 | 4 | burst-damage | 是：施法（同时视为爆发牌） | playtest:mechanics | high | scripted burst spell and defense exchange |
| 037-druid-rejuvenation | 回春术 | 德鲁伊 | 瞬发 / 治疗 | 1 | heal | 否 | none | medium | spot heal with pillar bonus, no dedicated golden |
| 038-druid-swiftmend | 迅捷治愈 | 德鲁伊 | 瞬发 / 治疗 | 2 | heal | 否 | none | medium | spot heal with damage-taken bonus, no dedicated golden |
| 039-druid-cyclone | 旋风 | 德鲁伊 | 施法 / 硬控 | 3 | hard-control | 是：施法 | none | high | cast hard-control window, no dedicated golden |
| 040-druid-entangling-roots | 纠缠根须 | 德鲁伊 | 施法 / 软控 | 2 | soft-control | 是：施法 | none | high | soft-control plus key-move lock, no dedicated golden |
| 041-druid-barkskin | 树皮术 | 德鲁伊 | 反应 / 防御 | 1 | damage-reduction | 否 | golden: command-parity | medium | inline defense rules share validation with barkskin positioning |
| 042-druid-wild-charge | 野性冲锋 | 德鲁伊 | 位移 / 关键位移 | 1 | key-move-shield | 是：关键位移 | golden: command-parity / playtest:command-parity | medium | command `toZone` and focus-escape shield covered |
| 043-common-fake-cast | 假读条 | 任意英雄 | 施法 / 战术 | 0 | fake-cast | 是：施法 | golden: mechanics-parity / command-parity / playtest:mechanics | high | fake-cast interrupt bait, draw, and revealedCardId covered |
| 044-common-pillar-dance | 绕柱 | 任意英雄 | 位移 / 关键位移 | 1 | key-move-shield | 是：关键位移 | golden: high-risk-mechanics / command-parity / playtest:mechanics | medium | movement window, pillar reset, and command `toZone` covered |
| 045-common-focus-mark | 集火标记 | 任意英雄 | 战术 / 压力 | 1 | focus-mark | 否 | golden: focus-fire / command-parity | medium | card reset plus start-round focus selection command covered |
| 046-common-arena-insignia | 竞技场徽记 | 将受硬控或已受硬控的英雄 | 反应 / 解控 | 0 | cleanse-control | 否 | golden: control-reaction / command-parity | medium | window and non-window hard-control cleanse with decay +1 covered |
| 047-common-team-protection | 团队保护 | 任意英雄 | 反应 / 防御 | 2 | damage-reduction | 否 | golden: high-risk-mechanics / mechanics-parity | medium | burst defense and recommended package covered |
| 048-common-tactical-retreat | 战术撤退 | 任意英雄 | 反应 / 位移 | 1 | key-move | 否 | golden: command-parity / playtest:command-parity | medium | focus-target escape movement now accepts `toZone` |
| 049-common-pressure-footwork | 压迫走位 | 任意英雄 | 瞬发 / 软控 | 1 | soft-control | 否 | golden: mechanics-parity | high | soft-control DR covered; excluded from recommended package |
| 050-common-hold-the-line | 稳住阵线 | 任意英雄 | 瞬发 / 护盾 | 1 | shield | 否 | golden: mechanics-parity | medium | recommended common package covered |
