using AzerothArena.Cards;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace AzerothArena.UI
{
    [RequireComponent(typeof(RectTransform))]
    public sealed class CardLongPressPreview : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler, IBeginDragHandler
    {
        [SerializeField] private CardView cardView;
        [SerializeField] private RectTransform previewRoot;
        [SerializeField] private Text titleText;
        [SerializeField] private Text bodyText;
        [SerializeField] private CanvasGroup previewGroup;
        [SerializeField] private float holdSeconds = 0.34f;
        [SerializeField] private Vector2 previewOffset = new(0f, 218f);

        private RectTransform rectTransform;
        private float pointerDownTime;
        private bool pointerDown;
        private bool previewVisible;

        public bool PreviewVisible => previewVisible;

        private void Awake()
        {
            rectTransform = GetComponent<RectTransform>();
            if (cardView == null)
            {
                cardView = GetComponent<CardView>();
            }

            HidePreview();
        }

        private void Update()
        {
            if (!pointerDown || previewVisible)
            {
                return;
            }

            if (Time.unscaledTime - pointerDownTime >= holdSeconds)
            {
                ShowPreview();
            }
        }

        public void ConfigurePreview(RectTransform root, Text title, Text body, CanvasGroup group)
        {
            previewRoot = root;
            titleText = title;
            bodyText = body;
            previewGroup = group;
            HidePreview();
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            pointerDown = true;
            pointerDownTime = Time.unscaledTime;
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            pointerDown = false;
            HidePreview();
        }

        public void OnPointerExit(PointerEventData eventData)
        {
            pointerDown = false;
            HidePreview();
        }

        public void OnBeginDrag(PointerEventData eventData)
        {
            pointerDown = false;
            HidePreview();
        }

        public void ShowPreview()
        {
            if (previewRoot == null || cardView == null)
            {
                return;
            }

            previewVisible = true;
            previewRoot.gameObject.SetActive(true);
            PositionPreview();

            if (titleText != null)
            {
                titleText.text = cardView.DisplayName;
            }

            if (bodyText != null)
            {
                bodyText.text = cardView.RulesText;
            }

            if (previewGroup != null)
            {
                previewGroup.alpha = 1f;
                previewGroup.blocksRaycasts = false;
            }
        }

        public void HidePreview()
        {
            previewVisible = false;
            if (previewGroup != null)
            {
                previewGroup.alpha = 0f;
                previewGroup.blocksRaycasts = false;
            }

            if (previewRoot != null)
            {
                previewRoot.gameObject.SetActive(false);
            }
        }

        private void PositionPreview()
        {
            if (previewRoot.parent is not RectTransform parent)
            {
                previewRoot.position = rectTransform.position;
                previewRoot.anchoredPosition += previewOffset;
                return;
            }

            var localCardCenter = parent.InverseTransformPoint(rectTransform.TransformPoint(rectTransform.rect.center));
            var desiredPosition = (Vector2)localCardCenter + previewOffset;
            previewRoot.anchoredPosition = ClampToParent(desiredPosition, parent, previewRoot);
        }

        private static Vector2 ClampToParent(Vector2 desiredPosition, RectTransform parent, RectTransform child)
        {
            var parentRect = parent.rect;
            var childSize = child.rect.size;
            var pivot = child.pivot;

            var minX = parentRect.xMin + childSize.x * pivot.x;
            var maxX = parentRect.xMax - childSize.x * (1f - pivot.x);
            var minY = parentRect.yMin + childSize.y * pivot.y;
            var maxY = parentRect.yMax - childSize.y * (1f - pivot.y);

            if (minX > maxX)
            {
                minX = maxX = parentRect.center.x;
            }

            if (minY > maxY)
            {
                minY = maxY = parentRect.center.y;
            }

            return new Vector2(
                Mathf.Clamp(desiredPosition.x, minX, maxX),
                Mathf.Clamp(desiredPosition.y, minY, maxY));
        }
    }
}
