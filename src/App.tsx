import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CARDS, HERO_DEFS, isAdjacentZone, type Side, type ZoneId } from "../packages/data/src";
import {
  applyCommand,
  createInitialGameState,
  getLegalCommands,
  type Command,
  type GameState,
  type HeroState,
  type ReactionWindow,
} from "../packages/rules/src";
import type { AIEncounterDebugState, PlayerView, ReplayExportBundle, RoomMode, ConnectionStatus, RoomJoinedPayload, RoomErrorPayload } from "./onlineProtocol";
import {
  clearOnlineSeat,
  describeConnectionStatus,
  describeRoomError,
  hasReconnectSession,
  persistOnlineSeat,
  persistPreferredSide,
  persistServerUrl,
  readStoredOnlineSession,
  sanitizeRoomCode,
  statusAfterRoomError,
  type PreferredSide,
} from "./onlineSession";
import { cardFaceSrc, heroPortraitSrc } from "./cardAssets";

type PlayTargetOption = {
  signature: string;
  targetIds: string[];
  label: string;
  command: Extract<Command, { type: "playCard" }>;
};

type CardAvailability = {
  state: string;
  label: string;
};

type DragTargetKind = "none" | "commit" | "choice";

type SocketAction =
  | { type: "createRoom"; preferredSide?: Side }
  | { type: "createAIEncounter"; preferredSide?: Side; encounterTemplateId?: string }
  | { type: "joinRoom"; roomCode: string; preferredSide?: Side }
  | { type: "reconnect"; roomCode: string; side: Side; seatToken: string }
  | { type: "submitCommand"; roomCode: string; side: Side; seatToken: string; command: Command; expectedVersion?: number }
  | { type: "exportReplay"; roomCode: string; side: Side; seatToken: string };

type SocketPurpose = "connect" | "reconnect";

type ActiveSocket = {
  id: number;
  socket: WebSocket;
  purpose: SocketPurpose;
  manuallyClosed: boolean;
};

const CARD_BY_ID = Object.fromEntries(CARDS.map((card) => [card.id, card]));
const HERO_BY_ID = Object.fromEntries(HERO_DEFS.map((hero) => [hero.id, hero]));
const ZONES: ZoneId[] = ["left", "center", "right"];
const PLAYER_COMMAND_TYPES = ["activateHero", "moveHero", "pass", "endTurn", "startTurn", "selectFocusTarget", "useTrinket", "discardCards"] as const;
const CHOICE_MOVE_CARD_IDS = new Set(["022-priest-psychic-scream", "042-druid-wild-charge", "044-common-pillar-dance", "048-common-tactical-retreat"]);
const ORDINARY_DAMAGE_CARD_IDS = new Set(["007-rogue-backstab", "008-rogue-wound-poison", "024-priest-shadow-word-death", "025-warrior-heroic-strike", "026-warrior-mortal-strike", "031-warlock-corruption"]);
const AI_ENCOUNTER_TEMPLATE_OPTIONS = [
  { id: "rival-burst-check", label: "Rival Burst Check" },
  { id: "mentor-stability-check", label: "Mentor Stability Check" },
  { id: "trickster-reaction-trap", label: "Trickster Reaction Trap" },
];

function sideLabel(side: Side) {
  return side === "blue" ? "蓝方" : "红方";
}

function zoneLabel(zone: string) {
  switch (zone) {
    case "left":
      return "左柱";
    case "center":
      return "中场";
    case "right":
      return "右柱";
    default:
      return zone;
  }
}

function roleLabel(role: HeroState["role"]) {
  switch (role) {
    case "rogue":
      return "近战 / 控制";
    case "mage":
      return "远程 / 施法";
    case "priest":
      return "治疗 / 驱散";
    case "warrior":
      return "近战 / 压制";
    case "warlock":
      return "远程 / 持压";
    case "druid":
      return "治疗 / 机动";
  }
}

function phaseLabel(phase: GameState["phase"]) {
  switch (phase) {
    case "main":
      return "行动阶段";
    case "reaction":
      return "反应窗口";
    case "between-rounds":
      return "回合间";
    case "finished":
      return "已结束";
  }
}

function reactionKindLabel(kind: ReactionWindow["kind"]) {
  switch (kind) {
    case "spell":
      return "施法";
    case "burst":
      return "爆发";
    case "control":
      return "强控";
    case "movement":
      return "关键位移";
  }
}

function formatReaction(window: ReactionWindow | null) {
  if (!window) return "无";
  const responder = window.stage === "enemy" ? (window.sourceSide === "blue" ? "红方" : "蓝方") : sideLabel(window.sourceSide);
  return `${reactionKindLabel(window.kind)} / ${responder}响应`;
}

function listNames(ids: string[]) {
  return ids.map((id) => HERO_BY_ID[id]?.name ?? CARD_BY_ID[id]?.name ?? id).join(" / ");
}

function heroSoftControl(hero: HeroState) {
  const values = [
    hero.nextActivationNoMove ? "不能移动" : null,
    hero.nextActivationNoKeyMove ? "不能关键位移" : null,
    hero.nextActivationNoResponse ? "不能响应" : null,
  ].filter(Boolean);
  return values.length > 0 ? values.join("，") : "无";
}

function heroHardControl(hero: HeroState) {
  if (hero.pendingHardControl > 0) {
    return `${hero.pendingHardControl}${hero.hardControlSourceId ? ` (${hero.hardControlSourceId})` : ""}`;
  }
  return "无";
}

function heroStatusBadges(hero: HeroState) {
  return [
    hero.pendingHardControl > 0 ? "硬控" : null,
    hero.nextActivationNoMove || hero.nextActivationNoKeyMove || hero.nextActivationNoResponse ? "软控" : null,
    hero.healReduction > 0 ? "减疗" : null,
    hero.shield > 0 ? "护盾" : null,
    !hero.trinketAvailable ? "饰品已用" : null,
    !hero.alive ? "倒下" : null,
  ].filter(Boolean);
}

function heroHpPercent(hero: HeroState) {
  return `${Math.max(0, Math.min(100, Math.round((hero.hp / hero.maxHp) * 100)))}%`;
}

function commandLabel(command: Command) {
  switch (command.type) {
    case "activateHero":
      return `激活 ${HERO_BY_ID[command.heroId]?.name ?? command.heroId}`;
    case "moveHero":
      return `移动 ${HERO_BY_ID[command.heroId]?.name ?? command.heroId} 到${zoneLabel(command.toZone)}`;
    case "pass":
      return "让过";
    case "endTurn":
      return "结束回合";
    case "startTurn":
      return "开始新回合";
    case "playCard":
      return `打出 ${CARD_BY_ID[command.cardId]?.name ?? command.cardId}`;
    case "resolveReaction":
      if (command.pass) return `${HERO_BY_ID[command.sourceHeroId]?.name ?? command.sourceHeroId} 不响应`;
      if (command.useTrinket) return `${HERO_BY_ID[command.sourceHeroId]?.name ?? command.sourceHeroId} 使用饰品解控`;
      return `反应 ${HERO_BY_ID[command.sourceHeroId]?.name ?? command.sourceHeroId} / ${CARD_BY_ID[command.cardId ?? ""]?.name ?? command.cardId ?? "未知"}`;
    case "selectFocusTarget":
      return `选择集火 ${HERO_BY_ID[command.targetId]?.name ?? command.targetId}`;
    case "useTrinket":
      return command.cardId
        ? `使用 ${CARD_BY_ID[command.cardId]?.name ?? command.cardId} ${HERO_BY_ID[command.heroId]?.name ?? command.heroId}`
        : `使用饰品 ${HERO_BY_ID[command.heroId]?.name ?? command.heroId}`;
    case "discardCards":
      return `弃牌 ${command.cardIds.map((cardId) => CARD_BY_ID[cardId]?.name ?? cardId).join("、")}`;
  }
  const exhaustive: never = command;
  return exhaustive;
}

function playTargetSignature(command: Extract<Command, { type: "playCard" }>) {
  return [
    command.targetIds.join("|"),
    command.toZone ?? "",
    command.revealedCardId ?? "",
    command.defenseSourceHeroId ?? "",
    command.defenseCardId ?? "",
    command.defenseTargetId ?? "",
  ].join("::");
}

function buildPlayTargetOptions(commands: Command[]) {
  const options = new Map<string, PlayTargetOption>();
  for (const command of commands) {
    if (command.type !== "playCard") continue;
    const signature = playTargetSignature(command);
    if (options.has(signature)) continue;
    const labelParts = [command.targetIds.length > 0 ? listNames(command.targetIds) : "无目标"];
    if (command.toZone) labelParts.push(`到${zoneLabel(command.toZone)}`);
    if (command.revealedCardId) labelParts.push(`展示 ${CARD_BY_ID[command.revealedCardId]?.name ?? command.revealedCardId}`);
    if (command.defenseCardId) {
      labelParts.push(`防御 ${HERO_BY_ID[command.defenseSourceHeroId ?? ""]?.name ?? command.defenseSourceHeroId} / ${CARD_BY_ID[command.defenseCardId]?.name ?? command.defenseCardId}`);
    }
    options.set(signature, {
      signature,
      targetIds: command.targetIds,
      label: labelParts.join(" · "),
      command,
    });
  }
  return [...options.values()];
}

