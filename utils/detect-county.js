/**
 * detect-county.js
 * Detects Florida county from ZIP code and/or city name.
 */

const MIAMI_DADE_ZIPS = new Set([
  33010,33011,33012,33013,33014,33015,33016,33017,33018,
  33030,33031,33032,33033,33034,33035,33039,
  33054,33055,33056,
  33101,33102,33109,33111,33112,33114,33116,33119,33121,33122,33124,33125,
  33126,33127,33128,33129,33130,33131,33132,33133,33134,33135,33136,33137,
  33138,33139,33140,33141,33142,33143,33144,33145,33146,33147,33148,33149,
  33150,33151,33152,33153,33154,33155,33156,33157,33158,33160,33161,33162,
  33165,33166,33167,33168,33169,33170,33172,33173,33174,33175,33176,33177,
  33178,33179,33180,33181,33182,33183,33184,33185,33186,33187,33189,33190,
  33193,33194,33196,33199,33231,33233,33238,33242,33243,33256,33257,33261,
  33265,33266,33269,33280,33283,33296,33299,
]);

const BROWARD_ZIPS = new Set([
  33004,33009,
  33019,33020,33021,33022,33023,33024,33025,33026,33027,33028,33029,
  33060,33061,33062,33063,33064,33065,33066,33067,33068,33069,33071,33072,
  33073,33074,33075,33076,33077,
  33301,33302,33303,33304,33305,33306,33307,33308,33309,33311,33312,
  33313,33314,33315,33316,33317,33319,33320,33321,33322,33324,33325,
  33326,33327,33328,33330,33331,33334,33351,33388,33394,
  33441,33442,
]);

const PALM_BEACH_ZIPS = new Set([
  33401,33403,33404,33405,33406,33407,33408,33409,33410,33411,33412,33413,
  33414,33415,33418,33426,33428,33430,33431,33432,33433,33434,33435,33436,
  33437,33438,33445,33446,33449,33458,33460,33461,33462,33463,33467,33469,
  33470,33476,33477,33478,33480,33483,33484,33486,33487,33496,33498,33499,
]);

const CITY_COUNTY_MAP = {
  // Miami-Dade cities
  ''miami'': ''miami-dade'', ''city of miami'': ''miami-dade'',
  ''miami beach'': ''miami-dade'', ''hialeah'': ''miami-dade'',
  ''coral gables'': ''miami-dade'', ''homestead'': ''miami-dade'',
  ''north miami'': ''miami-dade'', ''north miami beach'': ''miami-dade'',
  ''miami gardens'': ''miami-dade'', ''miami shores'': ''miami-dade'',
  ''miami lakes'': ''miami-dade'', ''doral'': ''miami-dade'',
  ''aventura'': ''miami-dade'', ''cutler bay'': ''miami-dade'',
  ''florida city'': ''miami-dade'', ''key biscayne'': ''miami-dade'',
  ''medley'': ''miami-dade'', ''miami springs'': ''miami-dade'',
  ''opa-locka'': ''miami-dade'', ''opa locka'': ''miami-dade'',
  ''palmetto bay'': ''miami-dade'', ''pinecrest'': ''miami-dade'',
  ''south miami'': ''miami-dade'', ''sunny isles beach'': ''miami-dade'',
  ''surfside'': ''miami-dade'', ''sweetwater'': ''miami-dade'',
  ''west miami'': ''miami-dade'', ''kendall'': ''miami-dade'',
  ''unincorporated county'': ''miami-dade'',
  // Broward cities
  ''fort lauderdale'': ''broward'', ''ft lauderdale'': ''broward'',
  ''hollywood'': ''broward'', ''pembroke pines'': ''broward'',
  ''miramar'': ''broward'', ''coral springs'': ''broward'',
  ''pompano beach'': ''broward'', ''davie'': ''broward'',
  ''plantation'': ''broward'', ''sunrise'': ''broward'',
  ''weston'': ''broward'', ''deerfield beach'': ''broward'',
  ''lauderhill'': ''broward'', ''margate'': ''broward'',
  ''north lauderdale'': ''broward'', ''oakland park'': ''broward'',
  ''tamarac'': ''broward'', ''hallandale beach'': ''broward'',
  ''dania beach'': ''broward'', ''cooper city'': ''broward'',
  ''coconut creek'': ''broward'', ''lighthouse point'': ''broward'',
  ''parkland'': ''broward'', ''lauderdale lakes'': ''broward'',
  // Palm Beach
  ''west palm beach'': ''palm-beach'', ''boca raton'': ''palm-beach'',
  ''boynton beach'': ''palm-beach'', ''delray beach'': ''palm-beach'',
  ''lake worth'': ''palm-beach'', ''wellington'': ''palm-beach'',
  ''palm beach gardens'': ''palm-beach'', ''jupiter'': ''palm-beach'',
};

function detectCounty(zip, city = '''') {
  const z = parseInt(zip, 10);
  if (!isNaN(z)) {
    if (MIAMI_DADE_ZIPS.has(z)) return ''miami-dade'';
    if (BROWARD_ZIPS.has(z))    return ''broward'';
    if (PALM_BEACH_ZIPS.has(z)) return ''palm-beach'';
  }
  if (city) {
    const c = city.toLowerCase().trim().replace(/^city of /, '''');
    if (CITY_COUNTY_MAP[c]) return CITY_COUNTY_MAP[c];
    if (CITY_COUNTY_MAP[`city of ${c}`]) return CITY_COUNTY_MAP[`city of ${c}`];
    for (const [key, county] of Object.entries(CITY_COUNTY_MAP)) {
      if (c.includes(key) || key.includes(c)) return county;
    }
  }
  return null;
}

module.exports = { detectCounty };

