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
