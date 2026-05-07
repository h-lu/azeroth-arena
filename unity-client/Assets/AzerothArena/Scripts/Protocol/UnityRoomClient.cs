using System;
using System.Threading.Tasks;
using AzerothArena.State;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace AzerothArena.Protocol
{
    [RequireComponent(typeof(WebSocketTransport))]
    [RequireComponent(typeof(ClientSnapshotStore))]
    public sealed class UnityRoomClient : MonoBehaviour
    {
        [SerializeField] private string serverUrl = GameProtocol.DefaultWebSocketUrl;

        private WebSocketTransport transport;
        private ClientSnapshotStore snapshotStore;

        public event Action<PlayerViewDto> PlayerViewUpdated;
        public event Action<AIEncounterDebugStateDto> AIEncounterUpdated;
        public event Action<RoomErrorPayloadDto> RoomError;
        public event Action<string> StatusChanged;

        public ClientSnapshotStore SnapshotStore => snapshotStore;
        public bool IsConnected => transport != null && transport.IsConnected;

        private void Awake()
        {
            transport = GetComponent<WebSocketTransport>();
            snapshotStore = GetComponent<ClientSnapshotStore>();
            transport.Connected += () => StatusChanged?.Invoke("connected");
            transport.Disconnected += reason => StatusChanged?.Invoke("disconnected:" + reason);
            transport.TransportError += error => StatusChanged?.Invoke("error:" + error);
            transport.MessageReceived += HandleRawMessage;
        }

        public Task ConnectAsync()
        {
            StatusChanged?.Invoke("connecting");
            return transport.ConnectAsync(serverUrl);
        }

        public async Task CreateRoomAsync(string preferredSide = null)
        {
            await EnsureConnectedAsync();
            await transport.SendAsync(new CreateRoomRequestDto
            {
                PreferredSide = preferredSide
            });
        }

        public async Task CreateAIEncounterAsync(string preferredSide = GameProtocol.Sides.Blue, string encounterTemplateId = null)
        {
            await EnsureConnectedAsync();
            await transport.SendAsync(new CreateAIEncounterRequestDto
            {
                PreferredSide = preferredSide,
                EncounterTemplateId = encounterTemplateId
            });
        }

        public async Task JoinRoomAsync(string roomCode, string preferredSide = null)
        {
            await EnsureConnectedAsync();
            await transport.SendAsync(new JoinRoomRequestDto
            {
                RoomCode = NormalizeRoomCode(roomCode),
                PreferredSide = preferredSide
            });
        }

        public async Task ReconnectAsync(string roomCode, string side, string seatToken)
        {
            await EnsureConnectedAsync();
            await transport.SendAsync(new ReconnectRequestDto
            {
                RoomCode = NormalizeRoomCode(roomCode),
                Side = side,
                SeatToken = seatToken
            });
        }

        public async Task SubmitCommandAsync(JToken legalCommand, int? expectedVersion = null)
        {
            if (!snapshotStore.HasSession)
            {
                EmitLocalError("AUTH_REQUIRED", "Cannot submit a command before joining a room.");
                return;
            }

            await EnsureConnectedAsync();
            await transport.SendAsync(new SubmitCommandRequestDto
            {
                RoomCode = snapshotStore.RoomCode,
                Side = snapshotStore.Side,
                SeatToken = snapshotStore.SeatToken,
                Command = GameProtocol.CloneCommand(legalCommand),
                ExpectedVersion = expectedVersion ?? snapshotStore.Version
            });
        }

        public async Task SubmitLegalCommandByIndexAsync(int legalCommandIndex)
        {
            if (legalCommandIndex < 0 || legalCommandIndex >= snapshotStore.LegalCommands.Count)
            {
                EmitLocalError("BAD_COMMAND_INDEX", "Selected legal command index is out of range.");
                return;
            }

            await SubmitCommandAsync(snapshotStore.LegalCommands[legalCommandIndex], snapshotStore.Version);
        }

        public async Task ExportReplayAsync()
        {
            if (!snapshotStore.HasSession)
            {
                EmitLocalError("AUTH_REQUIRED", "Cannot export replay before joining a room.");
                return;
            }

            await EnsureConnectedAsync();
            await transport.SendAsync(new ExportReplayRequestDto
            {
                RoomCode = snapshotStore.RoomCode,
                Side = snapshotStore.Side,
                SeatToken = snapshotStore.SeatToken
            });
        }

        private async Task EnsureConnectedAsync()
        {
            if (!IsConnected)
            {
                await ConnectAsync();
            }
        }

        private void HandleRawMessage(string json)
        {
            ParsedServerMessageDto parsed;
            try
            {
                parsed = GameProtocol.ParseServerMessage(json);
            }
            catch (Exception error)
            {
                EmitLocalError("BAD_SERVER_MESSAGE", error.Message);
                return;
            }

            switch (parsed.Type)
            {
                case GameProtocol.ServerMessageTypes.RoomJoined:
                    snapshotStore.ApplyRoomJoined(parsed.RoomJoined);
                    PlayerViewUpdated?.Invoke(snapshotStore.PlayerView);
                    StatusChanged?.Invoke("roomJoined");
                    break;
                case GameProtocol.ServerMessageTypes.PlayerView:
                    snapshotStore.ApplyPlayerView(parsed.PlayerView);
                    PlayerViewUpdated?.Invoke(snapshotStore.PlayerView);
                    break;
                case GameProtocol.ServerMessageTypes.RoomError:
                    snapshotStore.ApplyRoomError(parsed.RoomError);
                    RoomError?.Invoke(parsed.RoomError);
                    StatusChanged?.Invoke("roomError:" + parsed.RoomError?.Code);
                    break;
                case GameProtocol.ServerMessageTypes.AIEncounterUpdated:
                    snapshotStore.ApplyAIEncounter(parsed.AIEncounterUpdated);
                    AIEncounterUpdated?.Invoke(parsed.AIEncounterUpdated);
                    break;
                case GameProtocol.ServerMessageTypes.OpponentDisconnected:
                    snapshotStore.ApplyOpponentDisconnected(parsed.OpponentDisconnected);
                    StatusChanged?.Invoke("opponentDisconnected:" + parsed.OpponentDisconnected?.Side);
                    break;
            }
        }

        private void EmitLocalError(string code, string message)
        {
            var error = new RoomErrorPayloadDto
            {
                RoomCode = snapshotStore != null ? snapshotStore.RoomCode : string.Empty,
                Side = snapshotStore != null ? snapshotStore.Side : string.Empty,
                Code = code,
                Message = message
            };
            snapshotStore?.ApplyRoomError(error);
            RoomError?.Invoke(error);
            StatusChanged?.Invoke("roomError:" + code);
        }

        private static string NormalizeRoomCode(string roomCode)
        {
            return string.IsNullOrWhiteSpace(roomCode) ? string.Empty : roomCode.Trim().ToUpperInvariant();
        }
    }
}
