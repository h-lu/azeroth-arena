using UnityEngine;

namespace AzerothArena.Visual
{
    public sealed class MobileFeedbackController : MonoBehaviour
    {
        [SerializeField] private AudioSource audioSource;
        [SerializeField] private AudioClip dragStartClip;
        [SerializeField] private AudioClip snapClip;
        [SerializeField] private AudioClip rejectClip;
        [SerializeField] private AudioClip submitClip;
        [SerializeField] private bool hapticsEnabled = true;

        private void Awake()
        {
            if (audioSource == null)
            {
                audioSource = GetComponent<AudioSource>() ?? gameObject.AddComponent<AudioSource>();
            }
        }

        public void PlayDragStart()
        {
            PlayOneShot(dragStartClip, 0.45f);
        }

        public void PlaySnap()
        {
            PlayOneShot(snapClip, 0.5f);
            Vibrate();
        }

        public void PlayReject()
        {
            PlayOneShot(rejectClip, 0.65f);
            Vibrate();
        }

        public void PlaySubmit()
        {
            PlayOneShot(submitClip, 0.6f);
        }

        public void SetHapticsEnabled(bool enabled)
        {
            hapticsEnabled = enabled;
        }

        private void PlayOneShot(AudioClip clip, float volume)
        {
            if (audioSource != null && clip != null)
            {
                audioSource.PlayOneShot(clip, volume);
            }
        }

        private void Vibrate()
        {
            if (hapticsEnabled && Application.isMobilePlatform)
            {
                Handheld.Vibrate();
            }
        }
    }
}
