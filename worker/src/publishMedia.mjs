/** Prefer rendered shortform, then app playback. Drive-only rows fail without a public URL. */
export function resolvePublicVideoUrl(content) {
  const shortform = `${content?.shortform_video_url || ''}`.trim();
  if (/^https?:\/\//i.test(shortform)) {
    return shortform;
  }

  const playback = `${content?.app_playback_url || ''}`.trim();
  if (/^https?:\/\//i.test(playback)) {
    return playback;
  }

  return null;
}

export function truncate(text, maxLength) {
  const value = `${text || ''}`.trim();
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function buildSocialCaption(content) {
  const caption = `${content?.social_caption || ''}`.trim();
  if (caption) {
    return caption;
  }

  const phrase = `${content?.phrase || ''}`.trim();
  const subPhrase = `${content?.sub_phrase || ''}`.trim();
  if (phrase && subPhrase) {
    return `${phrase}\n${subPhrase}`;
  }
  return phrase || 'MansAlarm';
}

export function buildYoutubeTitle(content) {
  return truncate(`${content?.phrase || ''}`.trim() || 'MansAlarm', 100);
}
