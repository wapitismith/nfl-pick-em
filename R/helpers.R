# =============================================================
# Shared helpers: Supabase REST + email
# Expects env vars (set as GitHub Actions secrets):
#   SUPABASE_URL          e.g. https://abcd1234.supabase.co
#   SUPABASE_SERVICE_KEY  service-role key (bypasses RLS; server-side only!)
#   RESEND_API_KEY        for email (reminders/recap)
#   MAIL_FROM             e.g. "Pick-Em Pool <pool@yourdomain.com>"
# =============================================================

suppressPackageStartupMessages({
  library(httr2)
  library(dplyr)
})

#' Read an env var, treating "" (set-but-blank, e.g. an empty workflow
#' input) the same as unset — falls back to `default`.
env_or <- function(var, default) {
  v <- Sys.getenv(var)
  if (nzchar(v)) v else default
}

sb_url <- function() Sys.getenv("SUPABASE_URL")
sb_key <- function() Sys.getenv("SUPABASE_SERVICE_KEY")

sb_req <- function(path) {
  request(paste0(sb_url(), "/rest/v1/", path)) |>
    req_headers(
      apikey        = sb_key(),
      Authorization = paste("Bearer", sb_key())
    )
}

#' Read rows from a table/view. `query` is a named list of PostgREST filters,
#' e.g. list(season = "eq.2026", week = "eq.5", select = "*")
sb_select <- function(table, query = list(select = "*")) {
  resp <- sb_req(table) |>
    req_url_query(!!!query) |>
    req_perform()
  out <- resp_body_json(resp, simplifyVector = TRUE)
  if (length(out) == 0) tibble() else as_tibble(out)
}

#' Upsert a data.frame into a table (on conflict with the PK / unique cols).
sb_upsert <- function(table, df, on_conflict = NULL) {
  if (nrow(df) == 0) return(invisible(NULL))
  req <- sb_req(table) |>
    req_headers(
      `Content-Type` = "application/json",
      Prefer = "resolution=merge-duplicates,return=minimal"
    )
  if (!is.null(on_conflict)) {
    req <- req |> req_url_query(on_conflict = on_conflict)
  }
  req |>
    req_body_raw(jsonlite::toJSON(df, na = "null", auto_unbox = FALSE)) |>
    req_method("POST") |>
    req_perform()
  invisible(NULL)
}

#' Delete rows matching a PostgREST filter string, e.g.
#' sb_delete("games", "season=eq.2026&week=eq.0")
sb_delete <- function(table, filter) {
  sb_req(paste0(table, "?", filter)) |>
    req_headers(Prefer = "return=minimal") |>
    req_method("DELETE") |>
    req_perform()
  invisible(NULL)
}

#' Update rows matching a PostgREST filter string, e.g.
#' sb_patch("profiles", "id=eq.abc", list(welcomed_at = "2026-08-02T12:00:00Z"))
sb_patch <- function(table, filter, values) {
  sb_req(paste0(table, "?", filter)) |>
    req_headers(`Content-Type` = "application/json", Prefer = "return=minimal") |>
    req_body_raw(jsonlite::toJSON(values, auto_unbox = TRUE, na = "null")) |>
    req_method("PATCH") |>
    req_perform()
  invisible(NULL)
}

#' Send a rendered emayili envelope via the command-line curl binary.
#' One fresh curl PROCESS per email — works around a libcurl-in-R bug
#' where a second in-process SMTP send segfaults. Credentials are
#' passed on stdin (not the command line).
smtp_send_curl <- function(msg, to, host, port, user, pass,
                           from = "pool@wapitismith.com") {
  txt <- as.character(msg, encode = TRUE)
  txt <- gsub("(?<!\r)\n", "\r\n", txt, perl = TRUE)  # SMTP wants CRLF
  eml <- tempfile(fileext = ".eml")
  on.exit(unlink(eml), add = TRUE)
  writeBin(charToRaw(txt), eml)
  # trimws: a stray newline in a pasted secret breaks auth invisibly.
  # shQuote: pass creds as one safely-quoted argument (the curl-config
  # quoting used previously mangles special characters -> Login denied).
  cred <- paste0(trimws(user), ":", trimws(pass))
  out <- suppressWarnings(system2(
    "curl",
    c("-sS", "--ssl-reqd",
      sprintf("smtps://%s:%d", host, port),
      "--mail-from", shQuote(from),
      "--mail-rcpt", shQuote(to),
      "--upload-file", shQuote(eml),
      "--user", shQuote(cred)),
    stdout = TRUE, stderr = TRUE
  ))
  code <- attr(out, "status")
  if (!is.null(code) && code != 0) {
    stop("curl exit ", code, ": ", paste(out, collapse = " "))
  }
  invisible(TRUE)
}

#' Send an email (one per recipient) from pool@wapitismith.com via the
#' cPanel SMTP server, using smtp_send_curl above. Needs SMTP_PASSWORD;
#' without it, prints what it would have sent (safe dry-run).
send_email <- function(to, subject, html) {
  to <- unique(to[!is.na(to) & nzchar(trimws(to))])
  if (length(to) == 0) return(invisible(FALSE))
  pass <- Sys.getenv("SMTP_PASSWORD")
  if (!nzchar(pass)) {
    message("SMTP_PASSWORD not set - would send to: ",
            paste(to, collapse = ", "), " | ", subject)
    return(invisible(FALSE))
  }
  if (!requireNamespace("emayili", quietly = TRUE)) stop("emayili not installed")
  host <- env_or("SMTP_HOST", "mail.wapitismith.com")
  port <- as.integer(env_or("SMTP_PORT", "465"))
  user <- env_or("SMTP_USER", "pool@wapitismith.com")
  for (t in to) {
    msg <- emayili::envelope(
      from = "Guffey Pick'Em <pool@wapitismith.com>",
      to = t, subject = subject
    ) |> emayili::html(html)
    smtp_send_curl(msg, t, host, port, user, pass)
    Sys.sleep(1)
  }
  invisible(TRUE)
}

#' Current NFL week: earliest week with any un-final game (falls back to max).
current_week <- function(season) {
  games <- sb_select("games", list(
    select = "week,status",
    season = paste0("eq.", season),
    game_type = "eq.REG"
  ))
  if (nrow(games) == 0) return(1L)
  open_weeks <- games |> filter(status != "final") |> pull(week)
  if (length(open_weeks) == 0) max(games$week) else min(open_weeks)
}

#' Season for "now": March-or-later belongs to that calendar year's season.
current_season <- function() {
  now <- Sys.time() |> as.POSIXlt(tz = "America/New_York")
  ifelse(now$mon + 1 >= 3, now$year + 1900, now$year + 1899)
}
