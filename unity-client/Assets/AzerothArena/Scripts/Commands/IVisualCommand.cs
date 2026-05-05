using System.Collections;
using UnityEngine;

namespace AzerothArena.Commands
{
    public enum VisualCommandBlockingMode
    {
        NonBlocking,
        BlocksInput,
        BlocksQueue
    }

    public interface IVisualCommand
    {
        string DebugName { get; }
        VisualCommandBlockingMode BlockingMode { get; }
        IEnumerator Execute(VisualCommandContext context);
    }

    public sealed class VisualCommandContext
    {
        public VisualCommandContext(MonoBehaviour runner)
        {
            Runner = runner;
        }

        public MonoBehaviour Runner { get; }
    }
}
