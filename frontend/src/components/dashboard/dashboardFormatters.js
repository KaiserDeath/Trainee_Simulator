export function formatDurationValue(seconds) {
  const value = Number(seconds);

  if (!Number.isFinite(value)) {
    return 'N/A';
  }

  const totalSeconds = Math.max(0, value);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  const secondsLabel = Number.isInteger(remainingSeconds)
    ? `${remainingSeconds}s`
    : `${remainingSeconds.toFixed(1)}s`;

  if (minutes > 0) {
    return `${minutes}m ${secondsLabel}`;
  }

  return secondsLabel;
}
