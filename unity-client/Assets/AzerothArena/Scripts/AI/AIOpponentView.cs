using UnityEngine;
using UnityEngine.UI;

namespace AzerothArena.AI
{
    public sealed class AIOpponentView : MonoBehaviour
    {
        [SerializeField] private ThinkingRing thinkingRing;
        [SerializeField] private IntentBar intentBar;
        [SerializeField] private Image portraitFrame;
        [SerializeField] private Text speechText;
        [SerializeField] private CanvasGroup speechGroup;

        [Header("Mood Colors")]
        [SerializeField] private Color calmColor = new Color(0.35f, 0.62f, 0.92f);
        [SerializeField] private Color pressureColor = new Color(1f, 0.43f, 0.22f);
        [SerializeField] private Color defenseColor = new Color(0.44f, 0.78f, 0.58f);

        public void Configure(ThinkingRing ring, IntentBar bar, Image frame, Text speech, CanvasGroup speechCanvasGroup)
        {
            thinkingRing = ring;
            intentBar = bar;
            portraitFrame = frame;
            speechText = speech;
            speechGroup = speechCanvasGroup;
        }

        public void ShowThinking(bool active)
        {
            thinkingRing?.SetActive(active);
        }

        public void ShowIntent(string threatType, float confidence)
        {
            intentBar?.ShowIntent(threatType, confidence);
            SetMood(threatType);
        }

        public void Say(string text)
        {
            if (speechText != null)
            {
                speechText.text = text;
            }

            if (speechGroup != null)
            {
                speechGroup.alpha = string.IsNullOrWhiteSpace(text) ? 0f : 1f;
            }
        }

        public void SetMood(string mood)
        {
            if (portraitFrame == null)
            {
                return;
            }

            portraitFrame.color = mood switch
            {
                "defense" or "heal" => defenseColor,
                "pressure" or "damage" or "burst" => pressureColor,
                _ => calmColor
            };
        }
    }
}
