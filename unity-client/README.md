# Azeroth Arena Unity Visual Prototype

This is the Week 5 Unity visual prototype scaffold. It is intentionally local-only and does not connect to the WebSocket server yet.

Open `unity-client/` as a Unity project, then load:

```text
Assets/AzerothArena/Scenes/Match.unity
```

Included prototype deliverables:

- `Assets/AzerothArena/Scenes/Match.unity`
- `Assets/AzerothArena/Prefabs/Cards/CardView.prefab`
- `Assets/AzerothArena/Prefabs/AI/AIOpponentView.prefab`
- `Assets/AzerothArena/Prefabs/AI/ThinkingRing.prefab`
- `Assets/AzerothArena/Prefabs/AI/IntentBar.prefab`
- `Assets/AzerothArena/Scripts/Hand/HandLayoutController.cs`
- `Assets/AzerothArena/Scripts/Input/CardDragController.cs`
- `Assets/AzerothArena/Scripts/Commands/VisualCommandQueue.cs`
- `Assets/AzerothArena/Scripts/AI/AIOpponentView.cs`

The scene uses `MatchVisualPrototypeBootstrap` to create a mock board, fan-shaped hand, draggable cards, and an AI opponent panel with a thinking ring and intent bar. The mock `VisualCommandQueue` plays a short loop so the first view has motion even without a server.
