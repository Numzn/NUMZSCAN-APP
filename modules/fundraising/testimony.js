import { TESTIMONY_INTERVAL } from "./constants.js";

export function createTestimonyRotator(dom, state) {
  let index = 0;
  let timer = null;

  function start() {
    stop();
    if (!dom.testimonyDisplay || !state.testimonies.length) return;
    dom.testimonyDisplay.textContent = state.testimonies[index];
    timer = setInterval(() => {
      index = (index + 1) % state.testimonies.length;
      dom.testimonyDisplay.textContent = state.testimonies[index];
    }, TESTIMONY_INTERVAL);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function reset() {
    index = 0;
    if (dom.testimonyDisplay) {
      dom.testimonyDisplay.textContent = state.testimonies[0] || "";
    }
  }

  return {
    start,
    stop,
    reset,
  };
}


