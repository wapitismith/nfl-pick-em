# =============================================================
# update_scores.R — live score updates during game windows.
# Primary source: ESPN public scoreboard JSON (in-progress scores).
# Finals are re-confirmed weekly by sync_schedule.R from nflverse.
# Standings views recompute automatically — writing scores IS scoring.
# =============================================================

source(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(), value = TRUE))), "helpers.R"))

season <- as.integer(env_or("SEASON", current_season()))
week   <- as.integer(env_or("WEEK", current_week(season)))
message("Updating scores: season ", season, ", week ", week)

# --- our games for the week ---------------------------------------------
our_games <- sb_select("games", list(
  select = "game_id,home_team,away_team,status,kickoff",
  season = paste0("eq.", season),
  week   = paste0("eq.", week)
))
if (nrow(our_games) == 0) { message("No games found."); quit(save = "no") }

# Nothing in progress and nothing recently kicked off? Bail early.
if (all(our_games$status == "final")) { message("Week already final."); quit(save = "no") }

# --- ESPN scoreboard ------------------------------------------------------
# seasontype: 1=pre, 2=regular, 3=post
# Week 0 (test/trial week, incl. preseason games) has no regular-season
# ESPN week, so query by date window instead and match on teams as usual.
req <- httr2::request("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard")
req <- if (week == 0) {
  httr2::req_url_query(req,
    dates = paste0(format(Sys.Date() - 1, "%Y%m%d"), "-",
                   format(Sys.Date() + 1, "%Y%m%d")),
    limit = 100)
} else {
  httr2::req_url_query(req, dates = season, seasontype = 2, week = week)
}
resp <- req |>
  httr2::req_perform() |>
  httr2::resp_body_json()

events <- resp$events
if (is.null(events) || length(events) == 0) { message("ESPN returned no events."); quit(save = "no") }

# ESPN team abbreviations that differ from nflverse
abbr_fix <- c(WSH = "WAS", LAR = "LA")
fix_abbr <- function(x) ifelse(x %in% names(abbr_fix), abbr_fix[x], x)

espn <- purrr::map_dfr(events, function(ev) {
  comp  <- ev$competitions[[1]]
  teams <- comp$competitors
  home  <- teams[[which(purrr::map_chr(teams, "homeAway") == "home")]]
  away  <- teams[[which(purrr::map_chr(teams, "homeAway") == "away")]]
  st    <- comp$status$type
  tibble(
    home_team  = fix_abbr(home$team$abbreviation),
    away_team  = fix_abbr(away$team$abbreviation),
    home_score = suppressWarnings(as.integer(home$score)),
    away_score = suppressWarnings(as.integer(away$score)),
    espn_state = st$state,              # pre | in | post
    completed  = isTRUE(st$completed),
    espn_event_id = ev$id
  )
})

# --- join on home/away and upsert ----------------------------------------
updates <- our_games |>
  inner_join(espn, by = c("home_team", "away_team"), suffix = c("", ".espn")) |>
  mutate(
    status = case_when(
      completed            ~ "final",
      espn_state == "in"   ~ "in_progress",
      TRUE                 ~ status       # leave scheduled games alone
    ),
    winner = case_when(
      !completed                ~ NA_character_,
      home_score > away_score   ~ home_team,
      away_score > home_score   ~ away_team,
      TRUE                      ~ "TIE"
    ),
    updated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
  ) |>
  # only push rows that are live or newly final
  filter(status %in% c("in_progress", "final")) |>
  # include all NOT NULL columns so the PostgREST upsert is valid
  mutate(season = season, week = week) |>
  select(game_id, season, week, kickoff, home_team, away_team,
         home_score, away_score, status, winner, espn_event_id, updated_at)

if (nrow(updates) == 0) { message("Nothing to update."); quit(save = "no") }

sb_upsert("games", updates, on_conflict = "game_id")
message("Updated ", nrow(updates), " games (",
        sum(updates$status == "final"), " final, ",
        sum(updates$status == "in_progress"), " live).")
