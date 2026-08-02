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
