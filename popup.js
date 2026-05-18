document.addEventListener('DOMContentLoaded', () => {
  const toggleCheckbox = document.getElementById('toggle-extension');

  // Load the current saved setting
  chrome.storage.local.get({ extensionEnabled: true }, (result) => {
    toggleCheckbox.checked = result.extensionEnabled;
  });

  // Save the setting AND notify the active tab instantly
  toggleCheckbox.addEventListener('change', async () => {
    const isEnabled = toggleCheckbox.checked;

    // 1. Save to storage
    await chrome.storage.local.set({ extensionEnabled: isEnabled });

    // 2. Find the active tab using the correct 'active' property
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id) {
      chrome.tabs.sendMessage(activeTab.id, { action: "toggleHighlights", enabled: isEnabled })
        // Catch errors gracefully (e.g., if on a restricted page like chrome://extensions)
        .catch(err => console.log("Cannot communicate with tab:", err.message));
    }
  });
});