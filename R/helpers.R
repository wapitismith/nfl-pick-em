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

#' Send an email through Resend (https://resend.com).
#' Swap this function body for blastula/SMTP, Mailgun, Brevo, etc. if preferred.
send_email <- function(to, subject, html) {
  api_key <- Sys.getenv("RESEND_API_KEY")
  if (!nzchar(api_key)) {
    message("RESEND_API_KEY not set - printing email instead:\n",
            "To: ", paste(to, collapse = ", "), "\nSubject: ", subject)
    return(invisible(FALSE))
  }
  request("https://api.resend.com/emails") |>
    req_headers(Authorization = paste("Bearer", api_key)) |>
    req_body_json(list(
      from    = Sys.getenv("MAIL_FROM", "Pick-Em Pool <onboarding@resend.dev>"),
      to      = as.list(to),
      subject = subject,
      html    = html
    )) |>
    req_perform()
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
