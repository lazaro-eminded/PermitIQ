const { detectCounty } = require('../utils/detect-county');
const { scrapeMiamiDade } = require('../scrapers/miami-dade');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);

module.exports = async (req, res) => {
  const { address } = req.body;

  if (!address) return res.status(400).json({ error: 'Se requiere una dirección' });

  const county = detectCounty(address);
  if (!county) return res.status(400).json({ error: 'Condado no reconocido. Por ahora se soportan: Miami-Dade, Broward, Palm Beach, Orange, Hillsborough.' });

  try {
    let result;
    if (county === 'miami-dade') result = await scrapeMiamiDade(address);
    else return res.status(400).json({ error: `Scraper para ${county} coming soon` });

    // Guardar en Supabase
    await supabase.from('searches').insert({
      address,
      county: result.county,
      roof_age: result.roofAge,
      roof_score: result.score,
      permit_data: result.permits,
      query_source: 'manual',
    });

    res.json({ success: true, data: result });

  } catch (err) {
    await supabase.from('error_logs').insert({ address, county, error_message: err.message });
    res.status(500).json({ error: err.message });
  }
};
