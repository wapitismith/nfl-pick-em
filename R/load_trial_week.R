# =============================================================
# load_trial_week.R — replace the fake Test Week with REAL upcoming
# preseason games as week 0, for a live trial run of the whole
# system (picks, locks, live scoring, standings).
#
# nflverse does NOT carry preseason, so this pulls the next
# DAYS_AHEAD days from the ESPN scoreboard (same source and field
# layout as update_scores.R) and stores them as week 0 / 'REG' so
# the app's existing "Test Week" plumbing shows them everywhere.
#
# RESETS first: deletes existing week-0 games, which cascades away
# any picks made on them. Re-run any time to refresh kickoff times.
# =============================================================

source(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(), value = TRUE))), "helpers.R"))

season     <- as.integer(env_or("SEASON", current_season()))
days_ahead <- as.integer(env_or("DAYS_AHEAD", "8"))

from <- format(Sys.Date(), "%Y%m%d")
to   <- format(Sys.Date() + days_ahead, "%Y%m%d")
message("Trial week: loading NFL games ", from, " - ", to, " as week 0")

resp <- httr2::request("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard") |>
  httr2::req_url_query(dates = paste0(from, "-", to), limit = 100) |>
  httr2::req_perform() |>
  httr2::resp_body_json()

events <- resp$events
if (is.null(events) || length(events) == 0) {
  stop("ESPN returned no games in the next ", days_ahead, " days.")
}

abbr_fix <- c(WSH = "WAS", LAR = "LA")
fix_abbr <- function(x) ifelse(x %in% names(abbr_fix), abbr_fix[x], x)

games <- purrr::map_dfr(events, function(ev) {
  comp  <- ev$competitions[[1]]
  teams <- comp$competitors
  home  <- teams[[which(purrr::map_chr(teams, "homeAway") == "home")]]
  away  <- teams[[which(purrr::map_chr(teams, "homeAway") == "away")]]
  tibble(
    home_team = fix_abbr(home$team$abbreviation),
    away_team = fix_abbr(away$team$abbreviation),
    kickoff   = ev$date,                                   # ISO8601 UTC
    stadium   = purrr::pluck(comp, "venue", "fullName", .default = NA_character_)
  )
}) |>
  distinct(home_team, away_team, .keep_all = TRUE) |>
  transmute(
    game_id  = paste(season, "00", away_team, home_team, sep = "_"),
    season   = season,
    week     = 0L,                 # app shows week 0 as "Test Week"
    game_type = "REG",             # so all existing views/filters apply
    kickoff, home_team, away_team, stadium,
    status   = "scheduled"
  )

# Reset: wipe the old test week (cascade deletes its picks), then load.
sb_delete("games", paste0("season=eq.", season, "&week=eq.0"))
sb_upsert("games", games, on_conflict = "game_id")
message("Trial week loaded: ", nrow(games), " games")
for (i in seq_len(nrow(games))) {
  g <- games[i, ]
  message("  ", g$away_team, " @ ", g$home_team, "  ", g$kickoff, "  (", g$stadium, ")")
}
