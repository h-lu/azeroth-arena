using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace AzerothArena.Protocol
{
    public abstract class ClientMessageDto
    {
        [JsonProperty("type")]
        public string Type { get; protected set; }
    }

    public sealed class CreateRoomRequestDto : ClientMessageDto
    {
        [JsonProperty("preferredSide", NullValueHandling = NullValueHandling.Ignore)]
        public string PreferredSide { get; set; }

        public CreateRoomRequestDto()
        {
            Type = GameProtocol.ClientMessageTypes.CreateRoom;
        }
    }

    public sealed class CreateAIEncounterRequestDto : ClientMessageDto
    {
        [JsonProperty("preferredSide", NullValueHandling = NullValueHandling.Ignore)]
        public string PreferredSide { get; set; }

        [JsonProperty("encounterTemplateId", NullValueHandling = NullValueHandling.Ignore)]
        public string EncounterTemplateId { get; set; }

        public CreateAIEncounterRequestDto()
        {
            Type = GameProtocol.ClientMessageTypes.CreateAIEncounter;
        }
    }

    public sealed class JoinRoomRequestDto : ClientMessageDto
    {
        [JsonProperty("roomCode")]
        public string RoomCode { get; set; }

        [JsonProperty("preferredSide", NullValueHandling = NullValueHandling.Ignore)]
        public string PreferredSide { get; set; }

        public JoinRoomRequestDto()
        {
            Type = GameProtocol.ClientMessageTypes.JoinRoom;
        }
    }

    public sealed class ReconnectRequestDto : ClientMessageDto
    {
        [JsonProperty("roomCode")]
        public string RoomCode { get; set; }

        [JsonProperty("side")]
        public string Side { get; set; }

        [JsonProperty("seatToken")]
        public string SeatToken { get; set; }

        public ReconnectRequestDto()
        {
            Type = GameProtocol.ClientMessageTypes.Reconnect;
        }
    }

    public sealed class SubmitCommandRequestDto : ClientMessageDto
    {
        [JsonProperty("roomCode")]
        public string RoomCode { get; set; }

        [JsonProperty("side")]
        public string Side { get; set; }

        [JsonProperty("seatToken")]
        public string SeatToken { get; set; }

        [JsonProperty("command")]
        public JObject Command { get; set; }

        [JsonProperty("expectedVersion", NullValueHandling = NullValueHandling.Ignore)]
        public int? ExpectedVersion { get; set; }

        public SubmitCommandRequestDto()
        {
            Type = GameProtocol.ClientMessageTypes.SubmitCommand;
        }
    }

    public sealed class ExportReplayRequestDto : ClientMessageDto
    {
        [JsonProperty("roomCode")]
        public string RoomCode { get; set; }

        [JsonProperty("side")]
        public string Side { get; set; }

        [JsonProperty("seatToken")]
        public string SeatToken { get; set; }

        public ExportReplayRequestDto()
        {
            Type = GameProtocol.ClientMessageTypes.ExportReplay;
        }
    }
}
