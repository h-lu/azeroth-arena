using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace AzerothArena.Commands
{
    public sealed class VisualCommandQueue : MonoBehaviour
    {
        [SerializeField] private bool playOnEnqueue = true;
        [SerializeField] private bool inputLocked;

        private readonly Queue<IVisualCommand> queue = new();
        private Coroutine playRoutine;

        public bool IsPlaying => playRoutine != null;
        public bool InputLocked => inputLocked;
        public int PendingCount => queue.Count;
        public string CurrentDebugName { get; private set; } = string.Empty;

        public void Enqueue(IVisualCommand command)
        {
            if (command == null)
            {
                return;
            }

            queue.Enqueue(command);
            if (playOnEnqueue && playRoutine == null)
            {
                playRoutine = StartCoroutine(PlayLoop());
            }
        }

        public void EnqueueRange(IEnumerable<IVisualCommand> commands)
        {
            foreach (var command in commands)
            {
                Enqueue(command);
            }
        }

        public void Clear()
        {
            queue.Clear();
            CurrentDebugName = string.Empty;
            inputLocked = false;

            if (playRoutine != null)
            {
                StopCoroutine(playRoutine);
                playRoutine = null;
            }
        }

        private IEnumerator PlayLoop()
        {
            var context = new VisualCommandContext(this);

            while (queue.Count > 0)
            {
                var command = queue.Dequeue();
                CurrentDebugName = command.DebugName;
                inputLocked = command.BlockingMode != VisualCommandBlockingMode.NonBlocking;
                yield return command.Execute(context);
                inputLocked = false;
            }

            CurrentDebugName = string.Empty;
            playRoutine = null;
        }
    }
}
