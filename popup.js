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
  // Add this listener sequence inside your DOMContentLoaded block in popup.js
  const updateBtn = document.getElementById('update-btn');
  const updateStatus = document.getElementById('update-status');

  updateBtn.addEventListener('click', async () => {
    updateBtn.disabled = true;
    updateBtn.style.backgroundColor = '#747d8c';
    updateStatus.textContent = "Downloading latest data...";

    try {
      // 1. Fetch live CSV text from official repository stream
      const response = await fetch('https://davidmegginson.github.io/ourairports-data/airports.csv');
      if (!response.ok) throw new Error("Network response failed");

      updateStatus.textContent = "Parsing database records...";
      const csvText = await response.text();

      // 2. Parse the CSV rows into an optimized JSON dictionary structure
      const updatedDatabase = parseCSVToJSON(csvText);

      updateStatus.textContent = "Saving to local database cache...";

      // 3. Save directly into local extension storage overrides
      await chrome.storage.local.set({ downloadedAirportDatabase: updatedDatabase });

      updateStatus.textContent = "Database update complete!";
      updateStatus.style.color = "#2ed573";

      // 4. Send message to the active page layout to update view state instantly
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.id) {
        chrome.tabs.sendMessage(activeTab.id, { action: "reloadDatabaseFromStorage" }).catch(()=>{});
      }

    } catch (error) {
      console.error(error);
      updateStatus.textContent = "Update failed. Try again.";
      updateStatus.style.color = "#ff4757";
    } finally {
      updateBtn.disabled = false;
      updateBtn.style.backgroundColor = '#00cbc6';
    }
  });

  // Fast, streamlined CSV line parser logic helper
  function parseCSVToJSON(csvText) {
    const databaseOutput = {};

    // Cleanly split lines, handling carriage returns safely
    const lines = csvText.split(/\r?\n/);
    if (lines.length === 0) return databaseOutput;

    // 1. Process Header Column Positions
    // Helper to accurately split a single CSV row, tracking quotes
    function splitCSVRow(line) {
      const result = [];
      let currentField = '';
      let insideQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          insideQuotes = !insideQuotes; // Toggle quote state
        } else if (char === ',' && !insideQuotes) {
          result.push(currentField.trim());
          currentField = '';
        } else {
          currentField += char;
        }
      }
      result.push(currentField.trim());
      return result;
    }

    const headers = splitCSVRow(lines[0]);
    const colIdent = headers.indexOf("ident");
    const colType = headers.indexOf("type");
    const colName = headers.indexOf("name");
    const colElev = headers.indexOf("elevation_ft");
    const colCont = headers.indexOf("continent");
    const colRegion = headers.indexOf("iso_region");
    const colMuni = headers.indexOf("municipality");
    const colWiki = headers.indexOf("wikipedia_link");
    const colHome = headers.indexOf("home_link");
    const colGps = headers.indexOf("gps_code");
    const colLocal = headers.indexOf("local_code");
    const colIata = headers.indexOf("iata_code");

    // 2. Loop Through Rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue; // Skip blank entries

      const row = splitCSVRow(line);
      const cleanIdent = (row[colIdent] || '').toUpperCase();

      if (!cleanIdent) continue;

      // Map clean key value attributes matching your original schema
      databaseOutput[cleanIdent] = {
        ident: cleanIdent,
        type: row[colType] || 'unknown',
        name: row[colName] || 'Unknown Airport',
        elevation_ft: row[colElev] ? parseInt(row[colElev], 10) || null : null,
        continent: (row[colCont] || '').toUpperCase(),
        iso_region: row[colRegion] || '',
        municipality: row[colMuni] || '',
        wikipedia_link: row[colWiki] || '',
        home_link: row[colHome] || '',
        gps_code: row[colGps] || '',
        local_code: row[colLocal] || '',
        iata_code: row[colIata] || ''
      };
    }

    return databaseOutput;
  }
});