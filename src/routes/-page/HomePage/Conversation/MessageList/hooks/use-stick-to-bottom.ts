import { useCallback, useRef, useState } from 'react'

// Enough slack that a scroll position the browser has rounded, or a one-line
// overshoot, still counts as being at the bottom.
const NEAR_BOTTOM_SLACK = 32

function scrollToBottom(viewport: HTMLElement | null) {
  if (viewport === null) {
    return
  }

  // Instant, not smooth. A smooth scroll retargeted by every streamed chunk
  // never arrives, and instant is also what reduced-motion asks for.
  viewport.scrollTop = viewport.scrollHeight
}

/**
 * Keeps the transcript pinned to its newest content while a reply streams in,
 * and lets go the moment the user scrolls up to read something.
 *
 * A `ResizeObserver` on the content wrapper rather than a ref on the last
 * message: streaming appends text into a node that is already mounted, so a
 * per-message ref would fire once per turn and never again mid-reply. Size
 * changes catch both.
 *
 * Attached through a ref callback that returns its own cleanup, which is why
 * this needs no effect — the callback runs on attach, the returned function on
 * detach, with no dependency array to keep honest.
 */
export function useStickToBottom() {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [isNearBottom, setIsNearBottom] = useState(true)
  // The same flag again, for the observer below. It is attached once, so state
  // read through its closure would be frozen at whatever it was on attach.
  const isNearBottomRef = useRef(true)
  const previousScrollTopRef = useRef(0)

  /**
   * Following is given up only when the reader moves *away* from the bottom, and
   * never merely because the bottom is currently out of view.
   *
   * Measuring the gap alone breaks during a reply: the scroll this hook performs
   * is reported a frame later, by which time more text has arrived, so the
   * handler sees a gap nobody scrolled to open and unsticks itself. Direction
   * cannot be faked that way — a programmatic scroll only ever moves down.
   */
  function handleViewportScroll() {
    const viewport = viewportRef.current

    if (viewport === null) {
      return
    }

    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    const isScrollingUp = viewport.scrollTop < previousScrollTopRef.current

    previousScrollTopRef.current = viewport.scrollTop

    const isAtBottom = distanceFromBottom <= NEAR_BOTTOM_SLACK

    isNearBottomRef.current =
      isAtBottom || (isNearBottomRef.current && !isScrollingUp)
    setIsNearBottom(isNearBottomRef.current)
  }

  // Memoised deliberately, and this is the exception the project rules allow:
  // React re-invokes a ref callback whose identity changed, so an inline one
  // would tear down and rebuild the observer on every render — which during a
  // reply is every chunk.
  const observeTranscriptContent = useCallback((content: HTMLDivElement) => {
    let pendingFrame: number | null = null

    const observer = new ResizeObserver(() => {
      // One scroll write per frame. Skipping while a frame is already pending,
      // rather than cancelling and rescheduling, is load-bearing: a burst of
      // chunks would otherwise keep pushing the write back so it never ran.
      if (pendingFrame !== null) {
        return
      }

      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null

        if (isNearBottomRef.current) {
          scrollToBottom(viewportRef.current)
        }
      })
    })

    observer.observe(content)

    return () => {
      if (pendingFrame !== null) {
        cancelAnimationFrame(pendingFrame)
      }

      observer.disconnect()
    }
  }, [])

  return {
    viewportRef,
    handleViewportScroll,
    observeTranscriptContent,
    isNearBottom,
    scrollToLatest: () => scrollToBottom(viewportRef.current),
  }
}
