using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

namespace AzerothArena.Input
{
    public sealed class TargetSnapController : MonoBehaviour
    {
        [SerializeField] private TargetSelectionController targetSelection;
        [SerializeField] private Canvas canvas;
        [SerializeField] private float snapRadiusPixels = 86f;
        [SerializeField] private string[] prototypeSelectableTargetIds = Array.Empty<string>();

        private readonly Dictionary<string, RectTransform> targetAnchors = new();
        private string highlightedTargetId = string.Empty;

        public event Action<string> SnapTargetChanged;

        private void Awake()
        {
            if (targetSelection == null)
            {
                targetSelection = GetComponent<TargetSelectionController>() ?? GetComponentInParent<TargetSelectionController>();
            }

            if (canvas == null)
            {
                canvas = GetComponentInParent<Canvas>();
            }
        }

        public void RegisterTargetAnchor(string targetId, RectTransform anchor)
        {
            if (string.IsNullOrEmpty(targetId) || anchor == null)
            {
                return;
            }

            targetAnchors[targetId] = anchor;
        }

        public void UnregisterTargetAnchor(string targetId)
        {
            if (!string.IsNullOrEmpty(targetId))
            {
                targetAnchors.Remove(targetId);
            }
        }

        public void SetPrototypeSelectableTargets(params string[] targetIds)
        {
            prototypeSelectableTargetIds = targetIds ?? Array.Empty<string>();
        }

        public bool TrySnapToPointer(PointerEventData eventData, out string targetId)
        {
            var camera = eventData?.pressEventCamera ?? canvas?.worldCamera;
            return TryFindNearestTarget(eventData?.position ?? Vector2.zero, camera, out targetId);
        }

        public bool TrySelectSnappedTarget(PointerEventData eventData)
        {
            if (!TrySnapToPointer(eventData, out var targetId))
            {
                return false;
            }

            targetSelection?.SelectTarget(targetId);
            return true;
        }

        public bool TryFindNearestTarget(Vector2 screenPosition, Camera uiCamera, out string targetId)
        {
            targetId = string.Empty;
            var selectable = BuildSelectableTargetIds();
            if (selectable.Count == 0)
            {
                SetHighlightedTarget(string.Empty);
                return false;
            }

            var bestDistance = float.MaxValue;

            foreach (var id in selectable)
            {
                if (!targetAnchors.TryGetValue(id, out var anchor) || anchor == null || !anchor.gameObject.activeInHierarchy)
                {
                    continue;
                }

                var anchorScreen = RectTransformUtility.WorldToScreenPoint(uiCamera, anchor.position);
                var distance = Vector2.Distance(screenPosition, anchorScreen);
                if (distance < bestDistance)
                {
                    bestDistance = distance;
                    targetId = id;
                }
            }

            var snapped = !string.IsNullOrEmpty(targetId) && bestDistance <= snapRadiusPixels;
            SetHighlightedTarget(snapped ? targetId : string.Empty);
            return snapped;
        }

        private HashSet<string> BuildSelectableTargetIds()
        {
            if (targetSelection != null && targetSelection.IsTargeting)
            {
                return new HashSet<string>(targetSelection.CurrentState.SelectableTargetIds);
            }

            if (targetSelection == null && prototypeSelectableTargetIds.Length > 0)
            {
                return new HashSet<string>(prototypeSelectableTargetIds);
            }

            return new HashSet<string>();
        }

        private void SetHighlightedTarget(string targetId)
        {
            if (highlightedTargetId == targetId)
            {
                return;
            }

            highlightedTargetId = targetId;
            SnapTargetChanged?.Invoke(highlightedTargetId);
        }
    }
}
