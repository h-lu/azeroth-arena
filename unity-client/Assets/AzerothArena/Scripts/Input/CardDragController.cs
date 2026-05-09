using AzerothArena.Cards;
using AzerothArena.Hand;
using AzerothArena.Visual;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Events;

namespace AzerothArena.Input
{
    [RequireComponent(typeof(RectTransform))]
    public sealed class CardDragController : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler, IBeginDragHandler, IDragHandler, IEndDragHandler
    {
        [SerializeField] private CardView cardView;
        [SerializeField] private Canvas canvas;
        [SerializeField] private float dragLift = 76f;
        [SerializeField] private float maxTiltDegrees = 11f;
        [SerializeField] private float releaseThresholdY = 190f;
        [SerializeField] private float dragScale = 1.12f;
        [SerializeField] private bool inputAllowed = true;
        [SerializeField] private TargetSelectionController targetSelection;
        [SerializeField] private TargetSnapController targetSnapController;
        [SerializeField] private MobileFeedbackController feedbackController;

        public UnityEvent<CardDragController> ReleasedAboveThreshold = new();
        public UnityEvent<CardDragController> ReboundRequested = new();
        public UnityEvent<string> SnappedTargetReleased = new();

        private HandLayoutController home;
        private RectTransform rectTransform;
        private Vector2 dragOffset;
        private Vector2 previousPointer;
        private Vector2 pointerVelocity;

        public bool IsDragging { get; private set; }
        public bool InputAllowed => inputAllowed;
        public RectTransform RectTransform => rectTransform != null ? rectTransform : (RectTransform)transform;
        public CardView CardView => cardView;

        private void Awake()
        {
            rectTransform = GetComponent<RectTransform>();
            if (cardView == null)
            {
                cardView = GetComponent<CardView>();
            }

            if (canvas == null)
            {
                canvas = GetComponentInParent<Canvas>();
            }

            if (targetSnapController == null)
            {
                targetSnapController = GetComponentInParent<TargetSnapController>();
            }

            if (targetSelection == null)
            {
                targetSelection = GetComponentInParent<TargetSelectionController>();
            }

            if (feedbackController == null)
            {
                feedbackController = GetComponentInParent<MobileFeedbackController>();
            }
        }

        public void SetHome(HandLayoutController handLayout)
        {
            home = handLayout;
        }

        public void SetInputAllowed(bool allowed)
        {
            inputAllowed = allowed;
        }

        public void RequestRebound()
        {
            IsDragging = false;
            cardView?.SetDragState(false);
            cardView?.SetHoverAmount(0f);
            feedbackController?.PlayReject();
            ReboundRequested.Invoke(this);
            home?.Reflow();
        }

        public void OnPointerEnter(PointerEventData eventData)
        {
            if (!IsDragging)
            {
                home?.Reflow(this);
                cardView?.SetHoverAmount(1f);
            }
        }

        public void OnPointerExit(PointerEventData eventData)
        {
            if (!IsDragging)
            {
                home?.Reflow();
                cardView?.SetHoverAmount(0f);
            }
        }

        public void OnBeginDrag(PointerEventData eventData)
        {
            if (!inputAllowed)
            {
                RequestRebound();
                return;
            }

            IsDragging = true;
            transform.SetAsLastSibling();
            cardView?.SetDragState(true);
            feedbackController?.PlayDragStart();

            if (targetSelection != null && cardView != null && cardView.IsPlayable && !string.IsNullOrEmpty(cardView.CardId))
            {
                if (!targetSelection.BeginCardTargeting(cardView.CardId))
                {
                    RequestRebound();
                    return;
                }
            }

            RectTransformUtility.ScreenPointToLocalPointInRectangle((RectTransform)RectTransform.parent, eventData.position, eventData.pressEventCamera, out var localPointer);
            dragOffset = RectTransform.anchoredPosition - localPointer;
            previousPointer = eventData.position;
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (!IsDragging || !inputAllowed)
            {
                return;
            }

            RectTransformUtility.ScreenPointToLocalPointInRectangle((RectTransform)RectTransform.parent, eventData.position, eventData.pressEventCamera, out var localPointer);
            pointerVelocity = (eventData.position - previousPointer) / Mathf.Max(Time.deltaTime, 0.001f);
            previousPointer = eventData.position;

            RectTransform.anchoredPosition = localPointer + dragOffset + Vector2.up * dragLift;
            var tilt = Mathf.Clamp(-pointerVelocity.x * 0.01f, -maxTiltDegrees, maxTiltDegrees);
            RectTransform.localRotation = Quaternion.Euler(0f, 0f, tilt);
            RectTransform.localScale = Vector3.one * dragScale;
            targetSnapController?.TrySnapToPointer(eventData, out _);
        }

        public void OnEndDrag(PointerEventData eventData)
        {
            if (!IsDragging)
            {
                RequestRebound();
                return;
            }

            IsDragging = false;
            cardView?.SetDragState(false);

            if (targetSnapController != null && targetSnapController.TrySnapToPointer(eventData, out var targetId))
            {
                feedbackController?.PlaySnap();
                SnappedTargetReleased.Invoke(targetId);
                targetSnapController.TrySelectSnappedTarget(eventData);
            }
            else if (RectTransform.anchoredPosition.y > releaseThresholdY)
            {
                feedbackController?.PlaySubmit();
                ReleasedAboveThreshold.Invoke(this);
            }

            cardView?.SetHoverAmount(0f);
            home?.Reflow();
        }
    }
}
