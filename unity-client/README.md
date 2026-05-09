# Azeroth Arena Unity Client

This Unity project contains the Week 5 visual prototype, Week 7-9 WebSocket / visual command foundation, and Week 11 mobile-first polish.

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

The scene uses `MatchVisualPrototypeBootstrap` to create a mock board, fan-shaped hand, draggable cards, and an AI opponent panel with a thinking ring and intent bar. The mock `VisualCommandQueue` plays a short loop so the first view has motion even without a server. Week 11 mobile polish components are also mounted there: safe-area fitting, expanded touch targets, long-press card preview, prototype target snap anchors, and mobile feedback hooks.

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

## Week 11 Mobile Polish

Mobile-facing scripts live under:

```text
Assets/AzerothArena/Scripts/UI/SafeAreaFitter.cs
Assets/AzerothArena/Scripts/UI/TouchTargetExpander.cs
Assets/AzerothArena/Scripts/UI/CardLongPressPreview.cs
Assets/AzerothArena/Scripts/Input/TargetSnapController.cs
Assets/AzerothArena/Scripts/UI/ReactionWindowMobilePrompt.cs
Assets/AzerothArena/Scripts/Visual/MobileFeedbackController.cs
```

Live targeting still submits commands through `TargetSelectionController` and `UnityRoomClient`; the prototype target list is only for checking snap feel without a server session.