function opposite(side: Side): Side {
  return side === "blue" ? "red" : "blue";
}

function canUseCardWithHero(cardId: string, hero: HeroState) {
  const card = CARD_BY_ID[cardId];
  if (!card) return false;
  return card.role === "any" || card.role === "common" || card.role === hero.role || card.user === "任意英雄" || card.side === "common";
}

function buildTargetSets(state: GameState, cardId: string) {
  if (cardId === "043-common-fake-cast") return [[]];
  const aliveIds = Object.values(state.heroes)
    .filter((hero) => hero.alive)
    .map((hero) => hero.id);
  const sets: string[][] = aliveIds.map((id) => [id]);
  if (cardId === "016-mage-frost-nova" || cardId === "050-common-hold-the-line") {
    for (let i = 0; i < aliveIds.length; i += 1) {
      for (let j = i + 1; j < aliveIds.length; j += 1) {
        sets.push([aliveIds[i], aliveIds[j]]);
      }
    }
  }
  return sets;
}

function buildToZoneChoices(state: GameState, cardId: string, targetIds: string[]) {
  if (!CHOICE_MOVE_CARD_IDS.has(cardId)) return [undefined];
  const target = state.heroes[targetIds[0]];
  if (!target) return [undefined];
  return ZONES.filter((zone) => zone !== target.zone && isAdjacentZone(target.zone, zone));
}

function buildRevealChoices(state: GameState, side: Side, hero: HeroState, cardId: string) {
  if (cardId !== "043-common-fake-cast") return [undefined];
  return state.players[side].hand.filter((candidateId) => {
    const candidate = CARD_BY_ID[candidateId];
    return Boolean(candidate && candidate.id !== "043-common-fake-cast" && candidate.type.includes("施法") && canUseCardWithHero(candidateId, hero));
  });
}

function buildInlineDefenseVariants(state: GameState, command: Extract<Command, { type: "playCard" }>) {
  if (!ORDINARY_DAMAGE_CARD_IDS.has(command.cardId) || command.targetIds.length === 0) return [command];
  const variants = [command];
  const defenderSide = opposite(command.playerId);
  const defenseCards = state.players[defenderSide].hand.filter((cardId) => CARD_BY_ID[cardId]?.effectKey === "damage-reduction");
  if (defenseCards.length === 0) return variants;
  const defenseHeroes = Object.values(state.heroes).filter((hero) => hero.side === defenderSide && hero.alive);
  for (const defenseSourceHero of defenseHeroes) {
    for (const defenseCardId of defenseCards) {
      if (!canUseCardWithHero(defenseCardId, defenseSourceHero)) continue;
      for (const defenseTargetId of command.targetIds) {
        variants.push({ ...command, defenseSourceHeroId: defenseSourceHero.id, defenseCardId, defenseTargetId });
      }
    }
  }
  return variants;
}

function buildPlayableCardCommands(state: GameState, activeCommands: Command[], side: Side, heroId: string | null, cardId: string | null) {
  if (!heroId || !cardId) return [];
  const hero = state.heroes[heroId];
  if (!hero) return [];
  const candidates: Extract<Command, { type: "playCard" }>[] = activeCommands.filter(
    (command): command is Extract<Command, { type: "playCard" }> =>
      command.type === "playCard" && command.playerId === side && command.sourceHeroId === heroId && command.cardId === cardId,
  );

  for (const targetIds of buildTargetSets(state, cardId)) {
    for (const toZone of buildToZoneChoices(state, cardId, targetIds)) {
      for (const revealedCardId of buildRevealChoices(state, side, hero, cardId)) {
        const base = { type: "playCard" as const, playerId: side, sourceHeroId: heroId, cardId, targetIds, toZone, revealedCardId };
        candidates.push(...buildInlineDefenseVariants(state, base));
      }
    }
  }

  const legal = new Map<string, Extract<Command, { type: "playCard" }>>();
  for (const candidate of candidates) {
    const signature = playTargetSignature(candidate);
    if (legal.has(signature)) continue;
    const result = applyCommand(state, candidate);
    if (result.errors.length === 0) legal.set(signature, candidate);
  }
  return [...legal.values()];
}

function cardAvailabilityLabel(state: GameState, activeCommands: Command[], side: Side, heroId: string | null, cardId: string) {
  const card = CARD_BY_ID[cardId];
  if (!card) return { state: "disabled", label: "未知卡牌" };
  const hero = heroId ? state.heroes[heroId] : null;
  if (!hero) return { state: "disabled", label: "先选择英雄" };
  if (hero.side !== side) return { state: "disabled", label: "不能由该方使用" };
  if (state.phase === "reaction") return card.type.includes("反应") ? { state: "playable", label: "反应可用" } : { state: "disabled", label: "等待反应结算" };
  if (card.type.includes("反应") && card.id !== "048-common-tactical-retreat") return { state: "disabled", label: "反应牌" };
  if (state.activation?.heroId !== hero.id) return { state: "disabled", label: "先激活英雄" };
  if (state.players[side].focusAvailable < card.cost) return { state: "disabled", label: "专注不足" };
  if (state.round === 1 && card.type.includes("爆发")) return { state: "disabled", label: "第1回合不能爆发" };
  if (buildPlayableCardCommands(state, activeCommands, side, hero.id, cardId).length > 0) return { state: "playable", label: "可打" };
  return { state: "disabled", label: "无合法目标" };
}

function commandGroupLabel(command: Command) {
  switch (command.type) {
    case "selectFocusTarget":
      return "选择集火";
    case "activateHero":
      return "激活英雄";
    case "moveHero":
      return "移动";
    case "useTrinket":
      return "饰品 / 解控";
    case "discardCards":
    case "startTurn":
      return "回合交接";
    case "pass":
    case "endTurn":
      return "结束 / 让过";
    default:
      return "其他";
  }
}

function nextActionHint(state: GameState, commands: Command[], mode: RoomMode, canUseRoom: boolean) {
  if (mode === "online" && !canUseRoom) return "连接或恢复在线房间后开始操作。";
  if (state.winner) return `${sideLabel(state.winner)} 已获胜。`;
  if (state.pendingReaction) {
    const responder = state.pendingReaction.stage === "enemy" ? opposite(state.pendingReaction.sourceSide) : state.pendingReaction.sourceSide;
    return `${sideLabel(responder)}处理${reactionKindLabel(state.pendingReaction.kind)}反应：打断、防御、饰品，或选择不响应。`;
  }
  const discard = commands.find((command) => command.type === "discardCards");
  if (discard?.type === "discardCards") return `${sideLabel(discard.playerId)}需要弃 ${discard.cardIds.length} 张牌到手牌上限。`;
  if (commands.some((command) => command.type === "startTurn")) return "双方手牌已整理，可以开始新回合。";
  const focus = commands.find((command) => command.type === "selectFocusTarget" && !state.players[command.playerId].focusTargetSelectedThisRound);
  if (focus?.type === "selectFocusTarget") return `${sideLabel(focus.playerId)}先公开选择本回合集火目标。`;
  if (state.activation) {
    const hero = state.heroes[state.activation.heroId];
    return `${sideLabel(state.currentPlayer)}正在操作${hero?.name ?? "英雄"}：可以移动、打出一张牌，或结束这次激活。`;
  }
  return `${sideLabel(state.currentPlayer)}选择一名未激活英雄，或让过结束本轮行动。`;
}

function pickDefaultHero(state: GameState, side: Side) {
  return state.activation?.heroId ?? Object.values(state.heroes).find((hero) => hero.side === side && hero.alive)?.id ?? null;
}

function selectModeLabel(mode: RoomMode) {
  return mode === "local" ? "本地热座" : "在线房间";
}

function threatLabel(threatType: string) {
  switch (threatType) {
    case "burst":
      return "爆发";
    case "control":
      return "控制";
    case "interrupt":
      return "打断";
    case "heal":
      return "治疗";
    case "defense":
      return "防守";
    case "movement":
      return "位移";
    case "resource":
      return "资源";
    case "damage":
      return "伤害";
    default:
      return threatType;
  }
}

function confidenceLabel(confidenceBand: string) {
  switch (confidenceBand) {
    case "high":
      return "高";
    case "mid":
      return "中";
    case "low":
      return "低";
    default:
      return confidenceBand;
  }
}

function CardFace({ cardId, availability }: { cardId: string; availability: CardAvailability }) {
  const card = CARD_BY_ID[cardId];
  if (!card) return null;
  return (
    <>
      <div className="hand-card-image">
        <img src={cardFaceSrc(card.id)} alt="" loading="lazy" />
      </div>
      <div className="hand-card-body">
        <div className="hand-card-title">
          <strong>{card.name}</strong>
          <span className="cost-orb">{card.cost}</span>
        </div>
        <div className="card-meta">
          <span>{card.type}</span>
          <span>{card.target}</span>
        </div>
        <p className="card-effect">{card.effect}</p>
        <div className="card-state-row">
          <span className={["card-state", availability.state].join(" ")}>{availability.label}</span>
          <span>{card.user}</span>
        </div>
      </div>
    </>
  );
}

