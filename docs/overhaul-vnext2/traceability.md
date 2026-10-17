# Трассировка требований, аудитов и приёмки

Статус всех новых R — target, пока не опубликованы implementation evidence records. Ниже — покрытие спецификацией, не утверждение о закрытии дефекта. A/X disposition целиком в [reconciliation](reconciliation.md); E disposition в [предыдущем cross-audit](../audits/cross-audit-2026-10-15.md).

## 1. Requirements → acceptance

| Требование | Основные сценарии |
|---|---|
| R10.1 | B01, B02, B12 |
| R10.2 | B04, B05, B17 |
| R10.3 | B06, B07, B08, B09 |
| R10.4 | B03, B22, B23, B66 |
| R10.5 | B20, B21, B22, B23, B26 |
| R10.6 | B05, B10, B11, B12, B13, B14 |
| R10.7 | B15, B16, B17, B18, B19, B57, B59 |
| R10.8 | B24, B25, B41 |
| R10.9 | B27, B28, B36 |
| R10.10 | B01–B28 (host seams и regression provenance) |
| R11.1 | B29, B30, B31, B46 |
| R11.2 | B30, B32, B50, B70 |
| R11.3 | B26, B27, B28, B36, B49, B77 |
| R11.4 | B33, B34, B35, B37, B78 |
| R11.5 | B25, B41, B72, B73 |
| R11.6 | B38, B39, B40, B79 |
| R11.7 | B41, B42, B43, B44, B45, B46, B51 |
| R11.8 | B68, B70, B71 |
| R12.1 | B47, B48, B59 |
| R12.2 | B08, B16, B31, B61, B62, B63 |
| R12.3 | B26, B48, B49, B53 |
| R12.4 | B50, B51, B52, B53, B80 |
| R12.5 | B17, B18, B57, B58, B59, B60 |
| R12.6 | B05, B11, B52, B54, B55, B56 |
| R12.7 | B72, B73, B74, B75, B76, B77, B78 |
| R12.8 | B20, B29, B31, B47, B59, B64, B65 |
| R12.9 | B47, B67, B69 |
| R13.1 | Все B: evidence format; отдельно B69 |
| R13.2 | B65, B66 |
| R13.3 | B67, B68, B69 |
| R13.4 | B70, B71, B79, B80 |
| R13.5 | B01–B80 и сохранённые A01–A87 |
| R13.6 | Wave exit records и capability gates B72–B78 |

## 2. P/N/S evidence → regression/target

| Исходное evidence | Новые проверки |
|---|---|
| P1 | B08, B31 |
| P2 | B26 |
| P3 | B02, B22 |
| P4 | B23 |
| P5 | B11 |
| P6 | B49 |
| P7 | B06 |
| P8 | B13 |
| P9 | B25 |
| P10 | B50, B51 |
| P11 | B07 |
| P12 | B14 (positive/counterexample, не обязательный red-before) |
| P13 | B27 |
| P14 | B01 |
| P15 | B15 |
| N1 | B61 |
| N2 | B62 |
| N3 | B61, B49 |
| N4 | B63 |
| N5 | B19 |
| S request-count cases | B70, B71 |
| S duplicate winner / size-only adoption | B30, B31, B16, B17 |

## 3. E: все 71 замечание и две positive assurance

Группировка не меняет прежний вердикт. Conditional/dead/опровергнутые последствия не превращаются в подтверждённые дефекты от наличия requirement.

