let airportDatabase = {};
const shortCodeIndex = new Map();
const airportRegex = /\b(K[A-Z0-9]{3}|[A-Z][0-9]{2}|[A-Z]{3})\b/g;

let highlightsApplied = false;
let globalTooltip = null; // Holds our single, root-level tooltip
let tooltipHideTimeout = null;

async function init() {
  try {
    const jsonUrl = chrome.runtime.getURL('airports.json');
    const response = await fetch(jsonUrl);
    airportDatabase = await response.json();
    buildShortCodeIndex();

    // Create the global tooltip container once data is ready
    createGlobalTooltip();

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

// Create a single tooltip at the bottom of the body, bypassing all parent container overflows
function createGlobalTooltip() {
  if (document.getElementById('sv-global-airport-tooltip')) return;

  globalTooltip = document.createElement('div');
  globalTooltip.id = 'sv-global-airport-tooltip';
  globalTooltip.className = 'sv-airport-tooltip';
  document.body.appendChild(globalTooltip);

  // Clear the hide countdown if the cursor moves inside the tooltip box
  globalTooltip.addEventListener('mouseenter', () => {
    clearTimeout(tooltipHideTimeout);
  });

  // Start the hide countdown if the cursor exits the tooltip box
  globalTooltip.addEventListener('mouseleave', () => {
    tooltipHideTimeout = setTimeout(() => {
      globalTooltip.classList.remove('sv-visible');
    }, 150); // 150ms buffer zone
  });
}

function applyHighlights() {
  if (highlightsApplied) return;
  searchAndWrapAirports(document.body);
  attachHoverListeners(); // Attach mouse events to highlights
  highlightsApplied = true;
}

function removeHighlights() {
  if (!highlightsApplied) return;

  const highlights = document.querySelectorAll('.sv-airport-highlight');
  highlights.forEach(highlight => {
    const textNode = document.createTextNode(highlight.textContent);
    highlight.parentNode.replaceChild(textNode, highlight);
  });

  if (globalTooltip) globalTooltip.classList.remove('sv-visible');
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

        // Clean inline wrapper layout (No nested HTML data anymore)
        return `<span class="sv-airport-highlight" data-airport-code="${match}">${match}</span>`;
      });
      node.parentNode.replaceChild(span, node);
    }
  } else {
    const children = Array.from(node.childNodes);
    for (let i = 0; i < children.length; i++) {
      searchAndWrapAirports(children[i]);
    }
  }
}

// Track mouse positioning dynamically
function attachHoverListeners() {
  document.body.addEventListener('mouseenter', (e) => {
    if (!e.target.classList || !e.target.classList.contains('sv-airport-highlight')) return;

    // Clear any active hide count down because we just hit a highlight element
    clearTimeout(tooltipHideTimeout);

    const highlightEl = e.target;
    const code = highlightEl.getAttribute('data-airport-code');
    const airportData = getAirportData(code);

    if (!airportData || !globalTooltip) return;

    const targetIdent = airportData.ident || code.toUpperCase();
    const name = airportData.name || "Unknown Airport";
    const location = `${airportData.municipality || ''}, ${airportData.iso_region || ''}`.replace(/^,\s*/, '');
    const elevation = airportData.elevation_ft ? `${airportData.elevation_ft} ft` : null;
    const skyvectorUrl = `https://skyvector.com/airport/${targetIdent}`;

    const wikiLink = airportData.wikipedia_link ? `<a class="sv-secondary-link" href="${airportData.wikipedia_link}" target="_blank" rel="noopener noreferrer">Wikipedia ↗</a>` : '';
    const homeLink = airportData.home_link ? `<a class="sv-secondary-link" href="${airportData.home_link}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : '';

    globalTooltip.innerHTML = `
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
    `;

    const rect = highlightEl.getBoundingClientRect();

    // Increased offset slightly to 10px to prevent the tooltip from rendering directly under the mouse tip
    let targetTop = rect.bottom + window.scrollY + 10;
    let targetLeft = rect.left + window.scrollX + (rect.width / 2);

    globalTooltip.style.top = `${targetTop}px`;
    globalTooltip.style.left = `${targetLeft}px`;

    globalTooltip.classList.add('sv-visible');
  }, true);

  document.body.addEventListener('mouseleave', (e) => {
    if (!e.target.classList || !e.target.classList.contains('sv-airport-highlight')) return;

    // Instead of hiding immediately, trigger a coordinated countdown
    tooltipHideTimeout = setTimeout(() => {
      globalTooltip.classList.remove('sv-visible');
    }, 150);
  }, true);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleHighlights") {
    if (request.enabled) {
      applyHighlights();
    } else {
      removeHighlights();
    }
  }
});

init();