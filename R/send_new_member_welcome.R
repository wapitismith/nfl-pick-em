# =============================================================
# send_new_member_welcome.R — welcome brand-new members.
#
# Finds profiles that have signed in but never been welcomed
# (welcomed_at IS NULL), emails each a "you're in!" welcome with
# the rules letter attached, then stamps welcomed_at so nobody is
# ever emailed twice. Runs every few hours via GitHub Actions;
# does nothing (cheaply) when there are no new members.
#
# Env: SMTP_PASSWORD (required); SMTP_HOST/PORT/USER, APP_URL optional.
# =============================================================

source(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(), value = TRUE))), "helpers.R"))
suppressPackageStartupMessages(library(emayili))

smtp_user <- env_or("SMTP_USER", "pool@wapitismith.com")
smtp_pass <- Sys.getenv("SMTP_PASSWORD")
if (!nzchar(smtp_pass)) stop("SMTP_PASSWORD is not set")
smtp_host <- env_or("SMTP_HOST", "mail.wapitismith.com")
smtp_port <- as.integer(env_or("SMTP_PORT", "465"))
app_url   <- env_or("APP_URL", "https://wapitismith.com/pickem/")
letter    <- "docs/Welcome_Letter.docx"

new_members <- sb_select("profiles", list(
  select = "id,display_name,email",
  welcomed_at = "is.null",
  email = "not.is.null"
))

if (nrow(new_members) == 0) {
  message("No new members to welcome.")
  quit(save = "no")
}
message(nrow(new_members), " new member(s) to welcome")

make_body <- function(name) sprintf('
<div style="max-width:640px;margin:0 auto;font-family:Segoe UI,Calibri,Arial,sans-serif;color:#16202e">
  <p style="text-align:center"><img src="web/public/logo-192.png" width="140" alt="Guffey Pick%%27Em NFL Pool"></p>
  <h2 style="text-align:center;color:#0b2545;margin:6px 0">YOU&#8217;RE IN, %s!</h2>

  <p>Your Guffey Pick&#8217;Em account is set up and ready. A quick recap of how the pool
  works &mdash; the attached letter has the full rules:</p>

  <ul>
    <li><b>Every week:</b> pick a winner for each game and rank your picks with confidence
    points (16 = most confident). Each game locks at its kickoff.</li>
    <li><b>Tiebreaker:</b> on the week&#8217;s final Monday Night game, enter your prediction
    of the combined final score &mdash; it settles weekly ties, so don&#8217;t skip it.</li>
    <li><b>Money:</b> $5 per week you play &mdash; half the weekly pot to the week&#8217;s winner,
    half to the season pot for the overall champ. The Venmo button in the app shows
    exactly what you owe (prepaying is welcome).</li>
    <li><b>Pro tip:</b> bookmark <a href="%s">the pool page</a> after signing in &mdash; and your
    account is your email address, so it works on all your devices.</li>
  </ul>

  <p>If you&#8217;d like to volunteer to help with the admin side of the pool, just let me
  know &mdash; reply to this email.</p>

  <p>Good luck this season!</p>
  <p><b>Mike</b><br><span style="color:#6b7280">Commissioner &middot; Guffey Pick&#8217;Em NFL Pool</span></p>
</div>', name, app_url)

# Fresh connection per message: curl's SMTP connection reuse can
# segfault R on the second send, so never reuse.
send_one <- function(msg) {
  smtp <- server(host = smtp_host, port = smtp_port,
                 username = smtp_user, password = smtp_pass,
                 reuse = FALSE)
  smtp(msg)
}

for (i in seq_len(nrow(new_members))) {
  m <- new_members[i, ]
  msg <- envelope(
    from = "Guffey Pick'Em <pool@wapitismith.com>",
    to = m$email,
    subject = sprintf("You're in, %s! Guffey Pick'Em 2026", m$display_name)
  ) |>
    emayili::html(make_body(m$display_name)) |>
    attachment(letter)
  ok <- tryCatch({ send_one(msg); TRUE },
                 error = function(e) { message("FAILED: ", m$email, " - ", conditionMessage(e)); FALSE })
  if (ok) {
    sb_patch("profiles", paste0("id=eq.", m$id),
             list(welcomed_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")))
    message("welcomed: ", m$email)
  }
  Sys.sleep(2)
}