| E IDs | Решение в новой спецификации |
|---|---|
| C1, C2, M14 | R13.2–3: dead-code cleanup, mandatory VAM, cooperative trust; нет claim active backdoor |
| M1 | R10.8, R11.5: deferred/account cooldown, не часовой inline sleep |
| M2 | R10.6: own-key roundtrip |
| M3 | R12.4: resolved branch + verified cache reconciliation |
| M4 | R10.3: scope/effect typing, независимые items |
| M5 | R11.7: ZIP singleflight/session identity |
| M6 | R10.6: hash normalization, без ложного eternal-redownload claim |
| M7, M8 | R11.7: API-key validation/escape/pagination/capability |
| M9 | R11.7: archive range validators |
| M10 | R11.3: physical orphan + bounded admission |
| M11 | R11.1–2, R11.7: snapshot lifecycle, не произвольный mid-run TTL |
| M12 | R11.6–7: auth-discriminated schema |
| M13 | R12.8: localization registry |
| M15 | R11.7: early DAV response budget |
| M16 | R11.5: Google reason/status classification, HTTP-date уже поддерживался |
| m1, m2, m3, m4 | R11.7 и R12.8: Yandex traversal, nested errors, URL renewal/i18n |
| m5, m6, m7 | R11.5–7: Git typed diagnostics/headers/schema/parser |
| m8, m9 | R11.7: provider URL adapters, ZIP epoch |
| m10, m11 | R11.7: DAV error preservation/timeout/server case semantics |
| m12 | R11.4, R12.7: revisions gate, latent existing-ID path |
| m13, m14, m15 | R11.1–4: bounded metadata/guard/ID index; не удалять freshness ради скорости |
| m16 | R12.1–2: combined legacy bridge, post-policy collision |
| m17, m18, m19 | R10.1/6: cancelled result, serialized journal/watermark, doc defaults |
| m20, m21 | R10.3/4: coverage, failure scope и blocker epochs; circuit state не объявляется багом без scenario |
| m22 | R10.7, R12.6: logical deletion vs recovery, retention без auto copy deletion |
| m23, m24 | R10.5/8: wake/continuation и queue metadata/key |
| m25, m26 | R12.3: atomic reservations/scoped recovery; учитывать уже имеющийся host lock |
| m27, m28 | R12.6: quarantine/temp/pin GC; dead cleanup не активировать без проверки |
| m29 | R10.7: remote precedence |
| m30, m31 | R11.3–4: memory/stream lifecycles; consumed body не доказывает socket leak |
| m32, m36 | R13.3, R11.7: constants/docs/TTL после session safety |
| m33 | R12.4: explicit migration output; caller-mutated profiles не баг «чистоты» сам по себе |
| m34, m35 | R11.3, R10.2: fairness и partial stats |
| m37, m38 | R11.6: SecretStorage capability, account identity с bounded userinfo |
| m39 | R13.2: VAM timeout/dispose/late readiness |
| m40, m41 | R11.7, R12.4: schema validation и stable identity, не blanket key rejection |
| m42, m43 | R10.9, R11.3: cancellation/throw cleanup |
| m44, m45, m46, m47, m48, m49 | R12.8: UI stability/a11y/diagnostics/picker contracts, conditional claims отдельно |
| m50, m51, m52, m53 | R13.3, R12.2/8: phase docs/dead editor/busy select/literal pattern whitespace |
| I1, I2 | R13.1: сохранить positive assurance и отличать её от live acceptance |

## 4. Сохранение A01–A87

Новые B не заменяют исходные A целиком. Каждый A сохраняет собственные fixtures и oracle; ниже — связь с уточнениями, а не claim эквивалентности тестов.

| Старые A | Уточняющие B / область |
|---|---|
| A01 | B61, B62: config/plugin hard guards |
| A02–A06 | B08, B29, B30, B31: graph/coverage/collisions |
| A07–A09 | B57, B58: proposals/peer lineage |
| A10 | B13, B14: dictionaries/digests |
| A11–A17 | B16, B31, B47, B50: symbolic policy/assignments/direction |
| A18–A20 | B49, B50, B54: local/remote authority, retired claims |
| A21–A24 | B16, B48, B50, B51: policy migration и scoped deletion |
| A25–A29 | B04–B09, B26: isolation/errors/accounting |
| A30–A34 | B17, B18, B59, B60: unknown/conflicts/tombstones |
| A35–A43 | B20–B25, B03, B48, B66: scheduler/lifecycle |
| A44–A48 | B47, B59, B60, B64: plan/decision/close/selection semantics |
| A49–A56 | B31, B48, B62, B64: anchors/drafts/tree/picker |
| A57–A61 | B38–B40, B04, B64, B68: OAuth/results/hooks |
| A62–A63 | B03, B05, B34, B35, B52: crash/probe receipts |
| A64–A67 | B54–B56, B70: GC/compaction/storage pressure |
| A68–A71 | B50–B53, B80: verified migration/cutover/rollback |
| A72–A74 | B18, B05, B11, B56, B68: compact lineage/journal/export |
| A75–A79 | B26, B36, B49, B70, B71: throughput/resources/concurrent effects |
| A80–A87 | B38–B40, B60, B67, B68, B75, B77–B80: live/platform/packaging/rollback |

A46 дополнительно фиксирует: закрытие progress/conflict inspector не cancel всего run; отказ от обязательного run-confirm диалога — cancelled (B01). A23 сохраняет запрет расширения destructive effects; его oracle для closed Drive profile явно изменён в README override table: новые целевые semantics активируются после documented migration/preview; смена UI label не считается миграцией поведения.
