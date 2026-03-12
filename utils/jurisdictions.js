const JURISDICTIONS = {
  'City of Miami': {
    name:    'City of Miami',
    scraper: 'city-of-miami',
  },
};

function getJurisdiction(municipality) {
  if (!municipality) return null;
  if (JURISDICTIONS[municipality]) return JURISDICTIONS[municipality];
  for (const [key, val] of Object.entries(JURISDICTIONS)) {
    if (municipality.includes(key) || key.includes(municipality)) return val;
  }
  return null;
}

module.exports = { JURISDICTIONS, getJurisdiction };
