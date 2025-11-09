export function setupTabs(dom) {
  const { tabButtons, tabContents } = dom;
  if (!tabButtons || tabButtons.length === 0 || !tabContents || tabContents.length === 0) {
    return;
  }

  function activateTab(targetId) {
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === targetId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    tabContents.forEach((content) => {
      const isActive = content.id === targetId;
      content.classList.toggle("hidden", !isActive);
      content.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.tab;
      if (!targetId) return;
      activateTab(targetId);
    });
  });

  const activeButton = Array.from(tabButtons).find((btn) => btn.classList.contains("active"));
  activateTab(activeButton ? activeButton.dataset.tab : tabButtons[0].dataset.tab);
}


