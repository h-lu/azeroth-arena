using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace AzerothArena.Protocol
{
    public sealed class ServerMessageEnvelopeDto
    {
        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("payload")]
        public JToken Payload { get; set; }
    }

    public sealed class RoomJoinedPayloadDto
    {
        [JsonProperty("roomCode")]
        public string RoomCode { get; set; }

        [JsonProperty("side")]
        public string Side { get; set; }

        [JsonProperty("seatToken")]
        public string SeatToken { get; set; }

        [JsonProperty("playerView")]
        public PlayerViewDto PlayerView { get; set; }

        [JsonProperty("roomKind")]
        public string RoomKind { get; set; }
    }

    public sealed class PlayerViewDto
    {
        [JsonProperty("roomCode")]
        public string RoomCode { get; set; }

        [JsonProperty("version")]
        public int Version { get; set; }

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; }

        [JsonProperty("updatedAt")]
        public string UpdatedAt { get; set; }

        [JsonProperty("side")]
        public string Side { get; set; }

        [JsonProperty("state")]
        public JObject State { get; set; }

        [JsonProperty("legalCommands")]
        public JArray LegalCommands { get; set; }
    }

    public sealed class RoomErrorPayloadDto
    {
        [JsonProperty("roomCode")]
        public string RoomCode { get; set; }

        [JsonProperty("side")]
        public string Side { get; set; }

        [JsonProperty("code")]
        public string Code { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }
    }

    public sealed class AIEncounterDebugStateDto
    {
        [JsonProperty("roomCode")]
        public string RoomCode { get; set; }

        [JsonProperty("humanSide")]
        public string HumanSide { get; set; }

        [JsonProperty("aiSide")]
        public string AiSide { get; set; }

        [JsonProperty("encounter")]
        public JObject Encounter { get; set; }

        [JsonProperty("persona")]
        public JObject Persona { get; set; }

        [JsonProperty("battlefieldModifiers")]
        public JArray BattlefieldModifiers { get; set; }

        [JsonProperty("objectives")]
        public JArray Objectives { get; set; }

        [JsonProperty("intentHints")]
        public JArray IntentHints { get; set; }

        [JsonProperty("dialogue")]
        public JArray Dialogue { get; set; }

        [JsonProperty("directorTraces")]
        public JArray DirectorTraces { get; set; }

        [JsonProperty("decisionTraces")]
        public JArray DecisionTraces { get; set; }

        [JsonProperty("postGameSummary")]
        public JObject PostGameSummary { get; set; }
    }

    public sealed class OpponentDisconnectedPayloadDto
    {
        [JsonProperty("roomCode")]
        public string RoomCode { get; set; }

        [JsonProperty("side")]
        public string Side { get; set; }
    }

    public sealed class ReplayExportPayloadDto
    {
        [JsonProperty("roomCode")]
        public string RoomCode { get; set; }

        [JsonProperty("export")]
        public JObject Export { get; set; }
    }

    public sealed class ParsedServerMessageDto
    {
        public string Type { get; set; }
        public RoomJoinedPayloadDto RoomJoined { get; set; }
        public PlayerViewDto PlayerView { get; set; }
        public RoomErrorPayloadDto RoomError { get; set; }
        public AIEncounterDebugStateDto AIEncounterUpdated { get; set; }
        public OpponentDisconnectedPayloadDto OpponentDisconnected { get; set; }
        public ReplayExportPayloadDto ReplayExport { get; set; }
        public IReadOnlyList<string> Warnings { get; set; } = new List<string>();
    }
}
