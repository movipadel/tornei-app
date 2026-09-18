# PF-08B2C7 — Safe notification testing

## Method and transport mode

The application ran locally with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` explicitly absent from the process. No real Telegram endpoint or test channel was contacted. The existing transport handled this as `{ok:false, skipped:true}` and emitted the local diagnostic `Telegram env missing`.

This is the safest supported mode currently present in the repository: there is no injectable Telegram fake transport and no preconfigured non-production channel. Structural contract tests supplemented the runtime observation.

## Results

| Case | Expected | Actual | Result |
|---|---|---|---|
| Newly committed smart redemption | One scheduling/transport attempt | Six distinct successful new redemptions produced exactly six local skipped-transport diagnostics | PASS |
| Same idempotency replay | Zero additional attempts | Grigio same-key replay returned replayed and produced no additional Telegram diagnostic | PASS |
| RPC/input failure | Zero attempts | Missing variant, invalid variant, insufficient points, and insufficient Store stock produced no Telegram diagnostic | PASS |
| Transport unavailable | Redemption remains committed | Each diagnostic occurred after a successful API/DB commit; all rows and fulfillment state remained present | PASS |
| Production Telegram isolation | No real message | No Telegram variables were present and no real message was sent | PASS |

Successful new smart cases in the log were SERVICE, Grigio, Lime, Tubo, the single-identity auto-resolution case, and the finite last-unit case. The count therefore matches the six expected new operations. The replay and four controlled failures generated no extra event.

The PF-08B2C5 Node contract additionally passed `shouldScheduleStaffNotification`: only `created=true`, `replayed=false`, `should_notify_staff=true` with notification context schedules. Message-copy assertions confirm SERVICE states that no Store handling is required and all messages direct staff to **Richieste premio**.

## Failure isolation

The local unavailable transport did not throw, but it did prove that a non-delivering transport cannot reverse the already committed redemption. Static inspection confirms the PF-07 post-commit wrapper catches provider exceptions inside `after()` and never feeds them back into the redemption response. Thus runtime unavailable-transport isolation plus structural thrown-error isolation are both covered without contacting Telegram.

## Limitations

- No actual message rendering/delivery was validated in a Telegram client.
- There is no repository-supported injectable transport that counts calls independently of logs.
- An approved non-production bot/channel smoke test remains advisable during controlled cutover review, but it is not safe to manufacture or configure one in this task.