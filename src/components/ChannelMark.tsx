"use client";

/**
 * The drop the channel left behind. It settles into this corner at the end
 * of the puzzle and simply stays there for the rest of the day — the day's
 * mark. Tapping it runs the same board again, for the pleasure of it; the
 * day is already recorded, so a second run changes nothing.
 */
export function ChannelMark({ onRetry }: { onRetry: () => void }) {
  return (
    <button type="button" aria-label="今日の水路をもう一度" onClick={onRetry} className="channel-mark" />
  );
}
