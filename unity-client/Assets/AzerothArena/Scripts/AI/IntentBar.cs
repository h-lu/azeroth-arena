using UnityEngine;
using UnityEngine.UI;

namespace AzerothArena.AI
{
    public sealed class IntentBar : MonoBehaviour
    {
        [SerializeField] private Image fillImage;
        [SerializeField] private Text labelText;
        [SerializeField] private Color lowColor = new Color(0.32f, 0.72f, 1f);
        [SerializeField] private Color midColor = new Color(1f, 0.78f, 0.3f);
        [SerializeField] private Color highColor = new Color(1f, 0.34f, 0.25f);

        public void Configure(Image fill, Text label)
        {
            fillImage = fill;
            labelText = label;

            if (fillImage != null)
            {
                fillImage.type = Image.Type.Filled;
                fillImage.fillMethod = Image.FillMethod.Horizontal;
                fillImage.fillOrigin = 0;
            }
        }

        public void ShowIntent(string threatType, float confidence)
        {
            var clamped = Mathf.Clamp01(confidence);

            if (fillImage != null)
            {
                fillImage.fillAmount = clamped;
                fillImage.color = clamped > 0.66f ? highColor : clamped > 0.34f ? midColor : lowColor;
            }

            if (labelText != null)
            {
                labelText.text = string.IsNullOrWhiteSpace(threatType)
                    ? "Reading"
                    : "Intent: " + threatType.ToUpperInvariant();
            }
        }
    }
}
