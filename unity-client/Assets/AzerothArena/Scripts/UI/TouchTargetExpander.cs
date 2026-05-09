using UnityEngine;
using UnityEngine.UI;

namespace AzerothArena.UI
{
    [ExecuteAlways]
    [RequireComponent(typeof(RectTransform))]
    public sealed class TouchTargetExpander : MonoBehaviour
    {
        [SerializeField] private Vector2 minimumTouchSize = new(64f, 64f);
        [SerializeField] private bool addTransparentRaycastImage = true;

        private RectTransform rectTransform;
        private LayoutElement layoutElement;

        public Vector2 MinimumTouchSize => minimumTouchSize;

        private void Awake()
        {
            rectTransform = GetComponent<RectTransform>();
            EnsureTouchTarget();
        }

        private void OnEnable()
        {
            EnsureTouchTarget();
        }

        private void OnValidate()
        {
            EnsureTouchTarget();
        }

        public void EnsureTouchTarget()
        {
            if (rectTransform == null)
            {
                rectTransform = GetComponent<RectTransform>();
            }

            layoutElement = GetComponent<LayoutElement>() ?? gameObject.AddComponent<LayoutElement>();
            layoutElement.minWidth = Mathf.Max(layoutElement.minWidth, minimumTouchSize.x);
            layoutElement.minHeight = Mathf.Max(layoutElement.minHeight, minimumTouchSize.y);

            var size = rectTransform.sizeDelta;
            rectTransform.sizeDelta = new Vector2(Mathf.Max(size.x, minimumTouchSize.x), Mathf.Max(size.y, minimumTouchSize.y));

            if (addTransparentRaycastImage && GetComponent<Graphic>() == null)
            {
                var image = gameObject.AddComponent<Image>();
                image.color = new Color(1f, 1f, 1f, 0f);
                image.raycastTarget = true;
            }
        }
    }
}
