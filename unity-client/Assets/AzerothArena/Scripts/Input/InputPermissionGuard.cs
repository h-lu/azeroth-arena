using AzerothArena.Commands;
using AzerothArena.State;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace AzerothArena.Input
{
    public sealed class InputPermissionGuard : MonoBehaviour
    {
        [SerializeField] private ClientSnapshotStore snapshotStore;
        [SerializeField] private VisualCommandQueue visualCommandQueue;

        public string LastBlockReason { get; private set; } = string.Empty;

        public void Configure(ClientSnapshotStore store, VisualCommandQueue queue)
        {
            snapshotStore = store;
            visualCommandQueue = queue;
        }

        private void Awake()
        {
            if (snapshotStore == null)
            {
                snapshotStore = GetComponent<ClientSnapshotStore>();
            }

            if (visualCommandQueue == null)
            {
                visualCommandQueue = GetComponent<VisualCommandQueue>();
            }
        }

        public bool CanSubmit(JToken command)
        {
            if (visualCommandQueue != null && visualCommandQueue.InputLocked)
            {
                LastBlockReason = "Animations are still resolving.";
                return false;
            }

            if (snapshotStore == null || !snapshotStore.HasSession)
            {
                LastBlockReason = "Join or create a room first.";
                return false;
            }

            if (snapshotStore.PlayerView == null)
            {
                LastBlockReason = "Waiting for the first player view.";
                return false;
            }

            if (snapshotStore.LegalCommands.Count == 0)
            {
                LastBlockReason = "No legal commands are available.";
                return false;
            }

            if (command == null || command.Type != JTokenType.Object)
            {
                LastBlockReason = "Select a legal command before submitting.";
                return false;
            }

            if (!IsStillLegal(command))
            {
                LastBlockReason = "That action is no longer legal.";
                return false;
            }

            LastBlockReason = string.Empty;
            return true;
        }

        public bool CanBeginInput()
        {
            return CanSubmit(snapshotStore?.LegalCommands.Count > 0 ? snapshotStore.LegalCommands[0] : null);
        }

        private bool IsStillLegal(JToken command)
        {
            foreach (var legalCommand in snapshotStore.LegalCommands)
            {
                if (JToken.DeepEquals(legalCommand, command))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
