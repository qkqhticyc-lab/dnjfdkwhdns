# Telegram market risk board

Telegram-only close report; no website UI or new published data files. The original bot's thresholds are undisclosed. `RULES` v1 is an explicit reconstruction from screenshots, not a validated crash forecast.

## Initial rules

| Measure | Red | Yellow | Green |
| --- | --- | --- | --- |
| VIX3M − VIX | ≤1 | >1 and ≤2 | >2 |
| VIX6M − VIX3M | ≤0 | >0 and ≤1 | >1 |
| VIX / VIX3M | ≥0.98 | ≥0.95 and <0.98 | <0.95 |
| VIX9D − VIX | ≥2 | ≥−1 and <2 | <−1 |

The screenshots constrain some boundaries (0.8 spread red; ratios 0.962/0.965 yellow and 0.983 red; 1.2 long spread green; 0/0.4 short spread yellow; 3.1 red and −4 green). Exact cutoffs and unobserved ranges remain assumptions. Green means benign for this individual measure. Blue STABLE is the overall state, not another numerical bucket on each row.

Stage priority:
- Negative VIX3M−VIX: FRACTURE; if MOVE ≥100 and daily increase ≥10%, TRIGGER.
- Otherwise ratio ≥0.95 or spread ≤1: TENSION; with SPX weakness, FRACTURE.
- SPX weakness: daily return ≤−1%, or below SMA20 with −DI > +DI.
- MOVE shock alone: TENSION. Otherwise STABLE.
- Missing same-date inputs or data older than four calendar days: WARNING; no delivery.

SKEW, VVIX, DXY and long/short curve rows are context, not additional correlated votes. SPX structure explicitly uses daily ATR/ADX/DI(14), and the mean of the last 30 weekly closes including the as-of week's known close. These settings are our choices. A snapshot's ABOVE status does not rule out near-term SPX weakness. This compares implied-volatility tenors, not VIX futures contracts.

## Run and enable

`node --test tests/telegram-risk.test.mjs`

`node scripts/telegram-risk.mjs` writes `.cache/telegram-risk/preview.txt` and `report.json`, with no Telegram call. Sources: Cboe daily CSVs, Yahoo daily ^GSPC, ^MOVE, DX-Y.NYB. Latest SPX/VIX day selects the reference; all series must match it. Daily candles are eligible after 17:30 America/New_York; DST is automatic. Late sources are retried by the independent workflow. Preview can show available values while retaining WARNING.

To activate in GitHub repository Settings → Secrets and variables → Actions:
- Secret `TELEGRAM_BOT_TOKEN`: token from @BotFather. Never paste into source, logs or chat.
- Secret `TELEGRAM_CHAT_ID`: private chat ID after starting the bot, or an authorized channel ID. Channel bot needs posting rights.
- Variable `TELEGRAM_RISK_ENABLED`: `true` only when ready to send.

Then run **Telegram market risk** manually. It otherwise runs 22:35/23:35 UTC on US weekdays, and 00:35/02:35 UTC the following day. These are retry windows, not guaranteed delivery times; scheduling and provider publication may be delayed. First version is close-only; premarket WARNING/SPY/QQQ and live state changes are not fabricated from close data.

It sends at most once per reference day/rule-version/stage. A later same-day stage change can send another report. State is persisted in an Actions artifact for 90 days, restored from the last successful run; failure to restore stops sending rather than resetting the ledger. A successful Telegram response is required before advancing the ledger. Telegram has no atomic transaction with artifact persistence: interruption after delivery but before artifact upload can duplicate a message; an ambiguous network outcome stops the job for manual checking. No automatic retry after ambiguous delivery. Do not enable multiple copies of this workflow for the same chat.

The default is preview-only. Source dates, missing inputs, rule version and explicit structure benchmark appear in each report. This initial heuristic has screenshot fixtures and data integrity tests, not historical predictive validation.

## Message format v2

