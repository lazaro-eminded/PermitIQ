/**
 * jurisdictions.js
 * Maps Miami-Dade municipality names (from PA API) to their permit scraper.
 * scraper values: 'city-of-miami' | 'county' (default ArcGIS 3-year fallback)
 */

const JURISDICTIONS = {
  // ── Has dedicated scraper ────────────────────────────────────────────────
  'City of Miami':    { name: 'City of Miami',    scraper: 'city-of-miami' },
  'Miami':            { name: 'City of Miami',    scraper: 'city-of-miami' },

  // ── Falls back to county ArcGIS (3-year rolling window) ─────────────────
  'Unincorporated County': { name: 'Unincorporated County', scraper: 'county' },
  'Unincorporated Miami-Dade': { name: 'Unincorporated County', scraper: 'county' },

  'City of Miami Beach':    { name: 'Miami Beach',    scraper: 'county' },
  'Miami Beach':            { name: 'Miami Beach',    scraper: 'county' },

  'City of Hialeah':        { name: 'Hialeah',        scraper: 'county' },
  'Hialeah':                { name: 'Hialeah',        scraper: 'county' },

  'City of Coral Gables':   { name: 'Coral Gables',   scraper: 'county' },
  'Coral Gables':           { name: 'Coral Gables',   scraper: 'county' },

  'City of Homestead':      { name: 'Homestead',      scraper: 'county' },
  'Homestead':              { name: 'Homestead',      scraper: 'county' },

  'City of North Miami':    { name: 'North Miami',    scraper: 'county' },
  'North Miami':            { name: 'North Miami',    scraper: 'county' },

  'City of North Miami Beach': { name: 'North Miami Beach', scraper: 'county' },
  'North Miami Beach':         { name: 'North Miami Beach', scraper: 'county' },

  'City of Miami Gardens':  { name: 'Miami Gardens',  scraper: 'county' },
  'Miami Gardens':          { name: 'Miami Gardens',  scraper: 'county' },

  'City of Miami Springs':  { name: 'Miami Springs',  scraper: 'county' },
  'Miami Springs':          { name: 'Miami Springs',  scraper: 'county' },

  'City of Miami Shores':   { name: 'Miami Shores',   scraper: 'county' },
  'Miami Shores':           { name: 'Miami Shores',   scraper: 'county' },

  'City of Miami Lakes':    { name: 'Miami Lakes',    scraper: 'county' },
  'Miami Lakes':            { name: 'Miami Lakes',    scraper: 'county' },

  'City of Doral':          { name: 'Doral',          scraper: 'county' },
  'Doral':                  { name: 'Doral',          scraper: 'county' },

  'City of Aventura':       { name: 'Aventura',       scraper: 'county' },
  'Aventura':               { name: 'Aventura',       scraper: 'county' },

  'City of Sunny Isles Beach': { name: 'Sunny Isles Beach', scraper: 'county' },
  'Sunny Isles Beach':         { name: 'Sunny Isles Beach', scraper: 'county' },

  'City of South Miami':    { name: 'South Miami',    scraper: 'county' },
  'South Miami':            { name: 'South Miami',    scraper: 'county' },

  'City of West Miami':     { name: 'West Miami',     scraper: 'county' },
  'West Miami':             { name: 'West Miami',     scraper: 'county' },

  'City of Sweetwater':     { name: 'Sweetwater',     scraper: 'county' },
  'Sweetwater':             { name: 'Sweetwater',     scraper: 'county' },

  'City of Surfside':       { name: 'Surfside',       scraper: 'county' },
  'Surfside':               { name: 'Surfside',       scraper: 'county' },

  'City of Bal Harbour':    { name: 'Bal Harbour',    scraper: 'county' },
  'Bal Harbour':            { name: 'Bal Harbour',    scraper: 'county' },

  'Town of Miami Lakes':    { name: 'Miami Lakes',    scraper: 'county' },
  'Village of Miami Shores':{ name: 'Miami Shores',   scraper: 'county' },
  'Village of Pinecrest':   { name: 'Pinecrest',      scraper: 'county' },
  'Pinecrest':              { name: 'Pinecrest',      scraper: 'county' },

  'Village of Palmetto Bay':{ name: 'Palmetto Bay',   scraper: 'county' },
  'Palmetto Bay':           { name: 'Palmetto Bay',   scraper: 'county' },

  'Town of Cutler Bay':     { name: 'Cutler Bay',     scraper: 'county' },
  'Cutler Bay':             { name: 'Cutler Bay',     scraper: 'county' },

  'City of Florida City':   { name: 'Florida City',   scraper: 'county' },
  'Florida City':           { name: 'Florida City',   scraper: 'county' },

  'Village of Key Biscayne':{ name: 'Key Biscayne',   scraper: 'county' },
  'Key Biscayne':           { name: 'Key Biscayne',   scraper: 'county' },

  'City of Opa-locka':      { name: 'Opa-locka',      scraper: 'county' },
  'Opa-locka':              { name: 'Opa-locka',      scraper: 'county' },
  'Opa Locka':              { name: 'Opa-locka',      scraper: 'county' },

  'City of Medley':         { name: 'Medley',         scraper: 'county' },
  'Medley':                 { name: 'Medley',         scraper: 'county' },

  'Town of Bay Harbor Islands': { name: 'Bay Harbor Islands', scraper: 'county' },
  'Bay Harbor Islands':         { name: 'Bay Harbor Islands', scraper: 'county' },

  'Town of Surfside':        { name: 'Surfside',      scraper: 'county' },
};

/**
 * resolve(municipality)
 * Returns the jurisdiction entry or a default 'county' fallback.
 */
function resolve(municipality) {
  if (!municipality) return { name: 'Unknown', scraper: 'county' };
  const entry = JURISDICTIONS[municipality];
  if (entry) return entry;
  // Fuzzy fallback — strip "City of / Town of / Village of" prefix
  const stripped = municipality
    .replace(/^(City|Town|Village|Municipality) of /i, '')
    .trim();
  return JURISDICTIONS[stripped] || { name: municipality, scraper: 'county' };
}

module.exports = { resolve, JURISDICTIONS };
