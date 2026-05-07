using System;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace AzerothArena.Protocol
{
    public sealed class WebSocketTransport : MonoBehaviour
    {
        [SerializeField] private string serverUrl = GameProtocol.DefaultWebSocketUrl;
        [SerializeField] private bool connectOnStart;

        private readonly ConcurrentQueue<string> inboundMessages = new();
        private readonly ArraySegment<byte> receiveBuffer = new(new byte[64 * 1024]);
        private ClientWebSocket socket;
        private CancellationTokenSource cancellation;

        public event Action Connected;
        public event Action<string> MessageReceived;
        public event Action<string> Disconnected;
        public event Action<string> TransportError;

        public bool IsConnected => socket != null && socket.State == WebSocketState.Open;
        public string ServerUrl => serverUrl;

        private async void Start()
        {
            if (connectOnStart)
            {
                await ConnectAsync(serverUrl);
            }
        }

        private void Update()
        {
            while (inboundMessages.TryDequeue(out var message))
            {
                MessageReceived?.Invoke(message);
            }
        }

        private async void OnDestroy()
        {
            await DisconnectAsync("destroyed");
        }

        public async Task ConnectAsync(string url)
        {
            await DisconnectAsync("reconnecting");
            serverUrl = string.IsNullOrWhiteSpace(url) ? GameProtocol.DefaultWebSocketUrl : url;
            socket = new ClientWebSocket();
            cancellation = new CancellationTokenSource();

            try
            {
                await socket.ConnectAsync(new Uri(serverUrl), cancellation.Token);
                Connected?.Invoke();
                _ = ReceiveLoopAsync(cancellation.Token);
            }
            catch (Exception error)
            {
                TransportError?.Invoke(error.Message);
                await DisconnectAsync("connect-failed");
            }
        }

        public async Task SendAsync(string json)
        {
            if (!IsConnected)
            {
                TransportError?.Invoke("WebSocket is not connected.");
                return;
            }

            var bytes = Encoding.UTF8.GetBytes(json);
            try
            {
                await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cancellation.Token);
            }
            catch (Exception error)
            {
                TransportError?.Invoke(error.Message);
            }
        }

        public Task SendAsync(ClientMessageDto message)
        {
            return SendAsync(GameProtocol.Serialize(message));
        }

        public async Task DisconnectAsync(string reason = "client-disconnect")
        {
            var currentSocket = socket;
            socket = null;

            var currentCancellation = cancellation;
            cancellation = null;
            currentCancellation?.Cancel();

            if (currentSocket != null)
            {
                try
                {
                    if (currentSocket.State == WebSocketState.Open)
                    {
                        await currentSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, reason, CancellationToken.None);
                    }
                }
                catch (Exception error)
                {
                    TransportError?.Invoke(error.Message);
                }
                finally
                {
                    currentSocket.Dispose();
                }
            }

            if (currentSocket != null)
            {
                Disconnected?.Invoke(reason);
            }
        }

        private async Task ReceiveLoopAsync(CancellationToken ct)
        {
            var builder = new StringBuilder();

            while (!ct.IsCancellationRequested && socket != null)
            {
                WebSocketReceiveResult result;
                try
                {
                    result = await socket.ReceiveAsync(receiveBuffer, ct);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception error)
                {
                    TransportError?.Invoke(error.Message);
                    break;
                }

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    break;
                }

                builder.Append(Encoding.UTF8.GetString(receiveBuffer.Array, receiveBuffer.Offset, result.Count));

                if (!result.EndOfMessage)
                {
                    continue;
                }

                inboundMessages.Enqueue(builder.ToString());
                builder.Clear();
            }

            if (!ct.IsCancellationRequested)
            {
                Disconnected?.Invoke("server-closed");
            }
        }
    }
}
