# =============================================================
# send_reminders.R — email participants who haven't finished picks
# for games kicking off within the next LOOKAHEAD_HOURS.
# Scheduled before Thu night, Sunday morning, etc.
# =============================================================

source(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(), value = TRUE))), "helpers.R"))

lookahead_hours <- as.numeric(env_or("LOOKAHEAD_HOURS", "10"))
season <- as.integer(env_or("SEASON", current_season()))
week   <- as.integer(env_or("WEEK", current_week(season)))

missing <- sb_select("missing_picks", list(
  select = "*",
  season = paste0("eq.", season),
  week   = paste0("eq.", week)
))

if (nrow(missing) == 0) { message("Everyone is picked in. No reminders."); quit(save = "no") }

# Only nag people whose unpicked games start soon
missing <- missing |>
  mutate(next_kickoff = as.POSIXct(next_kickoff, format = "%Y-%m-%dT%H:%M:%S", tz = "UTC")) |>
  filter(next_kickoff <= Sys.time() + lookahead_hours * 3600)

app_url <- Sys.getenv("APP_URL", "https://your-pool.netlify.app")

for (i in seq_len(nrow(missing))) {
  m <- missing[i, ]
  if (is.na(m$email) || !nzchar(m$email)) next
  lock_local <- format(m$next_kickoff, "%a %I:%M %p %Z", tz = Sys.getenv("POOL_TZ", "America/Denver"))
  send_email(
    to = m$email,
    subject = sprintf("Pick-Em reminder: %d game%s still unpicked for Week %d",
                      m$games_unpicked, ifelse(m$games_unpicked == 1, "", "s"), week),
    html = sprintf(
      "<p>Hey %s,</p>
       <p>You still have <b>%d game%s</b> without a pick (or missing a confidence
       number) for Week %d. The next one locks at <b>%s</b>.</p>
       <p><a href='%s'>Make your picks now &rarr;</a></p>",
      m$display_name, m$games_unpicked,
      ifelse(m$games_unpicked == 1, "", "s"), week, lock_local, app_url
    )
  )
  message("Reminded ", m$display_name)
}
