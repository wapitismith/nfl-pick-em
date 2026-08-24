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
# email + partner_email (two-person entries). Falls back gracefully if
# partner_email.sql hasn't been run yet.
players <- tryCatch(
  sb_select("profiles", list(select = "email,partner_email",
                             email = "not.is.null", active = "is.true")),
  error = function(e)
    sb_select("profiles", list(select = "email", email = "not.is.null",
                               active = "is.true")) |>
      mutate(partner_email = NA_character_)
)

if (nrow(weekly) == 0) { message("No picks to recap."); quit(save = "no") }

# Apply the MNF tiebreaker (closest combined-score guess) to weekly ties
tb <- sb_select("weekly_tiebreaks", list(
  select = "user_id,tiebreak_diff",
  season = paste0("eq.", season), week = paste0("eq.", week)
))
if (nrow(tb) > 0) {
  weekly <- weekly |>
    left_join(tb, by = "user_id") |>
    arrange(desc(confidence_points), desc(wins), tiebreak_diff)
}

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

# ---- The famous raw pick grid: every player, every game, pick + confidence.
# Week is final, so nothing here is secret anymore.
pr <- sb_select("pick_results", list(
  select = "user_id,display_name,game_id,picked_team,confidence,correct",
  season = paste0("eq.", season), week = paste0("eq.", week)
))
gk <- sb_select("games", list(
  select = "game_id,away_team,home_team",
  season = paste0("eq.", season), week = paste0("eq.", week),
  order = "kickoff.asc"
))
grid_html <- ""
if (nrow(pr) > 0 && nrow(gk) > 0) {
  cell <- function(uid, gid) {
    r <- pr[pr$user_id == uid & pr$game_id == gid, ]
    if (nrow(r) == 0) return("<td style='color:#aaa'>&mdash;</td>")
    bg <- if (isTRUE(r$correct[1])) "#e5f5ea" else
          if (isFALSE(r$correct[1])) "#fdecec" else "#fff"
    sprintf("<td style='background:%s'>%s&nbsp;<small>%s</small></td>",
            bg, r$picked_team[1],
            ifelse(is.na(r$confidence[1]), "", r$confidence[1]))
  }
  names_sorted <- pr |> distinct(user_id, display_name) |> arrange(display_name)
  hdr <- paste0("<th>", gk$away_team, "<br>@", gk$home_team, "</th>", collapse = "")
  rows <- vapply(seq_len(nrow(names_sorted)), function(i) {
    u <- names_sorted[i, ]
    paste0("<tr><td><b>", u$display_name, "</b></td>",
           paste0(vapply(gk$game_id, function(g) cell(u$user_id, g), ""), collapse = ""),
           "</tr>")
  }, "")
  grid_html <- sprintf(
    "<h3>The full pick grid</h3>
     <table border='1' cellpadding='4' cellspacing='0'
            style='border-collapse:collapse;font-size:12px'>
     <tr><th>Player</th>%s</tr>%s</table>
     <p style='color:#888;font-size:11px'>Green = got it, red = didn't.
     Small number = confidence points.</p>",
    hdr, paste0(rows, collapse = "\n"))
}

champ <- weekly[1, ]
html <- sprintf(
  "<h2>Week %d Recap</h2>
   <p>&#127942; <b>%s</b> takes the week with %d confidence points (%d-%d straight up).</p>
   <h3>Week %d results</h3>%s
   <h3>Season standings</h3>%s
   %s
   <p style='color:#888'>Automated recap &mdash; NFL Pick-Em Pool &middot;
   more stats on the <a href='https://wapitismith.com/pickem/'>Stats tab</a></p>",
  week, champ$display_name, champ$confidence_points, champ$wins,
  champ$graded - champ$wins, week,
  tbl(weekly,   c("display_name", "wins", "confidence_points"),
      c("Player", "Wins", "Conf Pts")),
  tbl(seasonal, c("display_name", "wins", "confidence_points"),
      c("Player", "Wins", "Conf Pts")),
  grid_html
)

recipients <- c(players$email, players$partner_email)
send_email(
  to = recipients,   # send_email() dedupes and drops NA/blank
  subject = sprintf("Pick-Em Week %d results: %s wins the week", week, champ$display_name),
  html = html
)
message("Recap sent to ", nrow(players), " players.")
