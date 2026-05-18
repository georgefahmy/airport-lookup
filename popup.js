document.addEventListener('DOMContentLoaded', () => {
  const toggleCheckbox = document.getElementById('toggle-extension');
  const continentBoxes = document.querySelectorAll('.cont-box');
  const allContinents = ['NA', 'EU', 'AS', 'SA', 'AF', 'OC', 'AN'];

  // 1. Load current saved settings (default to all selected)
  chrome.storage.local.get({
    extensionEnabled: true,
    allowedContinents: allContinents
  }, (result) => {
    toggleCheckbox.checked = result.extensionEnabled;
    continentBoxes.forEach(box => {
      box.checked = result.allowedContinents.includes(box.value);
    });
  });

  // Helper function to send instant runtime update messages to content.js
  async function broadcastMessage(messagePayload) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id) {
      chrome.tabs.sendMessage(activeTab.id, messagePayload).catch(err => {});
    }
  }

  // 2. Save master enable/disable setting toggle
  toggleCheckbox.addEventListener('change', async () => {
    const isEnabled = toggleCheckbox.checked;
    await chrome.storage.local.set({ extensionEnabled: isEnabled });
    broadcastMessage({ action: "toggleHighlights", enabled: isEnabled });
  });

  // 3. Save continent filter selections
  continentBoxes.forEach(box => {
    box.addEventListener('change', async () => {
      // Create array of currently checked values
      const selectedContinents = Array.from(continentBoxes)
                                      .filter(b => b.checked)
                                      .map(b => b.value);

      await chrome.storage.local.set({ allowedContinents: selectedContinents });
      broadcastMessage({ action: "updateContinents", continents: selectedContinents });
    });
  });
});