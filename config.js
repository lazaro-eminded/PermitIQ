require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,

  ROOF_SCORE: {
    CRITICAL_YEARS: 20,
    WARM_YEARS: 10,
  },

  PORTALS: {
    'miami-dade':   'https://www.miamidade.gov/Apps/RER',
    'broward':      'https://eservices.broward.org',
    'palm-beach':   'https://epermits.pbcgov.org',
    'orange':       'https://orangebi.orangecountyfl.net',
    'hillsborough': 'https://hcpafl.org',
  },

  PA_PORTALS: {
    'miami-dade':   'https://www.miamidade.gov/pa',
    'broward':      'https://bcpa.net',
    'palm-beach':   'https://pbcgov.org/papa',
    'orange':       'https://ocpafl.org',
    'hillsborough': 'https://hcpafl.org',
  },

  CAPTCHA_API_KEY: process.env.CAPTCHA_API_KEY,
  CAPTCHA_TIMEOUT: 120000,

  GHL_API_KEY:     process.env.GHL_API_KEY,
  GHL_LOCATION_ID: process.env.GHL_LOCATION_ID,
  GHL_BASE_URL:    'https://services.leadconnectorhq.com',

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,

  RENDER_URL:         process.env.RENDER_URL,
  KEEPALIVE_INTERVAL: 14 * 60 * 1000,

  GOOGLE_MAPS_KEY: process.env.GOOGLE_MAPS_KEY,

  NEIGHBORS: {
    RADIUS_MILES:   0.2,
    YEAR_TOLERANCE: 3,
    MAX_RESULTS:    15,
  },
};
