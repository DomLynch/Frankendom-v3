// Page zoom is locked (owner, 2026-09-17: an accidental pinch cost the HUD mid-fight; the accessibility trade is recorded in
// tests/input.test.ts). One helper for every entry (the game and the Origins preview, Dom 2026-10-07: the preview zoomed on his
// iPhone because its entry had no guard), so the next entry cannot miss it.
export function lockPageZoom(doc: Document, doubleTap: { surface: string; clickDriven: string }): void {   // doc: the caller's document (a test harness lends its own)
  // iOS Safari ignores the viewport meta in the browser, so the pinch gesture itself is blocked here.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
    doc.addEventListener(type, (event) => event.preventDefault());
  // Not enough on its own: with the camera free, a second finger landing while the first orbits the arena still zoomed the
  // whole page on iPhone (owner, 2026-09-21). Refuse every two-finger move at the document, non-passive, so the pinch never
  // starts. A single finger keeps every tap, drag and stick move: only moves with two or more touches are refused.
  doc.addEventListener('touchmove', (event) => { if (event.touches.length > 1) event.preventDefault(); }, { passive: false });
  doc.addEventListener('touchstart', (event) => { if (event.touches.length > 1) event.preventDefault(); }, { passive: false });   // a pinch whose first move slips through can still start Safari's zoom: refuse the second finger at touchstart too
  // A double tap still zoomed the whole fight ~2x on iPhone (owner, 2026-09-26 22:47, on/near an attack button): iOS Safari does not
  // honour user-scalable=no or touch-action for its double-tap zoom. On the given surface only (controls that act on pointerdown) the
  // second single-finger touchend within 350 ms is refused, so nothing is lost; everything matching `clickDriven` keeps both taps.
  let lastTouchEnd = -Infinity;
  doc.addEventListener('touchend', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const onSurface = target === doc.body || target === doc.documentElement
      || (!!target?.closest(doubleTap.surface) && !(doubleTap.clickDriven && target.closest(doubleTap.clickDriven)));
    if (event.touches.length === 0 && event.timeStamp - lastTouchEnd < 350 && onSurface) event.preventDefault();
    lastTouchEnd = event.timeStamp;
  }, { passive: false });
}
