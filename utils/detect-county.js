function detectCounty(address) {
  const a = address.toLowerCase();
  if (/\b33[01]\d{2}\b/.test(a) || /miami|doral|hialeah|kendall|homestead|coral gables|miami gardens/.test(a)) return 'miami-dade';
  if (/\b330[69]\d\b/.test(a) || /fort lauderdale|hollywood|pembroke|miramar|coral springs|pompano|davie/.test(a)) return 'broward';
  if (/\b334[0-9]\d\b/.test(a) || /west palm|boca raton|delray|boynton|palm beach|lake worth/.test(a)) return 'palm-beach';
  if (/\b327[0-9]\d\b/.test(a) || /orlando|kissimmee|apopka|ocoee|winter park|sanford/.test(a)) return 'orange';
  if (/\b336[0-9]\d\b/.test(a) || /tampa|brandon|clearwater|riverview|plant city/.test(a)) return 'hillsborough';
  return null;
}

module.exports = { detectCounty };
