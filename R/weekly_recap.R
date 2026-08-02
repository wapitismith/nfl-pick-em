# =============================================================
# weekly_recap.R — Tuesday-morning recap email to the whole pool:
# week winner(s), full weekly results, season standings.
# =============================================================

source(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(), value = TRUE))), "helpers.R"))

season <- as.integer(env_or("SEASON", current_season()))
# Recap the most recent COMPLETED week
games <- sb_select("games", list(select = "week,status",
                                 season = paste0("eq.", season),
                                 game_type = "eq.REG"))
done_weeks <- games |> group_by(week) |>
  summarise(done = all(status == "final"), .groups = "drop") |>
  filter(done) |> pull(week)
if (length(done_weeks) == 0) { message("No completed weeks yet."); quit(save = "no") }
week <- max(done_weeks)
message("Recapping week ", week)

weekly <- sb_select("weekly_standings", list(
  select = "*", season = paste0("eq.", season), week = paste0("eq.", week),
  order = "confidence_points.desc,wins.desc"
))
seasonal <- sb_select("season_standings", list(
  select = "*", season = paste0("eq.", season),
  order = "confidence_points.desc,wins.desc"
))
players <- sb_select("profiles", list(select = "email", email = "not.is.null"))

if (nrow(weekly) == 0) { message("No picks to recap."); quit(save = "no") }

row_html <- function(df, cols) {
  paste0(apply(df[, cols], 1, function(r)
    paste0("<tr><td>", paste(r, collapse = "</td><td>"), "</td></tr>")),
    collapse = "\n")
}
tbl <- function(df, cols, headers) sprintf(
  "<table border='1' cellpadding='6' cellspacing='0' style='border-collapse:collapse'>
   <tr><th>%s</th></tr>%s</table>",
  paste(headers, collapse = "</th><th>"), row_html(df, cols)
)

champ <- weekly[1, ]
html <- sprintf(
  "<h2>Week %d Recap</h2>
   <p>&#127942; <b>%s</b> takes the week with %d confidence points (%d-%d straight up).</p>
   <h3>Week %d results</h3>%s
   <h3>Season standings</h3>%s
   <p style='color:#888'>Automated recap &mdash; NFL Pick-Em Pool</p>",
  week, champ$display_name, champ$confidence_points, champ$wins,
  champ$graded - champ$wins, week,
  tbl(weekly,   c("display_name", "wins", "confidence_points"),
      c("Player", "Wins", "Conf Pts")),
  tbl(seasonal, c("display_name", "wins", "confidence_points"),
      c("Player", "Wins", "Conf Pts"))
)

send_email(
  to = players$email[nzchar(players$email)],
  subject = sprintf("Pick-Em Week %d results: %s wins the week", week, champ$display_name),
  html = html
)
message("Recap sent to ", nrow(players), " players.")
