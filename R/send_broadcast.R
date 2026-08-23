# =============================================================
# send_broadcast.R — send queued admin broadcasts (broadcasts table,
# sent_at is null) to every active player + partner email, from
# pool@wapitismith.com, then stamp sent_at. Safe to run any time:
# nothing queued -> exits quietly; each broadcast is stamped only
# after its send loop finishes, so a re-run never double-sends
# completed ones.
# =============================================================

source(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(), value = TRUE))), "helpers.R"))

pending <- sb_select("broadcasts", list(
  select = "id,subject,body",
  sent_at = "is.null",
  order = "created_at.asc"
))
if (nrow(pending) == 0) { message("No queued broadcasts."); quit(save = "no") }

# Active players; partner_email included when the column exists.
players <- tryCatch(
  sb_select("profiles", list(select = "email,partner_email",
                             email = "not.is.null", active = "is.true")),
  error = function(e)
    sb_select("profiles", list(select = "email", email = "not.is.null",
                               active = "is.true")) |>
      mutate(partner_email = NA_character_)
)
recipients <- c(players$email, players$partner_email)

html_escape <- function(x) {
  x <- gsub("&", "&amp;", x, fixed = TRUE)
  x <- gsub("<", "&lt;", x, fixed = TRUE)
  gsub(">", "&gt;", x, fixed = TRUE)
}

for (i in seq_len(nrow(pending))) {
  b <- pending[i, ]
  # Plain text -> simple HTML: blank line = paragraph, newline = <br>
  body <- html_escape(b$body)
  body <- gsub("\r\n", "\n", body, fixed = TRUE)
  body <- paste0("<p>", gsub("\n{2,}", "</p><p>", body), "</p>")
  body <- gsub("\n", "<br>", body, fixed = TRUE)
  html <- paste0(body,
    "<p style='color:#888;font-size:0.85em'>&mdash; Guffey Pick'Em ",
    "&middot; <a href='https://wapitismith.com/pickem/'>wapitismith.com/pickem</a></p>")

  send_email(to = recipients, subject = b$subject, html = html)
  sb_patch("broadcasts", paste0("id=eq.", b$id),
           list(sent_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")))
  message("Broadcast ", b$id, " ('", b$subject, "') sent.")
}
