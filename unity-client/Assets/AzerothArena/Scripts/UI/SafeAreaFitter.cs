using UnityEngine;

namespace AzerothArena.UI
{
    [ExecuteAlways]
    [RequireComponent(typeof(RectTransform))]
    public sealed class SafeAreaFitter : MonoBehaviour
    {
        [SerializeField] private bool enforceLandscapeFrame = true;
        [SerializeField] private Vector2 landscapeReferenceResolution = new(1334f, 750f);
        [SerializeField] private RectTransform contentRoot;

        private RectTransform rectTransform;
        private Rect lastSafeArea;
        private Vector2Int lastScreenSize;

        public Rect CurrentSafeArea { get; private set; }
        public bool IsLandscape => Screen.width >= Screen.height;

        private void Awake()
        {
            rectTransform = GetComponent<RectTransform>();
            if (contentRoot == null)
            {
                contentRoot = rectTransform;
            }

            ApplySafeArea();
        }

        private void OnEnable()
        {
            ApplySafeArea();
        }

        private void Update()
        {
            var screenSize = new Vector2Int(Screen.width, Screen.height);
            if (lastSafeArea != Screen.safeArea || lastScreenSize != screenSize)
            {
                ApplySafeArea();
            }
        }

        public void ApplySafeArea()
        {
            if (contentRoot == null)
            {
                return;
            }

            var safeArea = Screen.safeArea;
            if (safeArea.width <= 0f || safeArea.height <= 0f)
            {
                safeArea = new Rect(0f, 0f, Screen.width, Screen.height);
            }

            lastSafeArea = safeArea;
            lastScreenSize = new Vector2Int(Screen.width, Screen.height);
            CurrentSafeArea = safeArea;

            var anchorMin = safeArea.position;
            var anchorMax = safeArea.position + safeArea.size;
            anchorMin.x /= Mathf.Max(1f, Screen.width);
            anchorMin.y /= Mathf.Max(1f, Screen.height);
            anchorMax.x /= Mathf.Max(1f, Screen.width);
            anchorMax.y /= Mathf.Max(1f, Screen.height);

            contentRoot.anchorMin = anchorMin;
            contentRoot.anchorMax = anchorMax;
            contentRoot.offsetMin = Vector2.zero;
            contentRoot.offsetMax = Vector2.zero;

            if (enforceLandscapeFrame && IsLandscape)
            {
                var referenceAspect = landscapeReferenceResolution.x / Mathf.Max(1f, landscapeReferenceResolution.y);
                var safeAspect = safeArea.width / Mathf.Max(1f, safeArea.height);
                if (safeAspect > referenceAspect)
                {
                    var width = safeArea.height * referenceAspect;
                    var horizontalPadding = (safeArea.width - width) * 0.5f / Mathf.Max(1f, Screen.width);
                    contentRoot.anchorMin = new Vector2(anchorMin.x + horizontalPadding, anchorMin.y);
                    contentRoot.anchorMax = new Vector2(anchorMax.x - horizontalPadding, anchorMax.y);
                }
            }
        }
    }
}
