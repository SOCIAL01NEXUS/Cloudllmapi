/* ==========================================================================
   Study Buddy — official YouTube IFrame Player API wrapper
   Uses https://www.youtube.com/iframe_api and the privacy-enhanced
   youtube-nocookie.com host. No other tracking code is added.
   ========================================================================== */

let apiPromise = null;

export function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error('Could not load the YouTube player.')); };
    document.head.append(s);
  });
  return apiPromise;
}

/** Accepts a full YouTube URL (watch, youtu.be, embed, shorts) or a bare 11-char id. Returns id or null. */
export function extractYouTubeId(input) {
  const v = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  try {
    const u = new URL(v);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/^\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
        if (m) id = m[2];
      }
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Creates (or replaces) a player inside the element with the given id.
 * onEnded fires when the video finishes.
 */
export async function createPlayer(elementId, videoId, { onEnded } = {}) {
  const YT = await loadYouTubeAPI();
  return new Promise((resolve) => {
    const player = new YT.Player(elementId, {
      videoId,
      host: 'https://www.youtube-nocookie.com',
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onReady: () => resolve(player),
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED && typeof onEnded === 'function') onEnded();
        },
      },
    });
  });
}
