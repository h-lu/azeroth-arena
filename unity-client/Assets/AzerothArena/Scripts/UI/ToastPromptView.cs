using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace AzerothArena.UI
{
    public sealed class ToastPromptView : MonoBehaviour
    {
        [SerializeField] private Text messageText;
        [SerializeField] private CanvasGroup canvasGroup;
        [SerializeField] private float visibleSeconds = 2.2f;

        private Coroutine hideRoutine;

        public void Configure(Text text, CanvasGroup group)
        {
            messageText = text;
            canvasGroup = group;
        }

        private void Awake()
        {
            if (messageText == null)
            {
                messageText = GetComponentInChildren<Text>();
            }

            if (canvasGroup == null)
            {
                canvasGroup = GetComponent<CanvasGroup>();
            }

            HideNow();
        }

        public void Show(string message)
        {
            if (messageText != null)
            {
                messageText.text = message ?? string.Empty;
            }

            if (canvasGroup != null)
            {
                canvasGroup.alpha = 1f;
                canvasGroup.blocksRaycasts = true;
            }

            if (hideRoutine != null)
            {
                StopCoroutine(hideRoutine);
            }

            hideRoutine = StartCoroutine(HideAfterDelay());
        }

        public void HideNow()
        {
            if (canvasGroup != null)
            {
                canvasGroup.alpha = 0f;
                canvasGroup.blocksRaycasts = false;
            }
        }

        private IEnumerator HideAfterDelay()
        {
            yield return new WaitForSeconds(visibleSeconds);
            HideNow();
            hideRoutine = null;
        }
    }
}
