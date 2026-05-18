let airportDatabase = {};
const shortCodeIndex = new Map();
const airportRegex = /\b(K[A-Z0-9]{3}|[A-Z][0-9]{2}|[A-Z]{3})\b/g;

// Tracks whether the page has already been highlighted to prevent double-processing
let highlightsApplied = false;

async function init() {
  try {
    // 1. Fetch data and build indexes globally immediately on load
    // (This ensures data is ready in memory whenever the user flips the toggle)
    const jsonUrl = chrome.runtime.getURL('airports.json');
    const response = await fetch(jsonUrl);
    airportDatabase = await response.json();
    buildShortCodeIndex();

    // 2. Check storage to see if we should highlight right away
    chrome.storage.local.get({ extensionEnabled: true }, (result) => {
      if (result.extensionEnabled) {
        applyHighlights();
      }
    });
  } catch (error) {
    console.error("Failed to initialize Airport Lookup extension:", error);
  }
}

function buildShortCodeIndex() {
  for (const [mainKey, airport] of Object.entries(airportDatabase)) {
    if (airport.gps_code) shortCodeIndex.set(airport.gps_code.toUpperCase(), mainKey);
    if (airport.local_code) shortCodeIndex.set(airport.local_code.toUpperCase(), mainKey);
    if (airport.iata_code) shortCodeIndex.set(airport.iata_code.toUpperCase(), mainKey);
  }
}

function getAirportData(code) {
  const upperCode = code.toUpperCase();
  if (airportDatabase[upperCode]) return airportDatabase[upperCode];
  const mappedMainKey = shortCodeIndex.get(upperCode);
  if (mappedMainKey && airportDatabase[mappedMainKey]) return airportDatabase[mappedMainKey];
  return null;
}

// Applies highlights to the page if they aren't already there
function applyHighlights() {
  if (highlightsApplied) return;
  searchAndWrapAirports(document.body);
  highlightsApplied = true;
}

// Strips highlights away instantly by unwrapping the original text content
function removeHighlights() {
  if (!highlightsApplied) return;

  // Find all elements we created with our custom wrapper class
  const wrappers = document.querySelectorAll('.sv-airport-wrapper');

  wrappers.forEach(wrapper => {
    // Find the original plain text string (inside our highlight span)
    const originalText = wrapper.querySelector('.sv-airport-highlight').textContent;
    // Replace the entire nested structure back with simple text node
    const textNode = document.createTextNode(originalText);
    wrapper.parentNode.replaceChild(textNode, wrapper);
  });

  highlightsApplied = false;
}

function searchAndWrapAirports(node) {
  const ignoreTags = ['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'NOSCRIPT', 'A', 'CODE'];
  if (node.parentNode && ignoreTags.includes(node.parentNode.tagName)) return;

  if (node.nodeType === Node.TEXT_NODE) {
    const matches = node.nodeValue.match(airportRegex);
    if (matches) {
      const hasValidAirport = matches.some(m => getAirportData(m));
      if (!hasValidAirport) return;

      const span = document.createElement('span');
      span.innerHTML = node.nodeValue.replace(airportRegex, (match) => {
        const airportData = getAirportData(match);
        if (!airportData) return match;

        const targetIdent = airportData.ident || match;
        const name = airportData.name || "Unknown Airport";
        const location = `${airportData.municipality || ''}, ${airportData.iso_region || ''}`.replace(/^,\s*/, '');
        const elevation = airportData.elevation_ft ? `${airportData.elevation_ft} ft` : null;
        const skyvectorUrl = `https://skyvector.com/airport/${targetIdent}`;

        const wikiLink = airportData.wikipedia_link ? `<a class="sv-secondary-link" href="${airportData.wikipedia_link}" target="_blank" rel="noopener noreferrer">Wikipedia ↗</a>` : '';
        const homeLink = airportData.home_link ? `<a class="sv-secondary-link" href="${airportData.home_link}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : '';

        return `<span class="sv-airport-wrapper">
                  <span class="sv-airport-highlight">${match}</span>
                  <span class="sv-airport-tooltip">
                    <div class="sv-tooltip-header">
                      <strong>${targetIdent}</strong>
                      <span class="sv-source-tag">${airportData.type.replace('_', ' ')}</span>
                    </div>
                    <div class="sv-tooltip-body">
                      <div class="sv-airport-name">${name}</div>
                      ${location ? `<div class="sv-airport-loc">📍 ${location}</div>` : ''}
                      ${elevation ? `<div class="sv-airport-elev">⛰️ Elev: ${elevation}</div>` : ''}
                    </div>
                    <a class="sv-primary-link" href="${skyvectorUrl}" target="_blank" rel="noopener noreferrer">View on SkyVector ↗</a>
                    ${wikiLink || homeLink ? `<div class="sv-link-footer">${wikiLink} ${homeLink}</div>` : ''}
                  </span>
                </span>`;
      });
      node.parentNode.replaceChild(span, node);
    }
  } else {
    // We use an array snapshot of child nodes because mutating DOM during live iteration can skip nodes
    const children = Array.from(node.childNodes);
    for (let i = 0; i < children.length; i++) {
      searchAndWrapAirports(children[i]);
    }
  }
}

// -------------------------------------------------------------
// NEW: Listen for messages sent from popup.js
// -------------------------------------------------------------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleHighlights") {
    if (request.enabled) {
      applyHighlights();
    } else {
      removeHighlights();
    }
  }
});

// Run initialization
init();