function DraggableHandCard({
  cardId,
  index,
  selected,
  availability,
  draggable,
  motionEnabled,
  onSelect,
}: {
  cardId: string;
  index: number;
  selected: boolean;
  availability: CardAvailability;
  draggable: boolean;
  motionEnabled: boolean;
  onSelect: (cardId: string) => void;
}) {
  const card = CARD_BY_ID[cardId];
  const dragId = `hand:${cardId}:${index}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    disabled: !draggable,
    data: { cardId, index },
  });
  if (!card) return null;
  return (
    <motion.button
      ref={setNodeRef}
      key={dragId}
      type="button"
      layout={motionEnabled}
      initial={motionEnabled ? { opacity: 0, y: 18, scale: 0.97 } : false}
      animate={motionEnabled ? { opacity: isDragging ? 0.42 : 1, y: 0, scale: 1 } : { opacity: isDragging ? 0.42 : 1 }}
      exit={motionEnabled ? { opacity: 0, y: -12, scale: 0.96 } : { opacity: 0 }}
      transition={motionEnabled ? { type: "spring", stiffness: 420, damping: 34, mass: 0.75 } : { duration: 0 }}
      whileHover={motionEnabled && availability.state === "playable" ? { y: -7, scale: 1.012 } : undefined}
      whileTap={motionEnabled && availability.state === "playable" ? { scale: 0.985 } : undefined}
      className={[
        "hand-card",
        selected ? "selected" : "",
        availability.state === "playable" ? "playable" : "disabled-card",
        draggable ? "draggable-card" : "",
        isDragging ? "dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onSelect(cardId)}
      aria-label={`${card.name}，${availability.label}${draggable ? "，可拖到合法英雄目标" : ""}`}
      {...attributes}
      {...listeners}
    >
      <CardFace cardId={cardId} availability={availability} />
    </motion.button>
  );
}

function DroppableHeroSlot({
  hero,
  placement,
  selected,
  targeted,
  focusedByEnemy,
  focusSelectable,
  active,
  dragTargetKind,
  motionEnabled,
  onClick,
}: {
  hero: HeroState;
  placement: "opponent" | "player";
  selected: boolean;
  targeted: boolean;
  focusedByEnemy: boolean;
  focusSelectable: boolean;
  active: boolean;
  dragTargetKind: DragTargetKind;
  motionEnabled: boolean;
  onClick: (hero: HeroState) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `hero:${hero.id}`,
    data: { heroId: hero.id },
  });
  const badges = heroStatusBadges(hero);
  const dropLabel =
    dragTargetKind === "commit" ? "拖放可直接打出" : dragTargetKind === "choice" ? "拖放需先选择效果" : "当前拖拽不可作为目标";
  return (
    <motion.button
      ref={setNodeRef}
      type="button"
      layout={motionEnabled}
      initial={motionEnabled ? { opacity: 0, y: placement === "opponent" ? -12 : 12 } : false}
      animate={motionEnabled ? { opacity: 1, y: 0 } : { opacity: 1 }}
      transition={motionEnabled ? { type: "spring", stiffness: 360, damping: 32 } : { duration: 0 }}
      className={[
        "hero-slot",
        placement,
        hero.side === "blue" ? "blue" : "red",
        selected ? "selected" : "",
        targeted ? "targeted" : "",
        focusedByEnemy ? "focused" : "",
        focusSelectable ? "focus-selectable" : "",
        !hero.alive ? "dead" : "",
        active ? "active" : "",
        dragTargetKind !== "none" ? `drop-${dragTargetKind}` : "",
        isOver ? "drop-over" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onClick(hero)}
      aria-label={`${hero.name}，${zoneLabel(hero.zone)}，${hero.hp}/${hero.maxHp} HP，${dropLabel}`}
    >
      <span className="hero-zone-badge">{zoneLabel(hero.zone)}</span>
      <div className="hero-portrait">
        <img src={heroPortraitSrc(hero.role)} alt="" loading="lazy" />
        <div className="hp-meter" aria-hidden="true">
          <span style={{ width: heroHpPercent(hero) }} />
        </div>
      </div>
      <div className="hero-slot-main">
        <div>
          <strong>{hero.name}</strong>
          <span>{roleLabel(hero.role)}</span>
        </div>
        <span className="hero-hp">{hero.hp}/{hero.maxHp}</span>
      </div>
      <div className="hero-badges compact">
        {focusedByEnemy ? <span>集火标记</span> : null}
        {targeted ? <span>当前目标</span> : null}
        {focusSelectable ? <span>点击标记</span> : null}
        {dragTargetKind === "commit" ? <span>可拖放</span> : null}
        {dragTargetKind === "choice" ? <span>多选</span> : null}
        {badges.slice(0, 3).map((badge) => (
          <span key={badge}>{badge}</span>
        ))}
        {badges.length === 0 && !focusedByEnemy && !targeted && !focusSelectable && dragTargetKind === "none" ? <span>稳定</span> : null}
      </div>
    </motion.button>
  );
}

export default function App() {
  const initialOnlineSession = readStoredOnlineSession();
  const [mode, setMode] = useState<RoomMode>("local");
  const [localGame, setLocalGame] = useState(() => createInitialGameState());
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedTargetSignature, setSelectedTargetSignature] = useState<string>("");
  const [activeDragCardId, setActiveDragCardId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [serverUrl, setServerUrl] = useState(() => initialOnlineSession.serverUrl);
  const [preferredSide, setPreferredSide] = useState<PreferredSide>(() => initialOnlineSession.preferredSide);
  const [roomCode, setRoomCode] = useState(() => initialOnlineSession.roomCode);
  const [seatSide, setSeatSide] = useState<Side | null>(() => initialOnlineSession.side);
  const [seatToken, setSeatToken] = useState(() => initialOnlineSession.seatToken);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [onlineView, setOnlineView] = useState<PlayerView | null>(null);
  const [exportBundle, setExportBundle] = useState<ReplayExportBundle | null>(null);
  const [aiEncounterDebug, setAIEncounterDebug] = useState<AIEncounterDebugState | null>(null);
  const [encounterTemplateId, setEncounterTemplateId] = useState(AI_ENCOUNTER_TEMPLATE_OPTIONS[0].id);

  const socketRef = useRef<ActiveSocket | null>(null);
  const socketIdRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const autoReconnectKeyRef = useRef<string>("");
  const onlineSessionRef = useRef({ serverUrl, roomCode, seatSide, seatToken });
  const prefersReducedMotion = useReducedMotion();
  const motionEnabled = !prefersReducedMotion;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const activeState = mode === "local" ? localGame : onlineView?.state ?? localGame;
  const controlSide = mode === "local" ? activeState.currentPlayer : onlineView?.side ?? (seatSide ?? "blue");
  const activeCommands = mode === "local" ? getLegalCommands(activeState) : onlineView?.legalCommands ?? [];
  const controlledHeroes = Object.values(activeState.heroes).filter((hero) => hero.side === controlSide && hero.alive);
  const currentHand = mode === "local" ? activeState.players[activeState.currentPlayer].hand : onlineView?.state.players[controlSide].hand ?? [];
  const selectedHero = selectedHeroId ? activeState.heroes[selectedHeroId] ?? null : null;
  const selectedCard = selectedCardId ? CARD_BY_ID[selectedCardId] ?? null : null;
  const playCommands = buildPlayableCardCommands(activeState, activeCommands, controlSide, selectedHeroId, selectedCardId);
  const playTargetOptions = buildPlayTargetOptions(playCommands);
  const selectedPlayCommand = playTargetOptions.find((option) => option.signature === selectedTargetSignature)?.command ?? playCommands[0] ?? null;
  const reactionCommands = activeCommands.filter((command) => command.type === "resolveReaction");
  const focusTargetCommands = activeCommands.filter((command): command is Extract<Command, { type: "selectFocusTarget" }> => command.type === "selectFocusTarget");
  const roundInfo = `回合 ${activeState.round}`;
  const focusSummary = `蓝方 ${activeState.players.blue.focusAvailable} / 红方 ${activeState.players.red.focusAvailable}`;
  const currentFocus = activeState.players[activeState.currentPlayer];
  const currentFocusTarget = currentFocus.focusTargetId ? HERO_BY_ID[currentFocus.focusTargetId]?.name ?? currentFocus.focusTargetId : "无";
  const activeHeroName = activeState.activation?.heroId ? activeState.heroes[activeState.activation.heroId]?.name ?? activeState.activation.heroId : "无";
  const blueHeroes = Object.values(activeState.heroes).filter((hero) => hero.side === "blue");
  const redHeroes = Object.values(activeState.heroes).filter((hero) => hero.side === "red");
  const blueHp = blueHeroes.reduce((sum, hero) => sum + hero.hp, 0);
  const redHp = redHeroes.reduce((sum, hero) => sum + hero.hp, 0);
  const blueMaxHp = blueHeroes.reduce((sum, hero) => sum + hero.maxHp, 0);
  const redMaxHp = redHeroes.reduce((sum, hero) => sum + hero.maxHp, 0);
  const canUseRoom = mode === "online" && !!onlineView;
  const hasSavedOnlineSeat = hasReconnectSession(roomCode, seatSide, seatToken);
  const currentStatusLabel = mode === "local" ? selectModeLabel(mode) : `${selectModeLabel(mode)} / ${describeConnectionStatus(connectionStatus)}`;
  const savedSessionLabel = hasSavedOnlineSeat && seatSide ? `已保存 ${sanitizeRoomCode(roomCode)} / ${sideLabel(seatSide)}` : "未保存恢复信息";
  const playerCommands = activeCommands.filter((command) => PLAYER_COMMAND_TYPES.includes(command.type as (typeof PLAYER_COMMAND_TYPES)[number]));
  const groupedCommands = playerCommands.reduce<Record<string, Command[]>>((groups, command) => {
    const label = commandGroupLabel(command);
    groups[label] = [...(groups[label] ?? []), command];
    return groups;
  }, {});
  const allCooldowns = (["blue", "red"] as Side[]).flatMap((side) =>
    activeState.players[side].cooldowns.map((cooldown) => ({
      ...cooldown,
      side,
    })),
  );
  const actionHint = nextActionHint(activeState, activeCommands, mode, canUseRoom);
  const selectedTargetIds = selectedPlayCommand?.targetIds ?? [];
  const playerSide = controlSide;
  const opponentSide = opposite(playerSide);
  const playerHeroes = Object.values(activeState.heroes).filter((hero) => hero.side === playerSide);
  const opponentHeroes = Object.values(activeState.heroes).filter((hero) => hero.side === opponentSide);
  const playerHp = playerHeroes.reduce((sum, hero) => sum + hero.hp, 0);
  const opponentHp = opponentHeroes.reduce((sum, hero) => sum + hero.hp, 0);
  const playerMaxHp = playerHeroes.reduce((sum, hero) => sum + hero.maxHp, 0);
  const opponentMaxHp = opponentHeroes.reduce((sum, hero) => sum + hero.maxHp, 0);
  const opponentHandCount = mode === "online" && onlineView
    ? onlineView.state.players[opponentSide].handCount
    : activeState.players[opponentSide].hand.length;
  const latestIntentHint = aiEncounterDebug?.intentHints.at(-1) ?? null;
  const latestAIDecision = aiEncounterDebug?.decisionTraces.at(-1) ?? null;
  const latestAIDialogue = aiEncounterDebug?.dialogue.at(-1) ?? null;

  useEffect(() => {
    setSelectedHeroId((previous) => {
      if (previous && controlledHeroes.some((hero) => hero.id === previous)) {
        return previous;
      }
      return pickDefaultHero(activeState, controlSide);
    });
  }, [activeState, controlSide, controlledHeroes.map((hero) => hero.id).join("|")]);

  useEffect(() => {
    setSelectedCardId((previous) => {
      if (previous && currentHand.includes(previous)) {
        return previous;
      }
      return currentHand[0] ?? null;
    });
  }, [currentHand.join("|"), controlSide, mode]);

  useEffect(() => {
    setSelectedTargetSignature((previous) => {
      if (playTargetOptions.some((option) => option.signature === previous)) {
        return previous;
      }
      return playTargetOptions[0]?.signature ?? "";
    });
  }, [selectedHeroId, selectedCardId, playTargetOptions.map((option) => option.signature).join("|")]);

  useEffect(() => {
    onlineSessionRef.current = { serverUrl, roomCode, seatSide, seatToken };
  }, [serverUrl, roomCode, seatSide, seatToken]);

  useEffect(() => {
    persistServerUrl(serverUrl);
  }, [serverUrl]);

  useEffect(() => {
    persistPreferredSide(preferredSide);
  }, [preferredSide]);

  useEffect(() => {
    persistOnlineSeat(roomCode, seatSide, seatToken);
  }, [roomCode, seatSide, seatToken]);

  useEffect(() => {
    return () => {
      closeActiveSocket({ clearView: false, status: "disconnected" });
    };
  }, []);

  useEffect(() => {
    closeActiveSocket({ clearView: true, status: "disconnected" });
  }, [serverUrl]);

  useEffect(() => {
    if (mode !== "online" || onlineView || connectionStatus === "connecting" || connectionStatus === "reconnecting") return;
    if (!hasReconnectSession(roomCode, seatSide, seatToken)) return;
    const key = `${serverUrl}|${sanitizeRoomCode(roomCode)}|${seatSide}`;
    if (autoReconnectKeyRef.current === key) return;
    autoReconnectKeyRef.current = key;
    void reconnectRoom({ auto: true });
  }, [mode, serverUrl, roomCode, seatSide, seatToken, onlineView, connectionStatus]);

  function handleServerMessage(rawMessage: string) {
    try {
      const message = JSON.parse(rawMessage) as
        | { type: "roomJoined"; payload: RoomJoinedPayload }
        | { type: "playerView"; payload: PlayerView }
        | { type: "roomError"; payload: RoomErrorPayload }
        | { type: "replayExport"; payload: { roomCode: string; export: ReplayExportBundle } }
        | { type: "aiEncounterUpdated"; payload: AIEncounterDebugState }
        | { type: "opponentDisconnected"; payload: { roomCode: string; side: Side } };

      switch (message.type) {
        case "roomJoined":
          setRoomCode(sanitizeRoomCode(message.payload.roomCode));
          setSeatSide(message.payload.side);
          setSeatToken(message.payload.seatToken);
          setOnlineView(message.payload.playerView);
          setConnectionStatus("connected");
          reconnectAttemptRef.current = 0;
          setExportBundle(null);
          if (message.payload.roomKind !== "aiEncounter") {
            setAIEncounterDebug(null);
          }
          setErrorMessage(null);
          return;
        case "playerView":
          setOnlineView(message.payload);
          setConnectionStatus("connected");
          reconnectAttemptRef.current = 0;
          return;
        case "roomError":
          setConnectionStatus((current) => statusAfterRoomError(message.payload, current));
          setErrorMessage(describeRoomError(message.payload));
          return;
        case "replayExport":
          setExportBundle(message.payload.export);
          return;
        case "aiEncounterUpdated":
          setAIEncounterDebug(message.payload);
          return;
        case "opponentDisconnected":
          setErrorMessage(`${sideLabel(message.payload.side)} 已断开连接，对方可使用保存的 roomCode / side / seatToken 恢复。`);
          return;
      }
    } catch {
      setErrorMessage("无法解析服务端消息");
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimerRef.current === null) return;
    window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }

  function isActiveSocket(handle: ActiveSocket) {
    return socketRef.current?.id === handle.id;
  }

  function closeActiveSocket(options: { clearView: boolean; status: ConnectionStatus }) {
    clearReconnectTimer();
    const active = socketRef.current;
    if (!active) {
      setConnectionStatus(options.status);
      if (options.clearView) {
        setOnlineView(null);
        setExportBundle(null);
        setAIEncounterDebug(null);
      }
      return;
    }
    active.manuallyClosed = true;
    socketRef.current = null;
    if (active.socket.readyState === WebSocket.OPEN || active.socket.readyState === WebSocket.CONNECTING) {
      active.socket.close();
    }
    setConnectionStatus(options.status);
    if (options.clearView) {
      setOnlineView(null);
      setExportBundle(null);
      setAIEncounterDebug(null);
    }
  }

  function scheduleReconnect() {
    const session = onlineSessionRef.current;
    if (!hasReconnectSession(session.roomCode, session.seatSide, session.seatToken)) {
      setConnectionStatus("disconnected");
      setErrorMessage("连接已断开，且没有完整的恢复信息。");
      return;
    }
    if (reconnectAttemptRef.current >= 2) {
      setConnectionStatus("disconnected");
      setErrorMessage("连接已断开，自动恢复未成功。请检查服务端后点击 Reconnect。");
      return;
    }
    if (reconnectTimerRef.current !== null) return;
    reconnectAttemptRef.current += 1;
    setConnectionStatus("reconnecting");
    setErrorMessage("连接中断，正在尝试恢复房间会话。");
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void reconnectRoom({ auto: true });
    }, 600);
  }

  function attachHandlers(handle: ActiveSocket) {
    const { socket } = handle;
    socket.onopen = () => {
      if (!isActiveSocket(handle)) return;
      setConnectionStatus(handle.purpose === "reconnect" ? "reconnecting" : "connecting");
    };
    socket.onerror = () => {
      if (!isActiveSocket(handle)) return;
      setConnectionStatus("error");
      setErrorMessage("无法连接到房间服务");
    };
    socket.onclose = () => {
      if (!isActiveSocket(handle)) return;
      socketRef.current = null;
      if (handle.manuallyClosed) {
        setConnectionStatus("disconnected");
        return;
      }
      scheduleReconnect();
    };
    socket.onmessage = (event) => {
      if (!isActiveSocket(handle)) return;
      if (typeof event.data === "string") {
        handleServerMessage(event.data);
        return;
      }
      if (event.data instanceof Blob) {
        void event.data.text().then(handleServerMessage).catch(() => setErrorMessage("无法读取服务端消息"));
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        handleServerMessage(new TextDecoder().decode(event.data));
        return;
      }
      handleServerMessage(String(event.data));
    };
  }

  async function openFreshSocket(purpose: SocketPurpose) {
    closeActiveSocket({
      clearView: purpose === "connect",
      status: purpose === "reconnect" ? "reconnecting" : "connecting",
    });
    const socket = new WebSocket(serverUrl);
    const handle: ActiveSocket = {
      id: socketIdRef.current + 1,
      socket,
      purpose,
      manuallyClosed: false,
    };
    socketIdRef.current = handle.id;
    socketRef.current = handle;
    attachHandlers(handle);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener(
        "open",
        () => resolve(),
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => reject(new Error("websocket connection failed")),
        { once: true },
      );
      socket.addEventListener(
        "close",
        () => reject(new Error("websocket connection closed before open")),
        { once: true },
      );
    });
    return socket;
  }

  function getActiveSocket() {
    const active = socketRef.current;
    if (!active || active.socket.readyState !== WebSocket.OPEN) {
      return null;
    }
    return active.socket;
  }

  async function sendSocketAction(action: SocketAction, purpose: SocketPurpose = "connect", freshConnection = false, requireExisting = false) {
    let socket = getActiveSocket();
    if (!socket) {
      if (requireExisting) {
        throw new Error("当前没有可用的在线连接，请先 Reconnect。");
      }
      socket = await openFreshSocket(purpose);
    } else if (freshConnection) {
      socket = await openFreshSocket(purpose);
    }
    socket.send(JSON.stringify(action));
  }

  function commitLocalCommand(command: Command) {
    const result = applyCommand(localGame, command);
    if (result.errors.length > 0) {
      setErrorMessage(result.errors[0] ?? "命令执行失败");
      return;
    }
    setLocalGame(result.state);
    setErrorMessage(null);
  }

  async function commitCommand(command: Command) {
    if (mode === "local") {
      commitLocalCommand(command);
      return;
    }
    if (!onlineView || !seatSide || !seatToken) {
      setErrorMessage("请先连接在线房间");
      return;
    }
    try {
      await sendSocketAction(
        {
          type: "submitCommand",
          roomCode: roomCode || onlineView.roomCode,
          side: seatSide,
          seatToken,
          command,
          expectedVersion: onlineView.version,
        },
        "connect",
        false,
        true,
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function resetLocalGame() {
    setLocalGame(createInitialGameState());
    setSelectedHeroId(null);
    setSelectedCardId(null);
    setSelectedTargetSignature("");
    setErrorMessage(null);
  }

  function disconnectRoom() {
    closeActiveSocket({ clearView: false, status: "disconnected" });
    setErrorMessage("已断开当前连接；保存的房间信息仍可用于 Reconnect。");
  }

  function forgetSavedSeat() {
    closeActiveSocket({ clearView: true, status: "disconnected" });
    clearOnlineSeat();
    setRoomCode("");
    setSeatSide(null);
    setSeatToken("");
    setErrorMessage(null);
  }

  async function createRoom() {
    reconnectAttemptRef.current = 0;
    setAIEncounterDebug(null);
    try {
      await sendSocketAction(
        {
          type: "createRoom",
          preferredSide: preferredSide === "auto" ? undefined : preferredSide,
        },
        "connect",
        true,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function createAIEncounter() {
    reconnectAttemptRef.current = 0;
    setAIEncounterDebug(null);
    try {
      await sendSocketAction(
        {
          type: "createAIEncounter",
          preferredSide: preferredSide === "auto" ? "blue" : preferredSide,
          encounterTemplateId,
        },
        "connect",
        true,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function joinRoom() {
    if (!roomCode) {
      setErrorMessage("请输入房间码");
      return;
    }
    reconnectAttemptRef.current = 0;
    setAIEncounterDebug(null);
    try {
      await sendSocketAction(
        {
          type: "joinRoom",
          roomCode: sanitizeRoomCode(roomCode),
          preferredSide: preferredSide === "auto" ? undefined : preferredSide,
        },
        "connect",
        true,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function reconnectRoom(options: { auto?: boolean } = {}) {
    if (!roomCode || !seatSide || !seatToken) {
      setErrorMessage("缺少 roomCode / side / seatToken，无法重连");
      return;
    }
    try {
      await sendSocketAction(
        {
          type: "reconnect",
          roomCode: sanitizeRoomCode(roomCode),
          side: seatSide,
          seatToken,
        },
        "reconnect",
        true,
      );
      setErrorMessage(options.auto ? "正在恢复保存的在线房间。" : null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function exportReplay() {
    if (!canUseRoom || !onlineView || !seatSide || !seatToken) {
      setErrorMessage("需要连接在线房间后才能导出 replay");
      return;
    }
    try {
      await sendSocketAction(
        {
          type: "exportReplay",
          roomCode: onlineView.roomCode,
          side: seatSide,
          seatToken,
        },
        "connect",
        false,
        true,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function handleHeroClick(hero: HeroState) {
    const focusCommand = focusTargetCommands.find((command) => command.targetId === hero.id);
    if (focusCommand) {
      void commitCommand(focusCommand);
      return;
    }
    if (selectedCardId && selectedHeroId && hero.side !== controlSide) {
      const targetOption = playTargetOptions.find((option) => option.targetIds.length === 1 && option.targetIds[0] === hero.id);
      if (targetOption) {
        setSelectedTargetSignature(targetOption.signature);
        return;
      }
    }
    if (hero.side === controlSide) {
      setSelectedHeroId(hero.id);
      return;
    }
    if (selectedCardId) {
      const targetOption = playTargetOptions.find((option) => option.targetIds.includes(hero.id));
      if (targetOption) {
        setSelectedTargetSignature(targetOption.signature);
        return;
      }
      setErrorMessage(`当前选择的卡牌不能以 ${hero.name} 为目标`);
    }
  }

  function handleSelectCard(cardId: string) {
    setSelectedCardId(cardId);
    setErrorMessage(null);
  }

  function handlePlayCard() {
    if (!selectedPlayCommand) {
      setErrorMessage("当前没有可执行的打牌命令");
      return;
    }
    void commitCommand(selectedPlayCommand);
  }

  function playOptionsForCard(cardId: string) {
    return buildPlayTargetOptions(buildPlayableCardCommands(activeState, activeCommands, controlSide, selectedHeroId, cardId));
  }

  function matchingDropOptions(cardId: string, heroId: string) {
    return playOptionsForCard(cardId).filter((option) => option.targetIds.includes(heroId));
  }

  function dragTargetKindFor(cardId: string | null, heroId: string): DragTargetKind {
    if (!cardId) return "none";
    const matches = matchingDropOptions(cardId, heroId);
    if (matches.length === 1) return "commit";
    if (matches.length > 1) return "choice";
    return "none";
  }

  function handleDragStart(event: DragStartEvent) {
    const cardId = event.active.data.current?.cardId;
    if (typeof cardId !== "string") return;
    setActiveDragCardId(cardId);
    setSelectedCardId(cardId);
    setErrorMessage(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const cardId = event.active.data.current?.cardId;
    const heroId = event.over?.data.current?.heroId;
    setActiveDragCardId(null);
    if (typeof cardId !== "string") return;
    if (typeof heroId !== "string") {
      setSelectedCardId(cardId);
      return;
    }
    const matches = matchingDropOptions(cardId, heroId);
    setSelectedCardId(cardId);
    if (matches.length === 1) {
      setSelectedTargetSignature(matches[0].signature);
      void commitCommand(matches[0].command);
      return;
    }
    if (matches.length > 1) {
      setSelectedTargetSignature(matches[0].signature);
      setErrorMessage(`${CARD_BY_ID[cardId]?.name ?? cardId} 对 ${HERO_BY_ID[heroId]?.name ?? heroId} 有多个合法效果，请用目标 / 效果选择确认。`);
      return;
    }
    setErrorMessage(`${CARD_BY_ID[cardId]?.name ?? cardId} 不能以 ${HERO_BY_ID[heroId]?.name ?? heroId} 为目标。`);
  }

  function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function renderHeroSlot(hero: HeroState, placement: "opponent" | "player") {
    const focusSelectable = focusTargetCommands.some((command) => command.targetId === hero.id);
    const focusedByEnemy = activeState.players[opposite(hero.side)].focusTargetId === hero.id;
    const isTargeted = selectedTargetIds.includes(hero.id);
    return (
      <DroppableHeroSlot
        key={hero.id}
        hero={hero}
        placement={placement}
        selected={selectedHeroId === hero.id}
        targeted={isTargeted}
        focusedByEnemy={focusedByEnemy}
        focusSelectable={focusSelectable}
        active={activeState.activation?.heroId === hero.id}
        dragTargetKind={dragTargetKindFor(activeDragCardId, hero.id)}
        motionEnabled={motionEnabled}
        onClick={handleHeroClick}
      />
    );
  }

  function renderHandCard(cardId: string, index: number) {
    const card = CARD_BY_ID[cardId];
    if (!card) return null;
    const availability = cardAvailabilityLabel(activeState, activeCommands, controlSide, selectedHeroId, cardId);
    const draggable =
      availability.state === "playable" &&
      playOptionsForCard(cardId).some((option) => option.targetIds.length > 0) &&
      (mode === "local" || canUseRoom);
    return (
      <DraggableHandCard
        key={`${cardId}-${index}`}
        cardId={cardId}
        index={index}
        selected={selectedCardId === cardId}
        availability={availability}
        draggable={draggable}
        motionEnabled={motionEnabled}
        onSelect={handleSelectCard}
      />
    );
  }

  const aiEncounterPanel = aiEncounterDebug ? (
    <section className="drawer-section ai-debug-panel">
      <details open>
        <summary className="side-summary">
          <span>AI Debug</span>
          <small>{aiEncounterDebug.encounter.templateId}</small>
        </summary>
        <div className="ai-debug-grid">
          <div>
            <span>Persona</span>
            <strong>{aiEncounterDebug.persona.name}</strong>
            <small>{aiEncounterDebug.encounter.enemyStyle} · AI {sideLabel(aiEncounterDebug.aiSide)}</small>
          </div>
          <div>
            <span>Auto Advance</span>
            <strong>{aiEncounterDebug.autoAdvance.lastStoppedReason}</strong>
            <small>{aiEncounterDebug.autoAdvance.lastStepCount} AI command(s) after last trigger</small>
          </div>
          <div>
            <span>Replay</span>
            <strong>v{aiEncounterDebug.replaySummary.version} / R{aiEncounterDebug.replaySummary.round}</strong>
            <small>{aiEncounterDebug.replaySummary.commandCount} commands · {aiEncounterDebug.replaySummary.responseWindowCount} reactions</small>
          </div>
        </div>
        <div className="ai-debug-list">
          <strong>本局目标</strong>
          {aiEncounterDebug.objectives.map((objective) => (
            <div key={objective.id} className="ai-debug-item">
              <span>{objective.name}</span>
              <small>{objective.publicText}</small>
            </div>
          ))}
        </div>
        <div className="ai-debug-list">
          <strong>战场词缀</strong>
          {aiEncounterDebug.battlefieldModifiers.map((modifier) => (
            <div key={modifier.id} className="ai-debug-item">
              <span>{modifier.name}</span>
              <small>{modifier.publicText}</small>
            </div>
          ))}
        </div>
        <div className="ai-debug-list">
          <strong>敌方意图</strong>
          {aiEncounterDebug.intentHints.slice().reverse().map((hint) => (
            <div key={`${hint.turn}-${hint.threatType}-${hint.text}`} className="ai-debug-item">
              <span>Turn {hint.turn} · {threatLabel(hint.threatType)} · {confidenceLabel(hint.confidenceBand)}</span>
              <small>{hint.text}{hint.targetEntityIds.length > 0 ? ` · ${listNames(hint.targetEntityIds)}` : ""}</small>
            </div>
          ))}
        </div>
        <div className="ai-debug-list">
          <strong>AI Decision Trace</strong>
          {aiEncounterDebug.decisionTraces.slice().reverse().map((trace) => (
            <details key={trace.decisionId} className="log-item">
              <summary>
                <span className="log-type">{trace.intent}</span>
                <span>v{trace.version} · {trace.style} · {trace.selectedCommandType ?? "no command"}</span>
              </summary>
              <pre>{JSON.stringify(trace, null, 2)}</pre>
            </details>
          ))}
          {aiEncounterDebug.decisionTraces.length === 0 ? <div className="hint">AI 尚未行动。</div> : null}
        </div>
        <div className="ai-debug-list">
          <strong>Director Trace</strong>
          {aiEncounterDebug.directorTraces.slice().reverse().map((trace) => (
            <details key={trace.traceId} className="log-item">
              <summary>
                <span className="log-type">{trace.outputType}</span>
                <span>v{trace.version ?? 0} · {trace.source} · fallback={String(trace.fallbackUsed)}</span>
              </summary>
              <pre>{JSON.stringify(trace, null, 2)}</pre>
            </details>
          ))}
        </div>
        {aiEncounterDebug.postGameSummary ? (
          <div className="ai-debug-list">
            <strong>Post-game Summary</strong>
            <div className="ai-debug-item">
              <span>{aiEncounterDebug.postGameSummary.decisiveMoment}</span>
              <small>{aiEncounterDebug.postGameSummary.nextRunSuggestion}</small>
            </div>
          </div>
        ) : null}
      </details>
    </section>
  ) : null;

  const summaryPanel = mode === "online" ? (
    <section className="drawer-section online-panel">
      <details open>
        <summary className="side-summary">
          <span>在线房间</span>
          <small>{describeConnectionStatus(connectionStatus)}</small>
        </summary>
      <div className="online-form">
        <label className="field">
          <span>服务器地址</span>
          <input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="ws://localhost:8788 或 wss://hblu.top/wow-ws" />
        </label>
        <label className="field">
          <span>偏好座位</span>
          <select value={preferredSide} onChange={(event) => setPreferredSide(event.target.value as PreferredSide)}>
            <option value="auto">自动</option>
            <option value="blue">蓝方</option>
            <option value="red">红方</option>
          </select>
        </label>
        <label className="field">
          <span>房间码</span>
          <input value={roomCode} onChange={(event) => setRoomCode(sanitizeRoomCode(event.target.value))} placeholder="ABC123" />
        </label>
        <label className="field">
          <span>AI Encounter</span>
          <select value={encounterTemplateId} onChange={(event) => setEncounterTemplateId(event.target.value)}>
            {AI_ENCOUNTER_TEMPLATE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Seat Token</span>
          <input value={seatToken} onChange={(event) => setSeatToken(event.target.value)} placeholder="reconnect token" type="password" autoComplete="off" />
        </label>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => void createRoom()}>
            创建房间
          </button>
          <button type="button" className="primary-button" onClick={() => void createAIEncounter()}>
            AI 遭遇
          </button>
          <button type="button" className="primary-button" onClick={() => void joinRoom()}>
            加入房间
          </button>
          <button type="button" className="ghost-button" onClick={() => void reconnectRoom()}>
            恢复连接
          </button>
          <button type="button" className="ghost-button" onClick={disconnectRoom}>
            断开
          </button>
          <button type="button" className="ghost-button" onClick={forgetSavedSeat}>
            清除座位
          </button>
          <button type="button" className="ghost-button" onClick={() => void exportReplay()}>
            导出 replay
          </button>
        </div>
        <div className="status-grid">
          <div className={`status-chip status-${connectionStatus}`}>状态 {describeConnectionStatus(connectionStatus)}</div>
          <div className="status-chip">房间 {roomCode || "未加入"}</div>
          <div className="status-chip">座位 {seatSide ? sideLabel(seatSide) : "未分配"}</div>
          <div className="status-chip">恢复 {savedSessionLabel}</div>
        </div>
      </div>
      {exportBundle ? (
        <details className="export-grid">
          <summary className="side-summary">
            <span>Replay Export</span>
            <small>{exportBundle.summary.roomCode}</small>
          </summary>
          <div className="export-block">
            <div className="export-header">
              <strong>JSON</strong>
              <button type="button" className="ghost-button" onClick={() => downloadText(`${exportBundle.summary.roomCode}.json`, exportBundle.json, "application/json;charset=utf-8")}>
                下载
              </button>
            </div>
            <textarea readOnly value={exportBundle.json} />
          </div>
          <div className="export-block">
            <div className="export-header">
              <strong>CSV</strong>
              <button type="button" className="ghost-button" onClick={() => downloadText(`${exportBundle.summary.roomCode}.csv`, exportBundle.csv, "text/csv;charset=utf-8")}>
                下载
              </button>
            </div>
            <textarea readOnly value={exportBundle.csv} />
          </div>
          <div className="export-block">
            <div className="export-header">
              <strong>Markdown</strong>
              <button type="button" className="ghost-button" onClick={() => downloadText(`${exportBundle.summary.roomCode}.md`, exportBundle.markdown, "text/markdown;charset=utf-8")}>
                下载
              </button>
            </div>
            <textarea readOnly value={exportBundle.markdown} />
          </div>
        </details>
      ) : null}
      </details>
    </section>
  ) : null;

  return (
    <div className="game-client-shell">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragCardId(null)}>
        <main className="game-stage">
          <header className="game-top-hud">
            <div className="game-brand">
              <span>Azeroth Arena</span>
              <strong>{roundInfo}</strong>
            </div>
            <div className="game-status-orbs" aria-label="战局状态">
              <span>{phaseLabel(activeState.phase)}</span>
              <span>当前 {sideLabel(activeState.currentPlayer)}</span>
              <span>激活 {activeHeroName}</span>
              <span>抑制 {activeState.suppression}</span>
              <span>{currentStatusLabel}</span>
            </div>
            <div className="game-menu-controls">
              <button type="button" className={["mode-rune", mode === "local" ? "selected" : ""].filter(Boolean).join(" ")} onClick={() => setMode("local")}>
                本地
              </button>
              <button type="button" className={["mode-rune", mode === "online" ? "selected" : ""].filter(Boolean).join(" ")} onClick={() => setMode("online")}>
                在线
              </button>
              <button type="button" className="menu-rune" onClick={() => setMenuOpen(true)} aria-label="打开游戏菜单">
                菜单
              </button>
            </div>
          </header>

          <AnimatePresence>
            {errorMessage ? (
              <motion.section
                className="floating-banner error-banner"
                role="alert"
                initial={motionEnabled ? { opacity: 0, y: -12 } : false}
                animate={motionEnabled ? { opacity: 1, y: 0 } : { opacity: 1 }}
                exit={motionEnabled ? { opacity: 0, y: -8 } : { opacity: 0 }}
              >
                {errorMessage}
              </motion.section>
            ) : null}
          </AnimatePresence>

          {activeState.winner ? <section className="floating-banner winner-banner">胜者：{sideLabel(activeState.winner)}</section> : null}

          {aiEncounterDebug ? (
            <section className="ai-debug-ribbon" aria-label="AI encounter debug">
              <div>
                <span className="mini-tag">AI Encounter</span>
                <strong>{aiEncounterDebug.persona.name}</strong>
                <small>{aiEncounterDebug.encounter.openingIntent}</small>
              </div>
              <div>
                <span className="selection-label">敌方意图</span>
                <strong>{latestIntentHint ? `${threatLabel(latestIntentHint.threatType)} / ${confidenceLabel(latestIntentHint.confidenceBand)}` : "未生成"}</strong>
                <small>{latestIntentHint?.text ?? "等待 Director hint"}</small>
              </div>
              <div>
                <span className="selection-label">AI Trace</span>
                <strong>{latestAIDecision ? `${latestAIDecision.intent} ${Math.round(latestAIDecision.confidence * 100)}%` : "等待 AI 行动"}</strong>
                <small>{latestAIDecision ? latestAIDecision.selectedCommandType ?? "no command" : latestAIDialogue?.line ?? "暂无决策"}</small>
              </div>
            </section>
          ) : null}

          <section className="team-band opponent-band">
            <div className="team-crest opponent">
              <span>{sideLabel(opponentSide)} 对手</span>
              <strong>{opponentHp}/{opponentMaxHp}</strong>
              <small>专注 {activeState.players[opponentSide].focusAvailable} · 手牌 {opponentHandCount}</small>
            </div>
            <div className="hero-slot-row arena-heroes opponent-heroes">
              {opponentHeroes.map((hero) => renderHeroSlot(hero, "opponent"))}
            </div>
          </section>

          <section className="arena-playmat">
            <div className="arena-ring" aria-hidden="true" />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${activeState.phase}-${activeState.pendingReaction?.sourceCardId ?? "none"}-${currentFocusTarget}-${activeHeroName}`}
                className="playmat-prompt"
                initial={motionEnabled ? { opacity: 0, y: 10 } : false}
                animate={motionEnabled ? { opacity: 1, y: 0 } : { opacity: 1 }}
                exit={motionEnabled ? { opacity: 0, y: -8 } : { opacity: 0 }}
                transition={motionEnabled ? { duration: 0.18, ease: "easeOut" } : { duration: 0 }}
              >
                <span className="mini-tag">{roundInfo} · {phaseLabel(activeState.phase)} · 反应窗 {formatReaction(activeState.pendingReaction)}</span>
                <h1>{actionHint}</h1>
                <p>集火 {currentFocusTarget} · 专注 {focusSummary} · {selectedHero?.name ?? "未选英雄"} / {selectedCard?.name ?? "未选手牌"}</p>
              </motion.div>
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {activeDragCardId ? (
                <motion.div
                  key="drag-target-hint"
                  className="drag-target-hint"
                  initial={motionEnabled ? { opacity: 0, y: 8 } : false}
                  animate={motionEnabled ? { opacity: 1, y: 0 } : { opacity: 1 }}
                  exit={motionEnabled ? { opacity: 0, y: -6 } : { opacity: 0 }}
                  transition={motionEnabled ? { duration: 0.14 } : { duration: 0 }}
                >
                  拖到发光英雄直接结算；多效果目标会保留为中央选择。
                </motion.div>
              ) : null}
            </AnimatePresence>

            <motion.div className="selection-summary action-summary" layout={motionEnabled}>
              <div>
                <span className="selection-label">操作者</span>
                <strong>{selectedHero?.name ?? "未选择"}</strong>
              </div>
              <div>
                <span className="selection-label">手牌</span>
                <strong>{selectedCard?.name ?? "未选择"}</strong>
              </div>
              <div>
                <span className="selection-label">目标 / 效果</span>
                <strong>{playTargetOptions.find((option) => option.signature === selectedTargetSignature)?.label ?? "未选择"}</strong>
              </div>
            </motion.div>

            <motion.div className="choice-strip" layout={motionEnabled}>
              {playTargetOptions.map((option) => (
                <motion.button
                  key={option.signature}
                  type="button"
                  layout={motionEnabled}
                  initial={motionEnabled ? { opacity: 0, y: 8 } : false}
                  animate={motionEnabled ? { opacity: 1, y: 0 } : { opacity: 1 }}
                  whileTap={motionEnabled ? { scale: 0.98 } : undefined}
                  className={["effect-chip", selectedTargetSignature === option.signature ? "selected" : ""].filter(Boolean).join(" ")}
                  onClick={() => setSelectedTargetSignature(option.signature)}
                >
                  {option.label}
                </motion.button>
              ))}
              {playTargetOptions.length === 0 ? <div className="hint">选择己方英雄和手牌后，目标、站位、揭示和防御选项会在这里出现。</div> : null}
            </motion.div>

            <div className="turn-action-bar" aria-label="可用战斗动作">
              {playerCommands.map((command, index) => (
                <motion.button
                  key={`${command.type}-${index}-${commandLabel(command)}`}
                  type="button"
                  layout={motionEnabled}
                  className="action-token"
                  whileTap={motionEnabled ? { scale: 0.97 } : undefined}
                  onClick={() => void commitCommand(command)}
                >
                  {commandLabel(command)}
                </motion.button>
              ))}
              {reactionCommands.map((command, index) => (
                <motion.button
                  key={`reaction-${command.type}-${index}`}
                  type="button"
                  layout={motionEnabled}
                  className="action-token reaction"
                  whileTap={motionEnabled ? { scale: 0.97 } : undefined}
                  onClick={() => void commitCommand(command)}
                >
                  {commandLabel(command)}
                </motion.button>
              ))}
              {playerCommands.length === 0 && reactionCommands.length === 0 ? <span className="hint">{mode === "online" && !canUseRoom ? "连接在线房间后开始操作。" : "等待下一次可执行动作。"}</span> : null}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {selectedPlayCommand ? (
                <motion.div
                  key={playTargetSignature(selectedPlayCommand)}
                  className="reaction-prompt"
                  initial={motionEnabled ? { opacity: 0, y: 10, scale: 0.985 } : false}
                  animate={motionEnabled ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1 }}
                  exit={motionEnabled ? { opacity: 0, y: -8, scale: 0.985 } : { opacity: 0 }}
                  transition={motionEnabled ? { duration: 0.18, ease: "easeOut" } : { duration: 0 }}
                >
                  <div><span>将提交</span><strong>{commandLabel(selectedPlayCommand)}</strong></div>
                  {selectedPlayCommand.toZone ? <div><span>站位效果</span><strong>{zoneLabel(selectedPlayCommand.toZone)}</strong></div> : null}
                  {selectedPlayCommand.revealedCardId ? <div><span>假读条揭示</span><strong>{CARD_BY_ID[selectedPlayCommand.revealedCardId]?.name ?? selectedPlayCommand.revealedCardId}</strong></div> : null}
                  {selectedPlayCommand.defenseCardId ? (
                    <div><span>内联防御</span><strong>{HERO_BY_ID[selectedPlayCommand.defenseSourceHeroId ?? ""]?.name ?? selectedPlayCommand.defenseSourceHeroId} 使用 {CARD_BY_ID[selectedPlayCommand.defenseCardId]?.name ?? selectedPlayCommand.defenseCardId}</strong></div>
                  ) : null}
                </motion.div>
              ) : activeState.pendingReaction ? (
                <motion.div
                  key={`${activeState.pendingReaction.sourceCardId}-${activeState.pendingReaction.stage}`}
                  className="reaction-prompt live"
                  initial={motionEnabled ? { opacity: 0, y: 10, scale: 0.985 } : false}
                  animate={motionEnabled ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1 }}
                  exit={motionEnabled ? { opacity: 0, y: -8, scale: 0.985 } : { opacity: 0 }}
                  transition={motionEnabled ? { duration: 0.18, ease: "easeOut" } : { duration: 0 }}
                >
                  <div><span>反应来源</span><strong>{CARD_BY_ID[activeState.pendingReaction.sourceCardId]?.name ?? activeState.pendingReaction.sourceCardId}</strong></div>
                  <div><span>目标</span><strong>{listNames(activeState.pendingReaction.targetIds)}</strong></div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <button type="button" className="commit-rune" onClick={handlePlayCard} disabled={!selectedPlayCommand || (mode === "online" && !canUseRoom)}>
              打出
            </button>
          </section>

          <section className="team-band player-band">
            <div className="hero-slot-row arena-heroes player-heroes">
              {playerHeroes.map((hero) => renderHeroSlot(hero, "player"))}
            </div>
            <div className="team-crest player">
              <span>{sideLabel(playerSide)} 玩家</span>
              <strong>{playerHp}/{playerMaxHp}</strong>
              <small>专注 {activeState.players[playerSide].focusAvailable} · 集火 {activeState.players[playerSide].focusTargetId ? HERO_BY_ID[activeState.players[playerSide].focusTargetId]?.name ?? activeState.players[playerSide].focusTargetId : "未定"}</small>
            </div>
          </section>

          <section className="hand-dock">
            <div className="hand-header">
              <div>
                <h2>{mode === "local" ? `${sideLabel(activeState.currentPlayer)} 手牌` : `${sideLabel(controlSide)} 手牌`}</h2>
              </div>
              <span className="mini-tag">{currentHand.length} 张</span>
            </div>
            <div className="hand-list card-hand">
              <AnimatePresence initial={false}>
                {currentHand.map(renderHandCard)}
              </AnimatePresence>
              {currentHand.length === 0 ? <div className="hint">{mode === "online" && !canUseRoom ? "连接后将显示你的手牌。" : "当前没有手牌。"}</div> : null}
            </div>
          </section>
        </main>
        <DragOverlay dropAnimation={motionEnabled ? undefined : null}>
          {activeDragCardId ? (
            <div className="hand-card drag-overlay-card">
              <CardFace
                cardId={activeDragCardId}
                availability={cardAvailabilityLabel(activeState, activeCommands, controlSide, selectedHeroId, activeDragCardId)}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            className="game-menu-backdrop"
            initial={motionEnabled ? { opacity: 0 } : false}
            animate={motionEnabled ? { opacity: 1 } : { opacity: 1 }}
            exit={motionEnabled ? { opacity: 0 } : { opacity: 0 }}
            onMouseDown={() => setMenuOpen(false)}
          >
            <motion.aside
              className="game-drawer"
              initial={motionEnabled ? { opacity: 0, x: 36 } : false}
              animate={motionEnabled ? { opacity: 1, x: 0 } : { opacity: 1 }}
              exit={motionEnabled ? { opacity: 0, x: 28 } : { opacity: 0 }}
              transition={motionEnabled ? { type: "spring", stiffness: 360, damping: 34 } : { duration: 0 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="drawer-header">
                <div>
                  <span className="mini-tag">Game Menu</span>
                  <h2>战局控制</h2>
                </div>
                <button type="button" className="menu-rune" onClick={() => setMenuOpen(false)}>
                  关闭
                </button>
              </div>

              <section className="drawer-section">
                <div className="panel-header">
                  <h2>模式</h2>
                  <p>{currentStatusLabel}</p>
                </div>
                <div className="button-row">
                  <button type="button" className={["ghost-button", mode === "local" ? "selected" : ""].filter(Boolean).join(" ")} onClick={() => setMode("local")}>
                    本地热座
                  </button>
                  <button type="button" className={["ghost-button", mode === "online" ? "selected" : ""].filter(Boolean).join(" ")} onClick={() => setMode("online")}>
                    在线房间
                  </button>
                  <button type="button" className="ghost-button" onClick={resetLocalGame}>
                    重开本地局
                  </button>
                </div>
              </section>

              {mode === "online" ? summaryPanel : null}
              {mode === "online" ? aiEncounterPanel : null}

              <section className="drawer-section">
                <div className="panel-header">
                  <h2>回合操作</h2>
                  <p>同一批 legal commands，收在菜单里作为完整备用入口。</p>
                </div>
                <div className="command-groups">
                  {Object.entries(groupedCommands).map(([group, commands]) => (
                    <div key={group} className="command-group">
                      <div className="command-group-title">{group}</div>
                      <div className="button-grid">
                        {commands.map((command, index) => (
                          <button key={`${command.type}-${index}-${commandLabel(command)}`} type="button" className="command-button" onClick={() => void commitCommand(command)}>
                            {commandLabel(command)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {playerCommands.length === 0 ? <div className="hint">{mode === "online" && !canUseRoom ? "请先连接在线房间。" : "当前没有可用的普通回合命令。"}</div> : null}
                </div>
              </section>

              <section className="drawer-section">
                <div className="panel-header">
                  <h2>资源 / 冷却</h2>
                  <p>公开打断冷却；饰品状态在英雄头像上。</p>
                </div>
                <div className="resource-grid">
                  <div>
                    <span>{sideLabel(playerSide)}专注</span>
                    <strong>{activeState.players[playerSide].focusAvailable}</strong>
                  </div>
                  <div>
                    <span>{sideLabel(opponentSide)}专注</span>
                    <strong>{activeState.players[opponentSide].focusAvailable}</strong>
                  </div>
                  <div>
                    <span>抑制</span>
                    <strong>{activeState.suppression}</strong>
                  </div>
                </div>
                <div className="cooldown-list">
                  {allCooldowns.map((cooldown) => (
                    <div key={`${cooldown.side}-${cooldown.cardId}-${cooldown.sourceHeroId}-${cooldown.usedRound}`} className="cooldown-item">
                      <strong>{sideLabel(cooldown.side)} {CARD_BY_ID[cooldown.cardId]?.name ?? cooldown.cardId}</strong>
                      <span>{HERO_BY_ID[cooldown.sourceHeroId]?.name ?? cooldown.sourceHeroId} 使用，持续到第 {cooldown.usedUntilRound} 回合</span>
                    </div>
                  ))}
                  {allCooldowns.length === 0 ? <div className="hint">当前没有公开冷却。</div> : null}
                </div>
              </section>

              <section className="drawer-section">
                <div className="panel-header">
                  <h2>反应窗</h2>
                  <p>{activeState.pendingReaction ? `${reactionKindLabel(activeState.pendingReaction.kind)}：${CARD_BY_ID[activeState.pendingReaction.sourceCardId]?.name ?? activeState.pendingReaction.sourceCardId} 指向 ${listNames(activeState.pendingReaction.targetIds)}` : "没有待处理反应。"}</p>
                </div>
                <div className="button-grid">
                  {reactionCommands.map((command, index) => (
                    <button key={`${command.type}-${index}`} type="button" className="command-button" onClick={() => void commitCommand(command)}>
                      {commandLabel(command)}
                    </button>
                  ))}
                  {reactionCommands.length === 0 ? <div className="hint">当前没有反应窗动作。</div> : null}
                </div>
              </section>

              <section className="drawer-section">
                <div className="panel-header">
                  <h2>英雄状态</h2>
                  <p>详细状态摘要；主要选择在牌桌头像完成。</p>
                </div>
                <div className="hero-list">
                  {controlledHeroes.map((hero) => (
                    <button
                      key={hero.id}
                      type="button"
                      className={["hero-list-item", selectedHeroId === hero.id ? "selected" : ""].filter(Boolean).join(" ")}
                      onClick={() => setSelectedHeroId(hero.id)}
                    >
                      <img src={heroPortraitSrc(hero.role)} alt="" loading="lazy" />
                      <div>
                        <strong>{hero.name}</strong>
                        <span>{roleLabel(hero.role)}</span>
                      </div>
                      <span>{hero.hp}/{hero.maxHp} HP</span>
                      <span>{zoneLabel(hero.zone)}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="drawer-section">
                <div className="panel-header">
                  <h2>事件流</h2>
                  <p>默认折叠 JSON；需要复盘时展开。</p>
                </div>
                <div className="log-list">
                  {activeState.log.length === 0 ? <div className="hint">还没有事件。</div> : null}
                  {[...activeState.log].reverse().slice(0, 12).map((entry, index) => (
                    <details key={`${entry.type}-${activeState.log.length - index}`} className="log-item">
                      <summary>
                        <span className="log-type">{entry.type}</span>
                        <span>{Object.values(entry.payload).slice(0, 3).map(String).join(" / ")}</span>
                      </summary>
                      <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
                    </details>
                  ))}
                </div>
              </section>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
