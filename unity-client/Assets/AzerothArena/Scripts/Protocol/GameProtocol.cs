using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace AzerothArena.Protocol
{
    public static class GameProtocol
    {
        public const string DefaultWebSocketUrl = "ws://127.0.0.1:8788";

        private static readonly JsonSerializerSettings SerializerSettings = new()
        {
            NullValueHandling = NullValueHandling.Ignore,
            MissingMemberHandling = MissingMemberHandling.Ignore
        };

        public static string Serialize(ClientMessageDto message)
        {
            if (message == null)
            {
                throw new ArgumentNullException(nameof(message));
            }

            return JsonConvert.SerializeObject(message, SerializerSettings);
        }

        public static ParsedServerMessageDto ParseServerMessage(string json)
        {
            var envelope = JsonConvert.DeserializeObject<ServerMessageEnvelopeDto>(json, SerializerSettings);
            if (envelope == null || string.IsNullOrWhiteSpace(envelope.Type))
            {
                throw new InvalidOperationException("Server message is missing a type.");
            }

            var warnings = new List<string>();
            var parsed = new ParsedServerMessageDto
            {
                Type = envelope.Type,
                Warnings = warnings
            };

            switch (envelope.Type)
            {
                case ServerMessageTypes.RoomJoined:
                    parsed.RoomJoined = envelope.Payload?.ToObject<RoomJoinedPayloadDto>();
                    if (parsed.RoomJoined?.PlayerView == null)
                    {
                        warnings.Add("roomJoined payload did not include playerView.");
                    }
                    break;
                case ServerMessageTypes.PlayerView:
                    parsed.PlayerView = envelope.Payload?.ToObject<PlayerViewDto>();
                    break;
                case ServerMessageTypes.RoomError:
                    parsed.RoomError = envelope.Payload?.ToObject<RoomErrorPayloadDto>();
                    break;
                case ServerMessageTypes.AIEncounterUpdated:
                    parsed.AIEncounterUpdated = envelope.Payload?.ToObject<AIEncounterDebugStateDto>();
                    break;
                case ServerMessageTypes.OpponentDisconnected:
                    parsed.OpponentDisconnected = envelope.Payload?.ToObject<OpponentDisconnectedPayloadDto>();
                    break;
                case ServerMessageTypes.ReplayExport:
                    parsed.ReplayExport = envelope.Payload?.ToObject<ReplayExportPayloadDto>();
                    break;
                default:
                    warnings.Add("Unknown server message type: " + envelope.Type);
                    break;
            }

            return parsed;
        }

        public static JObject CloneCommand(JToken command)
        {
            if (command == null || command.Type != JTokenType.Object)
            {
                throw new ArgumentException("Command must be a JSON object.", nameof(command));
            }

            return (JObject)command.DeepClone();
        }

        public static class ClientMessageTypes
        {
            public const string CreateRoom = "createRoom";
            public const string CreateAIEncounter = "createAIEncounter";
            public const string JoinRoom = "joinRoom";
            public const string Reconnect = "reconnect";
            public const string SubmitCommand = "submitCommand";
            public const string ExportReplay = "exportReplay";
        }

        public static class ServerMessageTypes
        {
            public const string RoomJoined = "roomJoined";
            public const string PlayerView = "playerView";
            public const string RoomError = "roomError";
            public const string ReplayExport = "replayExport";
            public const string AIEncounterUpdated = "aiEncounterUpdated";
            public const string OpponentDisconnected = "opponentDisconnected";
        }

        public static class RoomKinds
        {
            public const string Pvp = "pvp";
            public const string AIEncounter = "aiEncounter";
        }

        public static class Sides
        {
            public const string Blue = "blue";
            public const string Red = "red";
        }
    }
}
