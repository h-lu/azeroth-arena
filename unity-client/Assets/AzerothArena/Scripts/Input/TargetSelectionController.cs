using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AzerothArena.Protocol;
using AzerothArena.State;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace AzerothArena.Input
{
    public sealed class TargetSelectionController : MonoBehaviour
    {
        [SerializeField] private UnityRoomClient roomClient;
        [SerializeField] private ClientSnapshotStore snapshotStore;
        [SerializeField] private InputPermissionGuard inputGuard;

        private readonly List<JObject> candidateCommands = new();
        private readonly List<string> selectedTargetIds = new();
        private string selectedZoneId = string.Empty;

        public event Action<TargetSelectionState> TargetingChanged;
        public event Action<string> PromptChanged;
        public event Action<string> ReboundRequested;
        public event Action<JObject> CommandSubmitted;

        public bool IsTargeting => candidateCommands.Count > 0;
        public TargetSelectionState CurrentState => BuildState();

        private void Awake()
        {
            if (roomClient == null)
            {
                roomClient = GetComponent<UnityRoomClient>();
            }

            if (snapshotStore == null)
            {
                snapshotStore = GetComponent<ClientSnapshotStore>();
            }

            if (inputGuard == null)
            {
                inputGuard = GetComponent<InputPermissionGuard>();
            }
        }

        private void OnEnable()
        {
            if (roomClient != null)
            {
                roomClient.RoomError += HandleRoomError;
            }
        }

        private void OnDisable()
        {
            if (roomClient != null)
            {
                roomClient.RoomError -= HandleRoomError;
            }
        }

        public bool BeginCardTargeting(string cardId, string sourceHeroId = null)
        {
            var matches = FindLegalCommands(command =>
                StringEquals(command.Value<string>("type"), "playCard") &&
                StringEquals(command.Value<string>("cardId"), cardId) &&
                (string.IsNullOrEmpty(sourceHeroId) || StringEquals(command.Value<string>("sourceHeroId"), sourceHeroId)));

            if (matches.Count == 0)
            {
                RejectLocally("No legal playCard command is available for " + cardId + ".");
                return false;
            }

            return BeginTargeting(matches, "Choose a target for " + cardId + ".");
        }

        public bool BeginCommandTargeting(int legalCommandIndex)
        {
            if (snapshotStore == null || legalCommandIndex < 0 || legalCommandIndex >= snapshotStore.LegalCommands.Count)
            {
                RejectLocally("Selected command is out of range.");
                return false;
            }

            var command = GameProtocol.CloneCommand(snapshotStore.LegalCommands[legalCommandIndex]);
            return BeginTargeting(new List<JObject> { command }, DescribeCommand(command));
        }

        public bool BeginCommandTypeTargeting(string commandType)
        {
            var matches = FindLegalCommands(command => StringEquals(command.Value<string>("type"), commandType));
            if (matches.Count == 0)
            {
                RejectLocally("No legal " + commandType + " command is available.");
                return false;
            }

            return BeginTargeting(matches, "Choose " + commandType + ".");
        }

        public bool BeginReactionPass()
        {
            var matches = FindLegalCommands(command => StringEquals(command.Value<string>("type"), "resolveReaction") && command.Value<bool?>("pass") == true);
            if (matches.Count == 0)
            {
                RejectLocally("No reaction pass command is available.");
                return false;
            }

            return BeginTargeting(new List<JObject> { matches[0] }, "Pass the reaction window.");
        }

        public bool BeginReactionTrinket()
        {
            var matches = FindLegalCommands(command => StringEquals(command.Value<string>("type"), "resolveReaction") && command.Value<bool?>("useTrinket") == true);
            if (matches.Count == 0)
            {
                RejectLocally("No reaction trinket command is available.");
                return false;
            }

            return BeginTargeting(new List<JObject> { matches[0] }, "Use trinket for this reaction.");
        }

        public void SelectTarget(string targetId)
        {
            if (!IsTargeting || string.IsNullOrEmpty(targetId))
            {
                return;
            }

            var selectable = BuildSelectableTargetIds();
            if (!selectable.Contains(targetId))
            {
                RejectLocally("Target " + targetId + " is not valid for this action.");
                return;
            }

            selectedTargetIds.Add(targetId);
            FilterCandidates();
            NotifyStateChanged();

            var command = TryGetResolvedCommand();
            if (command != null)
            {
                _ = SubmitResolvedCommandAsync(command);
            }
        }

        public void SelectZone(string zoneId)
        {
            if (!IsTargeting || string.IsNullOrEmpty(zoneId))
            {
                return;
            }

            var selectable = BuildSelectableZoneIds();
            if (!selectable.Contains(zoneId))
            {
                RejectLocally("Zone " + zoneId + " is not valid for this action.");
                return;
            }

            selectedZoneId = zoneId;
            FilterCandidates();
            NotifyStateChanged();

            var command = TryGetResolvedCommand();
            if (command != null)
            {
                _ = SubmitResolvedCommandAsync(command);
            }
        }

        public void CancelTargeting()
        {
            candidateCommands.Clear();
            selectedTargetIds.Clear();
            selectedZoneId = string.Empty;
            PromptChanged?.Invoke(string.Empty);
            NotifyStateChanged();
        }

        public Task ConfirmSelectedCommandAsync()
        {
            var command = TryGetResolvedCommand();
            if (command == null)
            {
                RejectLocally("Choose a valid target before submitting.");
                return Task.CompletedTask;
            }

            return SubmitResolvedCommandAsync(command);
        }

        private bool BeginTargeting(List<JObject> commands, string prompt)
        {
            candidateCommands.Clear();
            selectedTargetIds.Clear();
            selectedZoneId = string.Empty;
            candidateCommands.AddRange(commands);

            var command = TryGetResolvedCommand();
            if (command != null && GetRequiredSelectionIds(command).Count == 0 && !RequiresZoneSelection(command))
            {
                _ = SubmitResolvedCommandAsync(command);
                return true;
            }

            PromptChanged?.Invoke(prompt);
            NotifyStateChanged();
            return true;
        }

        private async Task SubmitResolvedCommandAsync(JObject command)
        {
            if (inputGuard != null && !inputGuard.CanSubmit(command))
            {
                RejectLocally(inputGuard.LastBlockReason);
                return;
            }

            try
            {
                await roomClient.SubmitCommandAsync(command, snapshotStore.Version);
                CommandSubmitted?.Invoke(command);
                CancelTargeting();
            }
            catch (Exception error)
            {
                RejectLocally(error.Message);
            }
        }

        private JObject TryGetResolvedCommand()
        {
            if (candidateCommands.Count == 1)
            {
                var command = candidateCommands[0];
                var targets = GetRequiredSelectionIds(command);
                var zoneSelected = !RequiresZoneSelection(command) || !string.IsNullOrEmpty(selectedZoneId);
                if (selectedTargetIds.Count >= targets.Count && zoneSelected)
                {
                    return command;
                }
            }

            return null;
        }

        private List<JObject> FindLegalCommands(Func<JObject, bool> predicate)
        {
            var matches = new List<JObject>();
            if (snapshotStore == null)
            {
                return matches;
            }

            foreach (var legalCommand in snapshotStore.LegalCommands)
            {
                if (legalCommand is not JObject command)
                {
                    continue;
                }

                if (predicate(command))
                {
                    matches.Add((JObject)command.DeepClone());
                }
            }

            return matches;
        }

        private void FilterCandidates()
        {
            candidateCommands.RemoveAll(command =>
            {
                var targets = GetTargetIds(command);
                var missingSelectedTarget = selectedTargetIds.Any(targetId => !targets.Contains(targetId) && !CommandEntityIds(command).Contains(targetId));
                var zoneMismatch = !string.IsNullOrEmpty(selectedZoneId) && !StringEquals(command.Value<string>("toZone"), selectedZoneId);
                return missingSelectedTarget || zoneMismatch;
            });
        }

        private List<string> BuildSelectableTargetIds()
        {
            return candidateCommands
                .SelectMany(GetRequiredSelectionIds)
                .Where(targetId => !selectedTargetIds.Contains(targetId))
                .Distinct()
                .OrderBy(targetId => targetId)
                .ToList();
        }

        private List<string> BuildSelectableZoneIds()
        {
            return candidateCommands
                .Select(command => command.Value<string>("toZone"))
                .Where(zoneId => !string.IsNullOrEmpty(zoneId) && !StringEquals(zoneId, selectedZoneId))
                .Distinct()
                .OrderBy(zoneId => zoneId)
                .ToList();
        }

        private TargetSelectionState BuildState()
        {
            return new TargetSelectionState
            {
                IsTargeting = IsTargeting,
                CandidateCount = candidateCommands.Count,
                SelectedTargetIds = selectedTargetIds.ToArray(),
                SelectableTargetIds = BuildSelectableTargetIds().ToArray(),
                SelectedZoneId = selectedZoneId,
                SelectableZoneIds = BuildSelectableZoneIds().ToArray(),
                CommandType = candidateCommands.FirstOrDefault()?.Value<string>("type") ?? string.Empty,
                CardId = candidateCommands.FirstOrDefault()?.Value<string>("cardId") ?? string.Empty
            };
        }

        private void NotifyStateChanged()
        {
            TargetingChanged?.Invoke(BuildState());
        }

        private void RejectLocally(string reason)
        {
            PromptChanged?.Invoke(reason);
            ReboundRequested?.Invoke(reason);
            CancelTargeting();
        }

        private void HandleRoomError(RoomErrorPayloadDto error)
        {
            var reason = string.IsNullOrEmpty(error?.Message) ? "Server rejected the action." : error.Message;
            ReboundRequested?.Invoke(reason);
            PromptChanged?.Invoke(reason);
            CancelTargeting();
        }

        private static IReadOnlyList<string> GetTargetIds(JObject command)
        {
            return command["targetIds"] is JArray targetIds ? targetIds.Values<string>().Where(id => !string.IsNullOrEmpty(id)).ToArray() : Array.Empty<string>();
        }

        private static IReadOnlyList<string> GetRequiredSelectionIds(JObject command)
        {
            var targetIds = GetTargetIds(command);
            if (targetIds.Count > 0)
            {
                return targetIds;
            }

            if (StringEquals(command.Value<string>("type"), "playCard") || StringEquals(command.Value<string>("type"), "resolveReaction"))
            {
                return Array.Empty<string>();
            }

            return CommandEntityIds(command);
        }

        private static IReadOnlyList<string> CommandEntityIds(JObject command)
        {
            var ids = new[]
            {
                command.Value<string>("heroId"),
                command.Value<string>("sourceHeroId"),
                command.Value<string>("defenseTargetId")
            };
            return ids.Where(id => !string.IsNullOrEmpty(id)).Distinct().ToArray();
        }

        private static bool RequiresZoneSelection(JObject command)
        {
            return !string.IsNullOrEmpty(command.Value<string>("toZone"));
        }

        private static string DescribeCommand(JObject command)
        {
            var type = command.Value<string>("type") ?? "command";
            var cardId = command.Value<string>("cardId");
            return string.IsNullOrEmpty(cardId) ? "Choose " + type + "." : "Choose targets for " + cardId + ".";
        }

        private static bool StringEquals(string left, string right)
        {
            return string.Equals(left, right, StringComparison.Ordinal);
        }
    }

    public sealed class TargetSelectionState
    {
        public bool IsTargeting { get; set; }
        public int CandidateCount { get; set; }
        public string[] SelectedTargetIds { get; set; } = Array.Empty<string>();
        public string[] SelectableTargetIds { get; set; } = Array.Empty<string>();
        public string SelectedZoneId { get; set; } = string.Empty;
        public string[] SelectableZoneIds { get; set; } = Array.Empty<string>();
        public string CommandType { get; set; } = string.Empty;
        public string CardId { get; set; } = string.Empty;
    }
}
