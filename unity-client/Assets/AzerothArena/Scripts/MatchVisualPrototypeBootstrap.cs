using AzerothArena.AI;
using AzerothArena.Cards;
using AzerothArena.Commands;
using AzerothArena.Hand;
using AzerothArena.Input;
using AzerothArena.UI;
using AzerothArena.Visual;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace AzerothArena
{
    public sealed class MatchVisualPrototypeBootstrap : MonoBehaviour
    {
        private static readonly string[] DemoCardNames =
        {
            "Backstab",
            "Counterspell",
            "Power Word: Shield",
            "Mortal Strike",
            "Pillar Dance"
        };

        private void Awake()
        {
            BuildScene();
        }

        private void BuildScene()
        {
            EnsureEventSystem();

            var canvas = CreateCanvas();
            canvas.gameObject.AddComponent<SafeAreaFitter>();
            var targetSnap = canvas.gameObject.AddComponent<TargetSnapController>();
            targetSnap.SetPrototypeSelectableTargets("red-warrior", "red-mage", "red-druid");
            var feedback = canvas.gameObject.AddComponent<MobileFeedbackController>();
            var board = CreatePanel("Board", canvas.transform, new Vector2(0f, 56f), new Vector2(1180f, 540f), new Color(0.08f, 0.11f, 0.14f, 0.95f));
            targetSnap.RegisterTargetAnchor("red-warrior", CreateLane("Left", board.transform, -310f));
            targetSnap.RegisterTargetAnchor("red-mage", CreateLane("Center", board.transform, 0f));
            targetSnap.RegisterTargetAnchor("red-druid", CreateLane("Right", board.transform, 310f));

            var aiPanel = CreatePanel("AIOpponentView", canvas.transform, new Vector2(0f, 332f), new Vector2(540f, 132f), new Color(0.11f, 0.14f, 0.18f, 0.96f));
            var aiView = aiPanel.gameObject.AddComponent<AIOpponentView>();
            BuildAIPanel(aiPanel, aiView);

            var handRoot = CreatePanel("HandLayoutController", canvas.transform, new Vector2(0f, -304f), new Vector2(980f, 210f), new Color(0.04f, 0.05f, 0.07f, 0.7f));
            var handLayout = handRoot.gameObject.AddComponent<HandLayoutController>();
            var preview = CreateCardPreview(canvas.transform);
            for (var i = 0; i < DemoCardNames.Length; i++)
            {
                var card = BuildCard(handRoot.transform, i, preview);
                card.ReboundRequested.AddListener(_ => feedback.PlayReject());
                handLayout.Register(card);
            }

            var queue = gameObject.AddComponent<VisualCommandQueue>();
            var driver = gameObject.AddComponent<MockVisualCommandQueueDriver>();
            driver.Configure(queue, aiView, true);
        }

        private static Canvas CreateCanvas()
        {
            var root = new GameObject("MatchCanvas", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = root.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;

            var scaler = root.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1334f, 750f);
            scaler.matchWidthOrHeight = 0.5f;
            return canvas;
        }

        private static RectTransform CreatePanel(string name, Transform parent, Vector2 anchoredPosition, Vector2 size, Color color)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            go.transform.SetParent(parent, false);
            var rect = go.GetComponent<RectTransform>();
            rect.sizeDelta = size;
            rect.anchoredPosition = anchoredPosition;
            go.GetComponent<Image>().color = color;
            return rect;
        }

        private static RectTransform CreateLane(string label, Transform parent, float x)
        {
            var lane = CreatePanel(label + " Lane", parent, new Vector2(x, 0f), new Vector2(280f, 430f), new Color(0.13f, 0.17f, 0.2f, 0.82f));
            var text = CreateText(label, lane.transform, new Vector2(0f, 174f), 22, TextAnchor.MiddleCenter);
            text.color = new Color(0.82f, 0.89f, 0.94f);
            CreatePanel("Pillar", lane.transform, new Vector2(0f, 16f), new Vector2(82f, 168f), new Color(0.32f, 0.35f, 0.38f, 0.9f));
            return lane;
        }

        private static CardDragController BuildCard(Transform parent, int index, CardPreviewBindings preview)
        {
            var rect = CreatePanel("CardView " + (index + 1), parent, Vector2.zero, new Vector2(112f, 160f), new Color(0.16f, 0.19f, 0.24f, 1f));
            var canvasGroup = rect.gameObject.AddComponent<CanvasGroup>();
            rect.gameObject.AddComponent<TouchTargetExpander>();
            var view = rect.gameObject.AddComponent<CardView>();
            var longPress = rect.gameObject.AddComponent<CardLongPressPreview>();
            var drag = rect.gameObject.AddComponent<CardDragController>();

            var glow = CreatePanel("PlayableGlow", rect.transform, Vector2.zero, new Vector2(124f, 172f), new Color(1f, 0.82f, 0.28f, 0.22f));
            glow.SetAsFirstSibling();
            var cost = CreateText((index + 1).ToString(), rect.transform, new Vector2(-40f, 56f), 18, TextAnchor.MiddleCenter);
            var title = CreateText(DemoCardNames[index], rect.transform, new Vector2(0f, 24f), 16, TextAnchor.MiddleCenter);
            var body = CreateText("Drag to target", rect.transform, new Vector2(0f, -34f), 13, TextAnchor.MiddleCenter);

            view.Configure(rect, canvasGroup, rect.GetComponent<Image>(), glow.GetComponent<Image>(), cost, title, body);
            view.Bind("demo-card-" + index, DemoCardNames[index], index + 1, "Drag to target", true);
            longPress.ConfigurePreview(preview.Root, preview.TitleText, preview.BodyText, preview.Group);
            drag.ReleasedAboveThreshold.AddListener(card => card.CardView?.SetHoverAmount(1f));
            return drag;
        }

        private static CardPreviewBindings CreateCardPreview(Transform parent)
        {
            var preview = CreatePanel("HoverCardPreview", parent, new Vector2(0f, -80f), new Vector2(290f, 390f), new Color(0.12f, 0.15f, 0.19f, 0.98f));
            var group = preview.gameObject.AddComponent<CanvasGroup>();
            var title = CreateText("Card", preview.transform, new Vector2(0f, 120f), 24, TextAnchor.MiddleCenter);
            title.rectTransform.sizeDelta = new Vector2(250f, 46f);
            var body = CreateText("Rules", preview.transform, new Vector2(0f, -10f), 18, TextAnchor.MiddleCenter);
            body.rectTransform.sizeDelta = new Vector2(250f, 190f);
            preview.gameObject.SetActive(false);
            return new CardPreviewBindings(preview, group, title, body);
        }

        private static void BuildAIPanel(RectTransform panel, AIOpponentView view)
        {
            var portrait = CreatePanel("Portrait", panel.transform, new Vector2(-210f, 0f), new Vector2(90f, 90f), new Color(0.24f, 0.32f, 0.42f, 1f));
            var ring = CreatePanel("ThinkingRing", portrait.transform, Vector2.zero, new Vector2(116f, 116f), new Color(0.3f, 0.72f, 1f, 0.35f));
            ring.gameObject.AddComponent<CanvasGroup>();
            var thinkingRing = ring.gameObject.AddComponent<ThinkingRing>();

            var intentBarRoot = CreatePanel("IntentBar", panel.transform, new Vector2(70f, -28f), new Vector2(320f, 20f), new Color(0.2f, 0.23f, 0.28f, 1f));
            var intentFill = CreatePanel("Fill", intentBarRoot.transform, Vector2.zero, new Vector2(190f, 18f), new Color(1f, 0.5f, 0.25f, 1f));
            intentFill.anchorMin = new Vector2(0f, 0.5f);
            intentFill.anchorMax = new Vector2(0f, 0.5f);
            intentFill.pivot = new Vector2(0f, 0.5f);
            var intentBar = intentBarRoot.gameObject.AddComponent<IntentBar>();

            var title = CreateText("Arena Rival", panel.transform, new Vector2(30f, 36f), 24, TextAnchor.MiddleLeft);
            title.rectTransform.sizeDelta = new Vector2(340f, 30f);
            var speech = CreateText("Reading your opening.", panel.transform, new Vector2(70f, 4f), 17, TextAnchor.MiddleLeft);
            speech.rectTransform.sizeDelta = new Vector2(360f, 28f);
            var speechGroup = speech.gameObject.AddComponent<CanvasGroup>();
            var intentLabel = CreateText("Intent: READING", panel.transform, new Vector2(70f, -58f), 13, TextAnchor.MiddleLeft);
            intentLabel.rectTransform.sizeDelta = new Vector2(320f, 22f);

            view.Configure(thinkingRing, intentBar, portrait.GetComponent<Image>(), speech, speechGroup);
            intentBar.Configure(intentFill.GetComponent<Image>(), intentLabel);
        }

        private static Text CreateText(string text, Transform parent, Vector2 anchoredPosition, int fontSize, TextAnchor alignment)
        {
            var go = new GameObject("Text", typeof(RectTransform), typeof(CanvasRenderer), typeof(Text));
            go.transform.SetParent(parent, false);
            var rect = go.GetComponent<RectTransform>();
            rect.sizeDelta = new Vector2(180f, 54f);
            rect.anchoredPosition = anchoredPosition;

            var uiText = go.GetComponent<Text>();
            uiText.text = text;
            uiText.fontSize = fontSize;
            uiText.alignment = alignment;
            uiText.color = Color.white;
            uiText.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
            return uiText;
        }

        private static void EnsureEventSystem()
        {
            if (FindObjectOfType<EventSystem>() != null)
            {
                return;
            }

            new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
        }

        private readonly struct CardPreviewBindings
        {
            public CardPreviewBindings(RectTransform root, CanvasGroup group, Text titleText, Text bodyText)
            {
                Root = root;
                Group = group;
                TitleText = titleText;
                BodyText = bodyText;
            }

            public RectTransform Root { get; }
            public CanvasGroup Group { get; }
            public Text TitleText { get; }
            public Text BodyText { get; }
        }
    }
}
