/**
 * routes/search.js
 * POST /api/search
 * Body: { address, zip?, city?, folio?, contactId? }
 */

const { detectCounty } = require('../utils/detect-county');
const { scrapeMiamiDade } = require('../scrapers/miami-dade');
const { scrapeBroward }   = require('../scrapers/broward');
const ghl = require('../integrations/ghl');

// Parse city and zip from a full address string like:
// "100 N Andrews Ave, Fort Lauderdale, FL 33301"
// "11900 SW 97th Ave, Miami, 33176"
function parseAddressComponents(addressStr) {
  if (!addressStr) return { street: '', city: '', zip: '' };

  // Extract ZIP (5 digits at end)
  const zipMatch = addressStr.match(/\b(\d{5})(?:-\d{4})?[\s,]*$/);
  const zip = zipMatch ? zipMatch[1] : '';

  // Remove zip and state abbreviation from end
  let rest = addressStr
    .replace(/,?\s*\d{5}(-\d{4})?[\s,]*$/, '')
    .replace(/,?\s*\bFL\b[\s,]*/i, '')
    .trim();

  // Split by comma — last part is usually city
  const parts = rest.split(',').map(s => s.trim()).filter(Boolean);
  const city   = parts.length > 1 ? parts[parts.length - 1] : '';
  const street = parts[0] || rest;

  return { street, city, zip };
}

module.exports = async function search(req, res) {
  const body = req.body || {};
  let { address, city, zip, folio, contactId } = body;

  if (!address && !folio) {
    return res.status(400).json({ error: 'Se requiere address o folio.' });
  }

  // Extract city/zip from address string if not provided separately
  if (address) {
    const parsed = parseAddressComponents(address);
    if (!zip  && parsed.zip)  zip  = parsed.zip;
    if (!city && parsed.city) city = parsed.city;
    // Keep full address for scraper — it will clean it internally
  }

  console.log(`[Search] address="${address}" city="${city}" zip="${zip}"`);

  try {
    const county = detectCounty(zip, city);
    console.log(`[Search] detected county: ${county}`);

    let result;
    if (!county || county === 'miami-dade') {
      result = await scrapeMiamiDade({ address, folio });
    } else if (county === 'broward') {
      result = await scrapeBroward({ address, folio });
    } else {
      return res.status(400).json({
        error: `Condado "${county}" aun no soportado. Disponibles: Miami-Dade, Broward.`,
      });
    }

    if (contactId) {
      try {
        await ghl.pushPermitData(contactId, result);
        result.ghlPushed = true;
      } catch (ghlErr) {
        console.error('[GHL Push Error]', ghlErr.message);
        result.ghlPushed = false;
        result.ghlError  = ghlErr.message;
      }
    }

    return res.json(result);

  } catch (err) {
    console.error('[Search Error]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
