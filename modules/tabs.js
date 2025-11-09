export function setupTabs(dom) {
  const { tabButtons, tabContents } = dom;
  const buttons = Array.from(tabButtons || []);
  const contents = Array.from(tabContents || []);

  if (buttons.length === 0 || contents.length === 0) {
    return;
  }

  function activateTab(targetId) {
    buttons.forEach((btn) => {
      const isActive = btn.dataset.tab === targetId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    contents.forEach((content) => {
      const isActive = content.id === targetId;
      content.classList.toggle("active", isActive);
      content.classList.toggle("hidden", !isActive);
      content.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.tab;
      if (!targetId) return;
      activateTab(targetId);
    });
  });

  const activeButton = buttons.find((btn) => btn.classList.contains("active"));
  activateTab(activeButton ? activeButton.dataset.tab : buttons[0].dataset.tab);
}
