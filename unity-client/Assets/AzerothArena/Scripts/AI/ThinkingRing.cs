using UnityEngine;
using UnityEngine.UI;

namespace AzerothArena.AI
{
    public sealed class ThinkingRing : MonoBehaviour
    {
        [SerializeField] private Image ringImage;
        [SerializeField] private CanvasGroup canvasGroup;
        [SerializeField] private float rotationDegreesPerSecond = 120f;
        [SerializeField] private float pulseSpeed = 3f;

        private bool active;

        private void Awake()
        {
            if (ringImage == null)
            {
                ringImage = GetComponent<Image>();
            }

            if (canvasGroup == null)
            {
                canvasGroup = GetComponent<CanvasGroup>();
            }

            SetActive(false);
        }

        private void Update()
        {
            if (!active)
            {
                return;
            }

            transform.Rotate(0f, 0f, -rotationDegreesPerSecond * Time.deltaTime);

            if (canvasGroup != null)
            {
                canvasGroup.alpha = 0.62f + Mathf.Sin(Time.time * pulseSpeed) * 0.24f;
            }
        }

        public void SetActive(bool isActive)
        {
            active = isActive;
            gameObject.SetActive(isActive);

            if (canvasGroup != null)
            {
                canvasGroup.alpha = isActive ? 0.72f : 0f;
            }
        }
    }
}
