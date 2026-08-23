# =============================================================
# reset_trial.R — season-start cleanup: delete ALL week-0 games
# (test week / preseason trial). Picks on them cascade away, so
# every standings view snaps back to zero. Real regular-season
# picks and the payments ledger are NOT touched.
# Scheduled for Sept 1; harmless to run any time (idempotent).
# =============================================================

source(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(), value = TRUE))), "helpers.R"))

season <- as.integer(env_or("SEASON", current_season()))

before <- sb_select("games", list(select = "game_id",
                                  season = paste0("eq.", season),
                                  week = "eq.0"))
if (nrow(before) == 0) {
  message("No week-0 games — already clean.")
} else {
  sb_delete("games", paste0("season=eq.", season, "&week=eq.0"))
  message("Removed ", nrow(before),
          " trial-week games (and everyone's picks on them). ",
          "Standings are reset for the season.")
}
