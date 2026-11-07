# Emberwood reference UI implementation plan

**Goal:** Complete the procedural artwork, responsive HUD, three-card building chooser and visual states from the supplied reference; hand gameplay logic to Claude.

**Architecture:** `emberwood.html` contains presentation functions, a read-only snapshot renderer, input/action events and a clearly separated visual-fixture controller. `handoff/emberwood-legacy.html` preserves the previous runnable game byte for byte. No gameplay simulation is added to the new presentation layer.

**Constraints:** Thai UI; fullscreen portrait/landscape; one standalone HTML; Canvas shapes/gradients; no libraries, external fonts, images or requests. Source reference is a 540×960, 50-frame, 5-second GIF, plus building-menu screenshots. Unseen mechanics are not treated as verified.

- [x] Redraw actors, mixed forest, axe VFX, stone-ring fire, pickups, damage text, three towers and projectile/status-effect artwork. Use world coordinates and uniform camera projection; renderer never changes snapshot coordinates on resize.
- [x] Implement reference-style grey gear, white outlined HUD, continuous red bar, blue numeric badge, unboxed resource icons, green build pad, cyan menu banner, four color markers and three green choice cards. Include responsive settings/help/result surfaces and a transient joystick.
- [x] Expose `EmberwoodUI.setSnapshot`, `getSnapshot`, `openBuildMenu`, `closeBuildMenu`, `setBuildPending`, `showResult`, `onAction`, `project` and drawing functions. Events carry intent only. No thresholds, costs, AI, movement, health changes, target selection or wave progression.
- [x] Keep static screen presets in a separate fixture block, disable them with `?runtime=logic`, and expose presets for scene/build/cannon/archer/flame/effects. Fixture clicks only switch prepared snapshots.
- [x] Verify syntax, API immutability and event payloads with focused checks; browser-test portrait 392×533 / 375×812, landscape 844×390 and desktop 1280×720; inspect all three tower cards and stage variants for clipping and missing art.
- [x] Write `CLAUDE_LOGIC_HANDOFF.md` with the actual API schema, source evidence, event/ownership contract, missing gameplay tasks and acceptance checks. Report frontend-only completion accurately.

**Stop condition:** Visual presets and rendering API work at the tested sizes, no external assets are loaded, and Claude can implement mechanics without redesigning presentation. Do not implement the gameplay state machine.

