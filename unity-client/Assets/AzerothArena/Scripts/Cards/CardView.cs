using UnityEngine;
using UnityEngine.UI;

namespace AzerothArena.Cards
{
    public sealed class CardView : MonoBehaviour
    {
        [Header("Bindings")]
        [SerializeField] private RectTransform rectTransform;
        [SerializeField] private CanvasGroup canvasGroup;
        [SerializeField] private Image frameImage;
        [SerializeField] private Image glowImage;
        [SerializeField] private Text costText;
        [SerializeField] private Text nameText;
        [SerializeField] private Text bodyText;

        [Header("Style")]
        [SerializeField] private Color playableFrame = new Color(0.95f, 0.78f, 0.38f);
        [SerializeField] private Color lockedFrame = new Color(0.42f, 0.47f, 0.55f);
        [SerializeField] private Color draggingGlow = new Color(0.4f, 0.82f, 1f, 0.55f);

        public string CardId { get; private set; } = string.Empty;
        public string DisplayName { get; private set; } = string.Empty;
        public string RulesText { get; private set; } = string.Empty;
        public bool IsPlayable { get; private set; }
        public RectTransform RectTransform => rectTransform != null ? rectTransform : (RectTransform)transform;

        public void Configure(RectTransform rect, CanvasGroup group, Image frame, Image glow, Text cost, Text title, Text body)
        {
            rectTransform = rect;
            canvasGroup = group;
            frameImage = frame;
            glowImage = glow;
            costText = cost;
            nameText = title;
            bodyText = body;
        }

        private void Reset()
        {
            rectTransform = GetComponent<RectTransform>();
            canvasGroup = GetComponent<CanvasGroup>();
            frameImage = GetComponent<Image>();
        }

        private void Awake()
        {
            if (rectTransform == null)
            {
                rectTransform = GetComponent<RectTransform>();
            }

            if (canvasGroup == null)
            {
                canvasGroup = GetComponent<CanvasGroup>();
            }
        }

        public void Bind(string cardId, string displayName, int cost, string rulesText, bool isPlayable)
        {
            CardId = cardId;
            DisplayName = displayName;
            RulesText = rulesText;
            IsPlayable = isPlayable;

            if (costText != null)
            {
                costText.text = cost.ToString();
            }

            if (nameText != null)
            {
                nameText.text = displayName;
            }

            if (bodyText != null)
            {
                bodyText.text = rulesText;
            }

            if (frameImage != null)
            {
                frameImage.color = isPlayable ? playableFrame : lockedFrame;
            }

            SetDragState(false);
        }

        public void SetDragState(bool isDragging)
        {
            if (canvasGroup != null)
            {
                canvasGroup.alpha = isDragging ? 0.92f : 1f;
                canvasGroup.blocksRaycasts = !isDragging;
            }

            if (glowImage != null)
            {
                glowImage.enabled = isDragging || IsPlayable;
                glowImage.color = isDragging ? draggingGlow : new Color(1f, 0.82f, 0.28f, 0.22f);
            }
        }

        public void SetHoverAmount(float amount)
        {
            if (glowImage == null)
            {
                return;
            }

            var color = glowImage.color;
            color.a = Mathf.Lerp(0.16f, 0.58f, Mathf.Clamp01(amount));
            glowImage.color = color;
        }
    }
}
