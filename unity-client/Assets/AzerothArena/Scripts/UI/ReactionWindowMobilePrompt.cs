using System.Linq;
using AzerothArena.Input;
using AzerothArena.State;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace AzerothArena.UI
{
    public sealed class ReactionWindowMobilePrompt : MonoBehaviour
    {
        [SerializeField] private ClientSnapshotStore snapshotStore;
        [SerializeField] private TargetSelectionController targetSelection;
        [SerializeField] private CanvasGroup panelGroup;
        [SerializeField] private Button passButton;
        [SerializeField] private Button trinketButton;
        [SerializeField] private Text promptText;

        public bool IsVisible { get; private set; }

        private void Awake()
        {
            snapshotStore ??= GetComponent<ClientSnapshotStore>();
            targetSelection ??= GetComponent<TargetSelectionController>();
            EnsureButtonTouchTarget(passButton);
            EnsureButtonTouchTarget(trinketButton);
        }

        private void OnEnable()
        {
            if (passButton != null)
            {
                passButton.onClick.AddListener(SubmitReactionPass);
            }

            if (trinketButton != null)
            {
                trinketButton.onClick.AddListener(SubmitTrinket);
            }
        }

        private void OnDisable()
        {
            if (passButton != null)
            {
                passButton.onClick.RemoveListener(SubmitReactionPass);
            }

            if (trinketButton != null)
            {
                trinketButton.onClick.RemoveListener(SubmitTrinket);
            }
        }

        private void Update()
        {
            Refresh();
        }

        public void Refresh()
        {
            var reactionCommands = snapshotStore?.LegalCommands
                .OfType<JObject>()
                .Where(command => IsReactionCommand(command.Value<string>("type")))
                .ToArray() ?? new JObject[0];

            IsVisible = reactionCommands.Length > 0;
            SetPanelVisible(IsVisible);

            if (promptText != null)
            {
                promptText.text = IsVisible ? "Reaction window" : string.Empty;
            }

            if (passButton != null)
            {
                passButton.gameObject.SetActive(reactionCommands.Any(command => command.Value<string>("type") == "resolveReaction"));
            }

            if (trinketButton != null)
            {
                trinketButton.gameObject.SetActive(reactionCommands.Any(command => command.Value<string>("type") == "resolveReaction" && command.Value<bool?>("useTrinket") == true));
            }
        }

        public void SubmitReactionPass()
        {
            targetSelection?.BeginReactionPass();
        }

        public void SubmitTrinket()
        {
            targetSelection?.BeginReactionTrinket();
        }

        private void SetPanelVisible(bool visible)
        {
            if (panelGroup == null)
            {
                return;
            }

            panelGroup.alpha = visible ? 1f : 0f;
            panelGroup.interactable = visible;
            panelGroup.blocksRaycasts = visible;
        }

        private static bool IsReactionCommand(string commandType)
        {
            return commandType == "resolveReaction";
        }

        private static void EnsureButtonTouchTarget(Button button)
        {
            if (button != null && button.GetComponent<TouchTargetExpander>() == null)
            {
                button.gameObject.AddComponent<TouchTargetExpander>();
            }
        }
    }
}
