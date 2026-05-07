# Azeroth Arena Unity Client

This Unity project contains the Week 5 visual prototype and the Week 7 WebSocket foundation.

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

## Week 7 WebSocket Foundation

The server connection layer lives under:

```text
Assets/AzerothArena/Scripts/Protocol/
Assets/AzerothArena/Scripts/State/
```

It includes temporary C# DTOs for the current TypeScript online protocol, a `ClientWebSocket` transport, a `UnityRoomClient` facade, and `ClientSnapshotStore` for the latest room session and `PlayerView`.

Unity package dependency:

```text
com.unity.nuget.newtonsoft-json
```

Repo-side static validation:

```bash
npm run validate:unity-websocket
```
