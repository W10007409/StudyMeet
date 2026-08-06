# Phase 0 PoC — progress ledger

Plan: docs/superpowers/plans/2026-08-06-phase0-pip-camera-poc.md
Branch: feature/phase0-pip-camera-poc
Base: 26c88d6

Task 2: complete (commits 4d2f26f..45f9891, review clean after 1 fix pass)
  Minor deferred to final review:
    - SpikeActivity.kt connect(): catch(Exception) swallows CancellationException.
      Rethrow it before the generic catch.
Task 3: complete (commits 5be585a..6a54b8b, review clean after 1 fix pass)
  Minor deferred to final review:
    - SpikeActivity.kt observeEvents(): FGS not stopped on RoomEvent.Disconnected
      while the Activity stays alive. Accepted for a spike; confirm at final review.
Task 4: complete (commits 18c12f6..2df589d, review clean after 1 fix pass)
Task 5: complete (commit 9859084, review clean, no fix pass)
  Minors deferred to final review:
    - PipCameraSurvivalTest.kt:42 discards enterPipNow()'s Boolean; a 10s poll
      timeout replaces an immediate negative signal. Diagnosability only.
    - PipCameraSurvivalTest.kt threshold comment says "24fps의 절반" but 30 is
      ~42% of 72, not half. Comment is wrong; the lenient threshold is fine.
      Originates in the plan's Task 5 code block - fix the plan too.
Task 6: complete (commits 2c4c64f..8f8e97f, review clean after 3 fix passes)
  Minors deferred to final review:
    - observeEvents() TrackPublished branch filters by type only, not
      publication.source == CAMERA. Unreachable today (no screen share).
    - unregisterReceiver throws if onCreate() failed before registration.

Tasks 7-11 (iOS/iPad): NOT STARTED - require macOS + Xcode + iPad hardware.
Task 12 (results judgment): NOT STARTED - requires real measurements from
  Tasks 5/6 device runs and Task 11.
