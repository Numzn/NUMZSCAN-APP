export function createLoader(dom) {
  let overlay = dom.loaderOverlay;
  let textNode = dom.loaderText;
  return {
    show(message = "Working…") {
      if (textNode && message) textNode.textContent = message;
      overlay?.classList.remove("hidden");
    },
    hide() {
      overlay?.classList.add("hidden");
    },
    update(message) {
      if (textNode && message) textNode.textContent = message;
    },
  };
}


