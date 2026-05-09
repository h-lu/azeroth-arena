using System.Linq;
using AzerothArena.Commands;
using AzerothArena.Input;
using AzerothArena.Protocol;
using AzerothArena.State;
using AzerothArena.Visual;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace AzerothArena.UI
{
    public sealed class MatchHud : MonoBehaviour
    {
        [SerializeField] private UnityRoomClient roomClient;
        [SerializeField] private ClientSnapshotStore snapshotStore;
        [SerializeField] private TargetSelectionController targetSelection;
        [SerializeField] private VisualCommandQueue visualCommandQueue;
        [SerializeField] private VisualCommandFactory visualCommandFactory;
        [SerializeField] private ToastPromptView toastPrompt;
        [SerializeField] private ReactionWindowMobilePrompt reactionWindowPrompt;
        [SerializeField] private MobileFeedbackController feedbackController;
        [SerializeField] private Text statusText;
        [SerializeField] private Text roomText;
        [SerializeField] private Text turnText;
        [SerializeField] private Text legalCommandText;
        [SerializeField] private Text targetingText;

        private PlayerViewDto lastAnimatedPlayerView;

        private void Awake()
        {
            roomClient ??= GetComponent<UnityRoomClient>();
            snapshotStore ??= GetComponent<ClientSnapshotStore>();
            targetSelection ??= GetComponent<TargetSelectionController>();
            visualCommandQueue ??= GetComponent<VisualCommandQueue>();
            visualCommandFactory ??= GetComponent<VisualCommandFactory>();
            reactionWindowPrompt ??= GetComponent<ReactionWindowMobilePrompt>();
            feedbackController ??= GetComponent<MobileFeedbackController>();
        }

        private void OnEnable()
        {
            if (roomClient != null)
            {
                roomClient.PlayerViewUpdated += HandlePlayerViewUpdated;
                roomClient.RoomError += HandleRoomError;
                roomClient.StatusChanged += HandleStatusChanged;
            }

            if (targetSelection != null)
            {
                targetSelection.TargetingChanged += HandleTargetingChanged;
                targetSelection.PromptChanged += ShowToast;
                targetSelection.ReboundRequested += HandleReboundRequested;
                targetSelection.CommandSubmitted += HandleCommandSubmitted;
            }
        }

        private void OnDisable()
        {
            if (roomClient != null)
            {
                roomClient.PlayerViewUpdated -= HandlePlayerViewUpdated;
                roomClient.RoomError -= HandleRoomError;
                roomClient.StatusChanged -= HandleStatusChanged;
            }

            if (targetSelection != null)
            {
                targetSelection.TargetingChanged -= HandleTargetingChanged;
                targetSelection.PromptChanged -= ShowToast;
                targetSelection.ReboundRequested -= HandleReboundRequested;
                targetSelection.CommandSubmitted -= HandleCommandSubmitted;
            }
        }

        public void CreateAIEncounter()
        {
            if (roomClient != null)
            {
                _ = roomClient.CreateAIEncounterAsync();
            }
        }

        public void SubmitEndTurn()
        {
            targetSelection?.BeginCommandTypeTargeting("endTurn");
        }

        public void SubmitPass()
        {
            targetSelection?.BeginCommandTypeTargeting("pass");
        }

        public void BeginFirstPlayableCard()
        {
            var firstPlayableCard = snapshotStore?.LegalCommands
                .OfType<JObject>()
                .FirstOrDefault(command => command.Value<string>("type") == "playCard");

            var cardId = firstPlayableCard?.Value<string>("cardId");
            if (string.IsNullOrEmpty(cardId))
            {
                ShowToast("No playable card is available.");
                return;
            }

            targetSelection?.BeginCardTargeting(cardId, firstPlayableCard.Value<string>("sourceHeroId"));
        }

        public void SelectTarget(string targetId)
        {
            targetSelection?.SelectTarget(targetId);
        }

        public void SelectZone(string zoneId)
        {
            targetSelection?.SelectZone(zoneId);
        }

        private void HandlePlayerViewUpdated(PlayerViewDto view)
        {
            visualCommandFactory?.EnqueuePlayerViewDelta(visualCommandQueue, lastAnimatedPlayerView, view);
            lastAnimatedPlayerView = view;
            UpdateSnapshotText(view);
            reactionWindowPrompt?.Refresh();
        }

        private void HandleRoomError(RoomErrorPayloadDto error)
        {
            var code = string.IsNullOrEmpty(error?.Code) ? "REJECTED" : error.Code;
            var message = string.IsNullOrEmpty(error?.Message) ? "Server rejected the action." : error.Message;
            ShowToast(code + ": " + message);
        }

        private void HandleStatusChanged(string status)
        {
            if (statusText != null)
            {
                statusText.text = status;
            }
        }

        private void HandleTargetingChanged(TargetSelectionState state)
        {
            if (targetingText == null)
            {
                return;
            }

            if (!state.IsTargeting)
            {
                targetingText.text = string.Empty;
                return;
            }

            var targets = state.SelectableTargetIds.Length > 0 ? string.Join(", ", state.SelectableTargetIds) : "target locked";
            var zones = state.SelectableZoneIds.Length > 0 ? " | zones: " + string.Join(", ", state.SelectableZoneIds) : string.Empty;
            targetingText.text = "Targeting " + state.CommandType + " | " + targets + zones;
        }

        private void HandleReboundRequested(string reason)
        {
            feedbackController?.PlayReject();
            ShowToast(reason);
        }

        private void HandleCommandSubmitted(JObject command)
        {
            feedbackController?.PlaySubmit();
        }

        private void ShowToast(string message)
        {
            if (!string.IsNullOrEmpty(message))
            {
                toastPrompt?.Show(message);
            }
        }

        private void UpdateSnapshotText(PlayerViewDto view)
        {
            if (view == null)
            {
                return;
            }

            if (roomText != null)
            {
                roomText.text = view.RoomCode + " / " + view.Side + " / v" + view.Version;
            }

            if (turnText != null)
            {
                var phase = view.State?.Value<string>("phase") ?? "unknown";
                var currentPlayer = view.State?.Value<string>("currentPlayer") ?? "unknown";
                turnText.text = "Round " + (view.State?.Value<int?>("round") ?? 0) + " | " + phase + " | " + currentPlayer;
            }

            if (legalCommandText != null)
            {
                legalCommandText.text = "Legal commands: " + (view.LegalCommands?.Count ?? 0);
            }
        }
    }
}
