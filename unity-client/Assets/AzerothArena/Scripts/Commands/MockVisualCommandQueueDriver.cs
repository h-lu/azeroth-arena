using System.Collections;
using System.Collections.Generic;
using AzerothArena.AI;
using UnityEngine;

namespace AzerothArena.Commands
{
    public sealed class MockVisualCommandQueueDriver : MonoBehaviour
    {
        [SerializeField] private VisualCommandQueue queue;
        [SerializeField] private AIOpponentView aiOpponentView;
        [SerializeField] private bool loop = true;

        public void Configure(VisualCommandQueue targetQueue, AIOpponentView targetOpponentView, bool shouldLoop)
        {
            queue = targetQueue;
            aiOpponentView = targetOpponentView;
            loop = shouldLoop;
        }

        private void Awake()
        {
            if (queue == null)
            {
                queue = GetComponent<VisualCommandQueue>();
            }
        }

        private void Start()
        {
            EnqueueDemoBeat();
        }

        public void EnqueueDemoBeat()
        {
            queue.EnqueueRange(BuildDemoCommands());
        }

        private IEnumerable<IVisualCommand> BuildDemoCommands()
        {
            yield return new DelayVisualCommand("Opening beat", 0.35f, VisualCommandBlockingMode.BlocksInput);
            yield return new AIThinkingVisualCommand(aiOpponentView, "pressure", 0.7f, "Looking for a setup window.", 1.15f);
            yield return new DelayVisualCommand("Card impact mock", 0.45f, VisualCommandBlockingMode.BlocksQueue);

            if (loop)
            {
                yield return new CallbackVisualCommand("Loop demo beat", EnqueueDemoBeat);
            }
        }

        private sealed class DelayVisualCommand : IVisualCommand
        {
            private readonly float seconds;

            public DelayVisualCommand(string debugName, float seconds, VisualCommandBlockingMode blockingMode)
            {
                DebugName = debugName;
                this.seconds = seconds;
                BlockingMode = blockingMode;
            }

            public string DebugName { get; }
            public VisualCommandBlockingMode BlockingMode { get; }

            public IEnumerator Execute(VisualCommandContext context)
            {
                yield return new WaitForSeconds(seconds);
            }
        }

        private sealed class AIThinkingVisualCommand : IVisualCommand
        {
            private readonly AIOpponentView view;
            private readonly string threatType;
            private readonly float confidence;
            private readonly string speech;
            private readonly float seconds;

            public AIThinkingVisualCommand(AIOpponentView view, string threatType, float confidence, string speech, float seconds)
            {
                this.view = view;
                this.threatType = threatType;
                this.confidence = confidence;
                this.speech = speech;
                this.seconds = seconds;
            }

            public string DebugName => "AI thinking";
            public VisualCommandBlockingMode BlockingMode => VisualCommandBlockingMode.BlocksInput;

            public IEnumerator Execute(VisualCommandContext context)
            {
                view?.ShowThinking(true);
                view?.ShowIntent(threatType, confidence);
                view?.Say(speech);
                yield return new WaitForSeconds(seconds);
                view?.ShowThinking(false);
            }
        }

        private sealed class CallbackVisualCommand : IVisualCommand
        {
            private readonly System.Action callback;

            public CallbackVisualCommand(string debugName, System.Action callback)
            {
                DebugName = debugName;
                this.callback = callback;
            }

            public string DebugName { get; }
            public VisualCommandBlockingMode BlockingMode => VisualCommandBlockingMode.NonBlocking;

            public IEnumerator Execute(VisualCommandContext context)
            {
                callback?.Invoke();
                yield break;
            }
        }
    }
}
