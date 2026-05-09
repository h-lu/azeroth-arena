using System.Collections;
using System.Collections.Generic;
using AzerothArena.Protocol;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace AzerothArena.Commands
{
    public sealed class VisualCommandFactory : MonoBehaviour
    {
        [SerializeField] private float drawSeconds = 0.18f;
        [SerializeField] private float playCardSeconds = 0.26f;
        [SerializeField] private float damageSeconds = 0.20f;
        [SerializeField] private float defeatedSeconds = 0.34f;
        [SerializeField] private float roundStartSeconds = 0.28f;
        [SerializeField] private float genericEventSeconds = 0.10f;
        [SerializeField] private float snapshotReconcileSeconds = 0.04f;

        public void EnqueuePlayerViewDelta(VisualCommandQueue queue, PlayerViewDto previous, PlayerViewDto next)
        {
            if (queue == null || next == null)
            {
                return;
            }

            queue.EnqueueRange(BuildPlayerViewDelta(previous, next));
        }

        public IEnumerable<IVisualCommand> BuildPlayerViewDelta(PlayerViewDto previous, PlayerViewDto next)
        {
            if (next == null)
            {
                yield break;
            }

            var previousLogCount = CountLogEntries(previous);
            var nextLog = ReadLog(next);

            if (nextLog != null)
            {
                for (var index = previousLogCount; index < nextLog.Count; index++)
                {
                    if (nextLog[index] is JObject gameEvent)
                    {
                        yield return BuildGameEventCommand(gameEvent);
                    }
                }
            }

            yield return new SnapshotReconcileVisualCommand(next.Version, snapshotReconcileSeconds);
        }

        public IEnumerable<IVisualCommand> BuildReplayVisualCommands(JArray replayEvents, int finalVersion)
        {
            if (replayEvents != null)
            {
                foreach (var replayEntry in replayEvents)
                {
                    var events = replayEntry?["events"] as JArray;
                    if (events == null)
                    {
                        continue;
                    }

                    foreach (var item in events)
                    {
                        if (item is JObject gameEvent)
                        {
                            yield return BuildGameEventCommand(gameEvent);
                        }
                    }
                }
            }

            yield return new SnapshotReconcileVisualCommand(finalVersion, snapshotReconcileSeconds);
        }

        private IVisualCommand BuildGameEventCommand(JObject gameEvent)
        {
            var eventType = gameEvent.Value<string>("type") ?? "unknown";
            var payload = gameEvent["payload"] as JObject;
            switch (eventType)
            {
                case "card-drawn":
                    return new DrawCardsVisualCommand(
                        ReadString(payload, "playerId", "unknown"),
                        ReadInt(payload, "amount", 1),
                        ReadInt(payload, "handCount", 0),
                        ReadInt(payload, "deckCount", 0),
                        drawSeconds);
                case "card-played":
                    return new PlayCardVisualCommand(
                        ReadString(payload, "heroId", "unknown"),
                        ReadString(payload, "cardId", "unknown"),
                        ReadStringArray(payload, "targets"),
                        playCardSeconds);
                case "damage":
                case "end-round-damage":
                    return new DamageVisualCommand(
                        ReadString(payload, "targetId", "unknown"),
                        ReadString(payload, "cardId", "unknown"),
                        ReadInt(payload, "amount", 0),
                        damageSeconds);
                case "knockout":
                    return new EntityDefeatedVisualCommand(
                        ReadString(payload, "targetId", "unknown"),
                        ReadString(payload, "winner", "unknown"),
                        defeatedSeconds);
                case "round-start":
                    return new RoundStartVisualCommand(ReadInt(payload, "round", 0), roundStartSeconds);
                default:
                    return new GenericGameEventVisualCommand(gameEvent, genericEventSeconds);
            }
        }

        private static JArray ReadLog(PlayerViewDto view)
        {
            return view?.State?["log"] as JArray;
        }

        private static int CountLogEntries(PlayerViewDto view)
        {
            return ReadLog(view)?.Count ?? 0;
        }

        private static int ReadInt(JObject payload, string field, int fallback)
        {
            return payload?.Value<int?>(field) ?? fallback;
        }

        private static string ReadString(JObject payload, string field, string fallback)
        {
            return payload?.Value<string>(field) ?? fallback;
        }

        private static IReadOnlyList<string> ReadStringArray(JObject payload, string field)
        {
            var array = payload?[field] as JArray;
            if (array == null)
            {
                return new List<string>();
            }

            var result = new List<string>();
            foreach (var item in array)
            {
                if (item.Type == JTokenType.String)
                {
                    result.Add(item.Value<string>());
                }
            }

            return result;
        }

        private sealed class DrawCardsVisualCommand : IVisualCommand
        {
            private readonly string playerId;
            private readonly int amount;
            private readonly int handCount;
            private readonly int deckCount;
            private readonly float seconds;

            public DrawCardsVisualCommand(string playerId, int amount, int handCount, int deckCount, float seconds)
            {
                this.playerId = playerId;
                this.amount = amount;
                this.handCount = handCount;
                this.deckCount = deckCount;
                this.seconds = seconds;
            }

            public string DebugName => "Draw " + amount + " card(s) for " + playerId + " hand=" + handCount + " deck=" + deckCount;
            public VisualCommandBlockingMode BlockingMode => VisualCommandBlockingMode.BlocksQueue;

            public IEnumerator Execute(VisualCommandContext context)
            {
                yield return new WaitForSeconds(seconds);
            }
        }

        private sealed class PlayCardVisualCommand : IVisualCommand
        {
            private readonly string heroId;
            private readonly string cardId;
            private readonly IReadOnlyList<string> targets;
            private readonly float seconds;

            public PlayCardVisualCommand(string heroId, string cardId, IReadOnlyList<string> targets, float seconds)
            {
                this.heroId = heroId;
                this.cardId = cardId;
                this.targets = targets;
                this.seconds = seconds;
            }

            public string DebugName => "Play card " + cardId + " from " + heroId + " -> " + string.Join(",", targets);
            public VisualCommandBlockingMode BlockingMode => VisualCommandBlockingMode.BlocksQueue;

            public IEnumerator Execute(VisualCommandContext context)
            {
                yield return new WaitForSeconds(seconds);
            }
        }

        private sealed class DamageVisualCommand : IVisualCommand
        {
            private readonly string targetId;
            private readonly string cardId;
            private readonly int amount;
            private readonly float seconds;

            public DamageVisualCommand(string targetId, string cardId, int amount, float seconds)
            {
                this.targetId = targetId;
                this.cardId = cardId;
                this.amount = amount;
                this.seconds = seconds;
            }

            public string DebugName => "Damage " + targetId + " for " + amount + " via " + cardId;
            public VisualCommandBlockingMode BlockingMode => VisualCommandBlockingMode.BlocksQueue;

            public IEnumerator Execute(VisualCommandContext context)
            {
                yield return new WaitForSeconds(seconds);
            }
        }

        private sealed class EntityDefeatedVisualCommand : IVisualCommand
        {
            private readonly string targetId;
            private readonly string winner;
            private readonly float seconds;

            public EntityDefeatedVisualCommand(string targetId, string winner, float seconds)
            {
                this.targetId = targetId;
                this.winner = winner;
                this.seconds = seconds;
            }

            public string DebugName => "Defeat " + targetId + " winner=" + winner;
            public VisualCommandBlockingMode BlockingMode => VisualCommandBlockingMode.BlocksQueue;

            public IEnumerator Execute(VisualCommandContext context)
            {
                yield return new WaitForSeconds(seconds);
            }
        }

        private sealed class RoundStartVisualCommand : IVisualCommand
        {
            private readonly int round;
            private readonly float seconds;

            public RoundStartVisualCommand(int round, float seconds)
            {
                this.round = round;
                this.seconds = seconds;
            }

            public string DebugName => "Round start " + round;
            public VisualCommandBlockingMode BlockingMode => VisualCommandBlockingMode.BlocksQueue;

            public IEnumerator Execute(VisualCommandContext context)
            {
                yield return new WaitForSeconds(seconds);
            }
        }

        private sealed class GenericGameEventVisualCommand : IVisualCommand
        {
            private readonly string eventType;
            private readonly float seconds;

            public GenericGameEventVisualCommand(JObject gameEvent, float seconds)
            {
                Event = (JObject)gameEvent.DeepClone();
                eventType = Event.Value<string>("type") ?? "unknown";
                this.seconds = seconds;
            }

            public JObject Event { get; }
            public string DebugName => "Server event: " + eventType;
            public VisualCommandBlockingMode BlockingMode => BlockingModeFor(eventType);

            public IEnumerator Execute(VisualCommandContext context)
            {
                yield return new WaitForSeconds(seconds);
            }

            private static VisualCommandBlockingMode BlockingModeFor(string type)
            {
                switch (type)
                {
                    case "reaction-opened":
                    case "reaction-resolved":
                    case "card-played":
                    case "card-drawn":
                    case "damage":
                    case "end-round-damage":
                    case "knockout":
                    case "heal":
                    case "shield":
                    case "move":
                    case "control":
                    case "round-start":
                    case "round-end":
                        return VisualCommandBlockingMode.BlocksQueue;
                    case "focus":
                    case "focus-selected":
                    case "turn-pass":
                    case "activation-end":
                    case "activate":
                        return VisualCommandBlockingMode.BlocksInput;
                    default:
                        return VisualCommandBlockingMode.NonBlocking;
                }
            }
        }

        private sealed class SnapshotReconcileVisualCommand : IVisualCommand
        {
            private readonly int version;
            private readonly float seconds;

            public SnapshotReconcileVisualCommand(int version, float seconds)
            {
                this.version = version;
                this.seconds = seconds;
            }

            public string DebugName => "Snapshot reconcile v" + version;
            public VisualCommandBlockingMode BlockingMode => VisualCommandBlockingMode.BlocksInput;

            public IEnumerator Execute(VisualCommandContext context)
            {
                yield return new WaitForSeconds(seconds);
            }
        }
    }
}
