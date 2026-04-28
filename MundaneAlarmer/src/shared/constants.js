/** Message type: offscreen → SW, playback completed without error. */
export const MSG_AUDIO_DONE = "AUDIO_DONE";

/** Message type: offscreen → SW, playback failed. */
export const MSG_AUDIO_ERROR = "AUDIO_ERROR";

/** Message type: SW → offscreen, abort playback immediately. */
export const MSG_STOP_AUDIO = "STOP_AUDIO";

/** Extension-relative path to the bundled audio asset. */
export const AUDIO_PATH = "audio/notification.opus";

/** Stable ID for the persistent notification so onClosed can identify it. */
export const NOTIFICATION_ID = "audio-notifier-main";
