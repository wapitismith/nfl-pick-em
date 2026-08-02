# =============================================================
# send_welcome.R — one-shot welcome email to the pool.
#
# Reads recipients from docs/2025_email_list.csv (any line containing
# an @), sends each person an individual email from pool@wapitismith.com
# via the cPanel SMTP server, with the welcome letter attached.
#
# Env vars:
#   SMTP_PASSWORD  (required) password for pool@wapitismith.com
#   TEST_TO        (optional) send ONE email to this address instead
#   SMTP_HOST/PORT/USER, APP_URL (optional overrides)
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

lines  <- readLines("docs/2025_email_list.csv", warn = FALSE)
emails <- unique(trimws(lines[grepl("@", lines, fixed = TRUE)]))

test_to <- Sys.getenv("TEST_TO")
if (nzchar(test_to)) {
  emails <- test_to
  message("TEST MODE - sending only to ", test_to)
}
message("Sending to ", length(emails), " recipient(s)")

body <- sprintf('
<div style="max-width:640px;margin:0 auto;font-family:Segoe UI,Calibri,Arial,sans-serif;color:#16202e">
  <p style="text-align:center"><img src="web/public/logo-192.png" width="140" alt="Guffey Pick%%27Em NFL Pool"></p>
  <h2 style="text-align:center;color:#0b2545;margin:6px 0">GUFFEY PICK&#8217;EM &mdash; 2026 SEASON</h2>
  <p style="text-align:center"><a href="%s" style="color:#1b7a3d;font-weight:bold">wapitismith.com/pickem</a></p>

  <p>Welcome back, football fans!</p>
  <p>The pool is getting an upgrade this season. No more emailing picks &mdash; everything
  now runs on our own website. Pick from your phone, watch standings update live during
  the games, and see exactly where the money stands all season.</p>

  <h3 style="color:#0b2545">Getting started</h3>
  <ul>
    <li>Go to <a href="%s"><b>wapitismith.com/pickem</b></a>, enter your email &mdash; we send you a sign-in link. No password.</li>
    <li><b>Bookmark the page you land on</b> &mdash; that&#8217;s your one-tap door back in.</li>
    <li>Your account is your email address: it works across all your devices, and losing the bookmark loses nothing.</li>
  </ul>

  <h3 style="color:#0b2545">The short version of the rules</h3>
  <ul>
    <li>Pick a winner for every game, and rank your picks with confidence points (16 = most confident).</li>
    <li>Each game locks at kickoff; picks are secret until then. You can pick future weeks any time.</li>
    <li><b>Tiebreaker:</b> on the week&#8217;s final Monday Night game, predict the combined final score.</li>
    <li><b>Money:</b> $5 per week you play. Half the weekly pot goes to the week&#8217;s winner; the other half
    builds the season pot for the overall champ. Pay right in the app with the Venmo button (prepay welcome!).</li>
  </ul>

  <p>The attached letter has the full rules &mdash; give it a read before Week 1.</p>

  <p><b>One more thing:</b> if anyone would like to volunteer to help with the admin side
  of the pool, just let me know &mdash; reply to this email.</p>

  <p>Good luck this season!</p>
  <p><b>Mike</b><br><span style="color:#6b7280">Commissioner &middot; Guffey Pick&#8217;Em NFL Pool</span></p>
</div>', app_url, app_url)

smtp <- server(host = smtp_host, port = smtp_port,
               username = smtp_user, password = smtp_pass)

sent <- 0
for (to in emails) {
  msg <- envelope(
    from = "Guffey Pick'Em <pool@wapitismith.com>",
    to = to,
    subject = "You're invited: Guffey Pick'Em 2026 - new website, same trash talk"
  ) |>
    emayili::html(body) |>
    attachment(letter)
  tryCatch({
    smtp(msg)
    sent <- sent + 1
    message("sent: ", to)
  }, error = function(e) message("FAILED: ", to, " - ", conditionMessage(e)))
  Sys.sleep(2)  # be gentle with the mail server
}
message(sent, " of ", length(emails), " emails sent.")
