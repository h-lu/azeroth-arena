using AzerothArena.Protocol;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace AzerothArena.State
{
    public sealed class ClientSnapshotStore : MonoBehaviour
    {
        public string RoomCode { get; private set; } = string.Empty;
        public string Side { get; private set; } = string.Empty;
        public string SeatToken { get; private set; } = string.Empty;
        public string RoomKind { get; private set; } = string.Empty;
        public PlayerViewDto PlayerView { get; private set; }
        public AIEncounterDebugStateDto AIEncounter { get; private set; }
        public RoomErrorPayloadDto LastError { get; private set; }
        public string LastOpponentDisconnectedSide { get; private set; } = string.Empty;

        public int Version => PlayerView?.Version ?? 0;
        public bool HasSession => !string.IsNullOrEmpty(RoomCode) && !string.IsNullOrEmpty(Side) && !string.IsNullOrEmpty(SeatToken);
        public JArray LegalCommands => PlayerView?.LegalCommands ?? new JArray();

        public void ApplyRoomJoined(RoomJoinedPayloadDto payload)
        {
            if (payload == null)
            {
                return;
            }

            RoomCode = payload.RoomCode ?? string.Empty;
            Side = payload.Side ?? string.Empty;
            SeatToken = payload.SeatToken ?? string.Empty;
            RoomKind = payload.RoomKind ?? string.Empty;
            LastError = null;
            ApplyPlayerView(payload.PlayerView);
        }

        public void ApplyPlayerView(PlayerViewDto playerView)
        {
            if (playerView == null)
            {
                return;
            }

            PlayerView = playerView;
            LastError = null;
        }

        public void ApplyAIEncounter(AIEncounterDebugStateDto aiEncounter)
        {
            AIEncounter = aiEncounter;
        }

        public void ApplyRoomError(RoomErrorPayloadDto error)
        {
            LastError = error;
        }

        public void ApplyOpponentDisconnected(OpponentDisconnectedPayloadDto payload)
        {
            LastOpponentDisconnectedSide = payload?.Side ?? string.Empty;
        }

        public void ClearSession()
        {
            RoomCode = string.Empty;
            Side = string.Empty;
            SeatToken = string.Empty;
            RoomKind = string.Empty;
            PlayerView = null;
            AIEncounter = null;
            LastError = null;
            LastOpponentDisconnectedSide = string.Empty;
        }
    }
}
