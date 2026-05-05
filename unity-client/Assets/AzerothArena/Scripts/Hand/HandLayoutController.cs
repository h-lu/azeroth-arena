using System.Collections.Generic;
using AzerothArena.Input;
using UnityEngine;

namespace AzerothArena.Hand
{
    public sealed class HandLayoutController : MonoBehaviour
    {
        [SerializeField] private RectTransform handRoot;
        [SerializeField] private float cardSpacing = 122f;
        [SerializeField] private float arcDegrees = 18f;
        [SerializeField] private float verticalArc = 34f;
        [SerializeField] private float hoverLift = 38f;
        [SerializeField] private float settleSpeed = 18f;

        private readonly List<CardDragController> cards = new();
        private readonly Dictionary<CardDragController, Pose2D> targetPoses = new();

        private void Awake()
        {
            if (handRoot == null)
            {
                handRoot = (RectTransform)transform;
            }
        }

        private void Update()
        {
            foreach (var card in cards)
            {
                if (card == null || card.IsDragging)
                {
                    continue;
                }

                if (!targetPoses.TryGetValue(card, out var pose))
                {
                    continue;
                }

                var rect = card.RectTransform;
                var t = 1f - Mathf.Exp(-settleSpeed * Time.deltaTime);
                rect.anchoredPosition = Vector2.Lerp(rect.anchoredPosition, pose.Position, t);
                rect.localRotation = Quaternion.Slerp(rect.localRotation, Quaternion.Euler(0f, 0f, pose.RotationDegrees), t);
                rect.localScale = Vector3.Lerp(rect.localScale, Vector3.one * pose.Scale, t);
            }
        }

        public void Register(CardDragController card)
        {
            if (card == null || cards.Contains(card))
            {
                return;
            }

            cards.Add(card);
            card.SetHome(this);
            Reflow();
        }

        public void Unregister(CardDragController card)
        {
            if (cards.Remove(card))
            {
                targetPoses.Remove(card);
                Reflow();
            }
        }

        public void Reflow(CardDragController hoveredCard = null)
        {
            if (cards.Count == 0)
            {
                return;
            }

            var centerIndex = (cards.Count - 1) * 0.5f;
            var angleStep = cards.Count <= 1 ? 0f : arcDegrees / Mathf.Max(1, cards.Count - 1);

            for (var i = 0; i < cards.Count; i++)
            {
                var card = cards[i];
                if (card == null)
                {
                    continue;
                }

                var offsetIndex = i - centerIndex;
                var x = offsetIndex * cardSpacing;
                var y = -Mathf.Abs(offsetIndex) * verticalArc;
                var rotation = -offsetIndex * angleStep;
                var scale = card == hoveredCard ? 1.08f : 1f;

                if (card == hoveredCard)
                {
                    y += hoverLift;
                }

                targetPoses[card] = new Pose2D(new Vector2(x, y), rotation, scale);
            }
        }

        public void SnapHome(CardDragController card)
        {
            if (card == null || !targetPoses.TryGetValue(card, out var pose))
            {
                return;
            }

            var rect = card.RectTransform;
            rect.anchoredPosition = pose.Position;
            rect.localRotation = Quaternion.Euler(0f, 0f, pose.RotationDegrees);
            rect.localScale = Vector3.one * pose.Scale;
        }

        private readonly struct Pose2D
        {
            public Pose2D(Vector2 position, float rotationDegrees, float scale)
            {
                Position = position;
                RotationDegrees = rotationDegrees;
                Scale = scale;
            }

            public Vector2 Position { get; }
            public float RotationDegrees { get; }
            public float Scale { get; }
        }
    }
}