Telegram HTML: bold Korean headings, a short stage-specific explanation in a blockquote, explicit reasons, three narrow monospace tables (31 columns maximum), and a beginner glossary. `parse_mode: HTML` is required; dynamic text is escaped. Colors in the legend map to Korean table statuses. The preview artifact includes an HTML approximation for layout QA; actual font rendering depends on the Telegram client. The logical formula, risk thresholds and rule version are unchanged.

Delivery keys include a message-format version. Upgrading from the original plain-text message intentionally sends the reformatted current report once, then deduplicates subsequent runs. No ledger reset or repeated force-send is used.

Format v3 places each colored signal light directly in its table row's judgment cell (e.g. `🔴 경계`), including a white light for unavailable data. The separate color legend is removed. Emoji column widths are included in narrow-table padding. Upgrading sends the corrected current report once.

## On-demand commands

`위험`, `[위험]`, `/risk`: fetch latest regular-session indicator quotes on demand. `마감`, `/close`: confirmed close report. `/help` explains commands. Latest values include every source timestamp, query time, and an explicit distinction from the closed SPX ATR/ADX/30-week structure. These are provider quotes with possible delay, not a tick feed. On weekends/off-hours they are the last supplied values. SKEW may update only daily. Same-date alignment and a conservative 30-minute quote-age check during the normal weekday session prevent stale values from producing a confirmed current stage. Holidays may consequently show WARNING until another complete reading is available. Metadata previous-close fields are not trusted for daily changes: canonical Cboe/Yahoo daily history supplies the preceding close, keeping close and latest reports consistent.

The `telegram-risk` Supabase Edge Function is authenticated by Telegram's secret header, derived from the bot token via SHA-256. It additionally accepts only the configured private chat, limits request size, caches market requests briefly, and coalesces retries per warm instance. JWT verification is disabled only for this webhook and replaced by its own secret-header verification. Responses use Telegram's webhook-reply mechanism; the server cannot verify final message delivery through that mechanism. Request cache/deduplication are best effort across cold instances, not durable once-only guarantees. Close workflow and its persistent ledger remain separate.

Activation requires copying the same `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` secrets to this project's Supabase Edge Function secrets. Then run **Configure Telegram commands** in GitHub Actions. Setup preflights the secret and chat match, sets the webhook, and adds the English command menu. Setup waits without changing the bot when Supabase secrets are absent. Never paste token values into chat. The initial command feature does not add continuous intraday monitoring or automatic intraday stage-change alerts; those require a separate scheduler/state design.

## Provider failures and last verified close

The hosted webhook encountered Yahoo HTTP 429 for every latest quote. It now stops further Yahoo requests for at least ten minutes per warm instance (respecting a longer Retry-After), with no alternate-host/proxy retry. Quote and history failures are independent; valid quotes retain their provider previous-close baseline when canonical history is unavailable. VIX and SPX can use Naver delayed quotes, showing their actual quote timestamps. The remaining unavailable intraday quotes may show official completed Cboe daily CSV values or the last verified close. A daily close never enters the live curve calculation.

When current inputs are incomplete, `/risk` clearly separates the per-indicator latest available values from the last verified close report. Its current stage remains WARNING; the dated historical stage is explicitly not the current stage. This fallback repairs the all-empty response, but does not supply a complete real-time nine-indicator feed. Complete intraday classification still requires an accessible authorized provider. Values older than four calendar days cannot be presented as a confirmed current risk stage.

The existing close workflow publishes only complete successful close reports to one durable row in `public.telegram_risk_close_cache` through the authenticated webhook. An incomplete report cannot overwrite it; the database also rejects older dates on conflict. RLS and explicit grants restrict the table/RPC to `service_role`; browser roles have no access. The Edge Function uses its built-in service key only on the server. `cache.sql` records the applied database definition. `/close` can read this saved report without repeating blocked source requests. Cache publication failure does not suppress the independent scheduled Telegram notification. The verification workflow checks the actual Edge response, its fallback quotes and saved archive before sending a test message.
