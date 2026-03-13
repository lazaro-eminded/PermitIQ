/**
 * routes/search.js
 * POST /api/search
 *
 * Body: { address, city?, state?, zip?, folio?, contactId? }
 *
 * Returns: { property, permits, roofScore, summary }
 * Optionally pushes to GHL if contactId provided.
 */

const { detectCounty }   = require(''../utils/detect-county'');
const { scrapeMiamiDade } = require(''../scrapers/miami-dade'');
const { scrapeBroward }   = require(''../scrapers/broward'');
const ghl                = require(''../integrations/ghl'');

module.exports = async function search(req, res) {
  const { address, city, state, zip, folio, contactId } = req.body || {};

  if (!address && !folio) {
    return res.status(400).json({ error: ''Se requiere address o folio.'' });
  }

  try {
    // â”€â”€ Detect county â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const county = detectCounty(zip, city);

    let result;
    if (!county || county === ''miami-dade'') {
      result = await scrapeMiamiDade({ address, folio });
    } else if (county === ''broward'') {
      result = await scrapeBroward({ address, folio });
    } else {
      return res.status(400).json({
        error: `Condado "${county}" aÃºn no soportado. Disponibles: Miami-Dade, Broward.`,
      });
    }

    // â”€â”€ Optionally push to GHL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (contactId) {
      try {
        await ghl.pushPermitData(contactId, result);
        result.ghlPushed = true;
      } catch (ghlErr) {
        console.error(''[GHL Push Error]'', ghlErr.message);
        result.ghlPushed = false;
        result.ghlError  = ghlErr.message;
      }
    }

    return res.json(result);

  } catch (err) {
    console.error(''[Search Error]'', err.message);
    return res.status(500).json({ error: err.message });
  }
};

