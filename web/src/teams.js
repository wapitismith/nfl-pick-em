// Team mascot names keyed by nflverse abbreviation.
export const TEAM_NAMES = {
  ARI: 'Cardinals',
  ATL: 'Falcons',
  BAL: 'Ravens',
  BUF: 'Bills',
  CAR: 'Panthers',
  CHI: 'Bears',
  CIN: 'Bengals',
  CLE: 'Browns',
  DAL: 'Cowboys',
  DEN: 'Broncos',
  DET: 'Lions',
  GB: 'Packers',
  HOU: 'Texans',
  IND: 'Colts',
  JAX: 'Jaguars',
  KC: 'Chiefs',
  LA: 'Rams',
  LAC: 'Chargers',
  LV: 'Raiders',
  MIA: 'Dolphins',
  MIN: 'Vikings',
  NE: 'Patriots',
  NO: 'Saints',
  NYG: 'Giants',
  NYJ: 'Jets',
  PHI: 'Eagles',
  PIT: 'Steelers',
  SEA: 'Seahawks',
  SF: '49ers',
  TB: 'Buccaneers',
  TEN: 'Titans',
  WAS: 'Commanders',
}

// "Broncos (DEN)" — falls back to just the abbreviation if unknown.
export const teamLabel = abbr =>
  TEAM_NAMES[abbr] ? `${TEAM_NAMES[abbr]} (${abbr})` : abbr

// ESPN CDN abbreviations that differ from nflverse
const ESPN_ABBR = { LA: 'lar', WAS: 'wsh' }

// Fallback team graphic: ESPN's team logo CDN.
export const espnLogo = abbr =>
  `https://a.espncdn.com/i/teamlogos/nfl/500/${(ESPN_ABBR[abbr] ?? abbr).toLowerCase()}.png`

// Preferred graphic: a self-hosted helmet image, if one exists.
// Drop PNGs into web/public/helmets/ named DEN.png, KC.png, ... and
// they automatically replace the ESPN logo, team by team.
export const helmetSrc = abbr => `${import.meta.env.BASE_URL}helmets/${abbr}.png`
