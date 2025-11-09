export function createOverlayController() {
  let popup = null;

  function open() {
    if (popup && !popup.closed) {
      popup.focus();
      return popup;
    }
    popup = window.open("obs-overlay.html", "LHGOverlay", "width=1280,height=720");
    return popup;
  }

  return {
    open,
  };
}


