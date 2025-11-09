export function createAutoSync(state, dom) {
  let enabled = typeof state.autoSyncEnabled === "boolean" ? state.autoSyncEnabled : true;

  if (dom.autoSyncToggle) {
    dom.autoSyncToggle.checked = enabled;
  }

  function set(value) {
    enabled = Boolean(value);
    state.autoSyncEnabled = enabled;
    if (dom.autoSyncToggle) {
      dom.autoSyncToggle.checked = enabled;
    }
  }

  function isEnabled() {
    return enabled;
  }

  function toggleFromEvent(event, { onChange }) {
    set(event.target.checked);
    onChange?.(enabled);
  }

  return {
    set,
    isEnabled,
    toggleFromEvent,
  };
}


