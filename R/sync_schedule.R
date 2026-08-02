# =============================================================
# sync_schedule.R — upsert the season schedule from nflverse.
# Run weekly (Tuesdays) + manually at season start. Kickoff times
# occasionally move (flex scheduling), so re-running keeps locks correct.
# =============================================================

source(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(), value = TRUE))), "helpers.R"))
suppressPackageStartupMessages(library(nflreadr))

season <- as.integer(env_or("SEASON", current_season()))
stopifnot(!is.na(season))
message("Syncing schedule for season ", season)

sched <- load_schedules(season) |>
  as_tibble() |>
  filter(game_type %in% c("REG", "WC", "DIV", "CON", "SB"))

games <- sched |>
  transmute(
    game_id,
    season,
    week,
    game_type,
    # nflverse gives gameday (date) + gametime (ET clock)
    kickoff = format(
      as.POSIXct(paste(gameday, gametime), tz = "America/New_York"),
      "%Y-%m-%dT%H:%M:%S%z"
    ),
    home_team,
    away_team,
    home_score = as.integer(home_score),
    away_score = as.integer(away_score),
    status = ifelse(!is.na(home_score) & !is.na(away_score), "final", "scheduled"),
    winner = case_when(
      is.na(home_score) | is.na(away_score) ~ NA_character_,
      home_score > away_score ~ home_team,
      away_score > home_score ~ away_team,
      TRUE ~ "TIE"
    )
  )

sb_upsert("games", games, on_conflict = "game_id")
message("Upserted ", nrow(games), " games.")
