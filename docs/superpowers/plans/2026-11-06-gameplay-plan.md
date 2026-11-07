# Emberwood gameplay implementation plan

**Goal:** Implement the gameplay handoff in the existing standalone HTML, preserving its presentation layer and visual previews.

**Spec:** `D:/Games/CLAUDE_LOGIC_HANDOFF.md`, plus the user's instruction to carry out Claude's work in this chat.

**Architecture:** A pure `GameEngine` in the existing `game-logic` script owns world state, dt, input, resources, enemies, towers, projectiles and outcomes. The browser adapter subscribes to the existing UI action API and publishes complete snapshots. Visual presets run only when `?preview=` is explicit. No second renderer, external packages or runtime assets.

**Rulings:** Work in the user's existing checkout so the delivered local HTML stays at its known path; preserve all pre-existing changes. Implement inline; obtain one independent final review. Only 30→build choice→60 is verified; all other balance values must be marked ASSUMPTION in CONFIG and notes. Fire is light only. At an upgrade, the three existing cards let the player retain or change the tower type while increasing its level; this is an explicit temporary rule for the unseen upgrade phase.

- [x] Task 1 — Write failing behavior tests; implement deterministic engine state, normalized movement/world bounds, dt cap, pause sets, drops/pickups, conserved automatic wood transfer and unique build requests. First build costs 30, first upgrade 60, no double charging.
- [x] Task 2 — Implement axe/contact combat, enemy movement/separation, projectiles and tower targeting, cannon AoE, single-target arrows and timed flame/burn. Test actual hit results, once-per-swing/tick behavior, expiry/dead targets, and all three selections.
- [x] Task 3 — Implement five waves, intermission, victory/death, restart and camera following; test terminal outcomes and clearing old timers/requests. Integrate the UI action adapter and default playable boot, leaving explicit preview modes available.
- [x] Task 4 — Run the complete presentation/gameplay test suites and browser checks at portrait/landscape sizes. Independently review code, address material findings with regression tests, update handoff/status notes and save a reviewable screenshot.

**Review focus:** Build-request replay across restart; resource conservation; menu nesting and blur pause; damage once per swing / timed burn ticks; projectiles targeting dead enemies; no world mutation on resize; no fixture controller in normal play; no duplicate subscriptions/RAF after restart.

**Verification:** `node --test tests/*.test.cjs` (all tests green), `git diff --check`, browser keyboard/touch input, first 30-log popup and one real tower purchase, stable state over pause/rotation, no console errors.

**Stop:** Normal file opens a playable five-wave game; all three towers work; UI is preserved; remaining unverified balance assumptions are documented. Do not add unrelated content or redesign visuals.


## Completion evidence

- Tasks 1–3 complete: new engine tests failed first because the engine was absent; gameplay 23 cases now pass. Existing presentation checks remain green.
- Final independent review: one material P2 flame-range mismatch. Reproduced a miss on a stationary south-side enemy, then fixed acquisition/hit origins and added a RED→GREEN regression. No other material findings or declined judgments.
- Integration validation: default input → conserved 30-log deposit → modal → one real tower → 0/60; nested settings/help, blur/focus and restart exercise real UI+engine together. Guard against HUD DOM churn also failed first (60 rewrites), then passed after caching displayed values.
- Final gate: 23 gameplay cases + 13 presentation/integration checks green; browser observed bag 13→6, site 23/30→30/30, and real purchase→0/60; final normal-play page has no observed console errors. Screenshot saved outside runtime assets.
- Backup files were preserved. No deferred review findings. Balance assumptions are documented in GAMEPLAY_NOTES.md.
