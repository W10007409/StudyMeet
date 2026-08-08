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

=== PLAN CHANGED: P2P (635fae2) ===
Design 2.3 switched to raw libwebrtc P2P; LiveKit/SFU deferred.
New plan: docs/superpowers/plans/2026-08-06-phase0-p2p-pip-camera-poc.md
Old plan archived as -livekit-superseded.md.
Tasks 2-6 of the OLD plan stay valid as scaffolding (PIP, FGS, screen-off,
frame counter are engine-agnostic); only the engine is swapped.
Resuming at NEW Task 1.
P2P Task 1: complete (commits 0174323..2c1627d, review clean after 1 fix pass)
  Engine swapped to io.github.webrtc-sdk:android 144.7559.09 (org.webrtc.*).
  Fixed: unguarded stopCapture on screen-off path; renderers released after
  eglBase. Both bugs originated in the plan and were fixed there too.
P2P Task 2: complete (commits abd4905..1fce828, review clean after 1 fix pass)
  Instrumented test now runs unconditionally - no server, no credentials.
  Tablet + 'adb logcat -d -s PipSpike' is all that is needed for the number.
P2P Task 3: complete (commit 6af4855, review clean, no fix pass)
  BuildConfig.USE_FOREGROUND_SERVICE gates all three service call sites.
  Enables the FGS-off contrast run that settles design 5.1's assumption.
  PART A DONE - a tablet alone now yields the PIP camera measurement.
P2P Task 4: complete (commit 8d04125, review clean, no fix pass)
  Signalling server verified end to end with two ws clients on Node 22.
  README clarified after review: role= is client-side only, server ignores it.
P2P Task 5: complete (commits 5c89d62..2005a0d, review clean after 2 fix passes)
  SignalingClient + PeerConnection. Fixed: ICE candidates dropped silently
  before setRemoteDescription; native addIceCandidate called under the buffer
  lock (circular wait with libwebrtc's signalling thread); peerConnection
  published without @Volatile.
P2P Task 6: implemented + 1 fix pass (28ce482). Awaiting re-review.
  TURN optional via local.properties; selectedCandidatePair log now names the
  nominated pair and marks ambiguity, so the relay tally cannot be miscounted.
P2P Task 6: complete (commits 5fa709f..c630f78, 3 fix passes)
  TURN optional; selectedCandidatePair log names the nominated pair, marks
  ambiguity, and keeps unreadable types out of the tally. coturn.md carries
  one unambiguous counting rule.

=== ENVIRONMENT LIMIT REACHED ===
Tasks 1-6 (Parts A and B) are code-complete and compile.
NOTHING has been measured. Every number in phase0-poc-results.md is empty.
Blocked on hardware:
  - Task 2/3 measurement: Android 14/15/16 tablets, one Samsung
  - Task 5/6 measurement: two devices + LAN + coturn
  - Tasks 7-11 (Part C, iPad): macOS + Xcode + several iPad generations
P2P Task 7: complete (commit a3e32fb, review clean, no fix pass)
  Teacher web peer at signaling/public/teacher.html. FIRST RUNTIME PROOF in
  this branch: two real Chrome tabs negotiated through the server and both
  reached connected / localType=host nominated=true. getUserMedia was stubbed
  (no camera on this box); everything below it ran the page's real code.
  Measurement now needs one tablet + a laptop, not two tablets.

=== NEW PLAN: teacher-web (3457cb5) ===
Plan: docs/superpowers/plans/2026-08-07-teacher-web-implementation.md
Spec: docs/superpowers/specs/2026-08-07-teacher-lesson-screen-design.md
7 tasks, no hardware blocker. Phase 0 teacher.html stands in as the peer.
Starting at Task 1 (toolchain gate).
teacher-web Task 1: complete (commit 6c58a3d, review clean)
  TypeScript 7.0.2 VERIFIED working with vite 8 / vitest 4 / plugin-react 6.
  Two plan defects found and fixed by the gate: @types pins tracked React's
  version (they do not), and defineConfig came from 'vite' (no test field).
teacher-web Task 2: complete (commits b1edc86..e1ff1f7, review clean, 1 fix pass)
  Domain logic TDD: pageSync LWW, presence accounting, format, maskPhone.
  Fix pinned the delta-vs-total contract on accumulateDisconnected - that
  number is what a teacher reads when deciding to give a child extra time.
teacher-web Task 3: complete (commit 1172dfe, review clean, no fix pass)
  TeacherApi interface fixed + throwaway stub. Review caught that getToken
  was defined but never consumed - Lesson.tsx read the signalling URL from
  env instead. Plan corrected: connection info now comes from the backend
  and useSession gained an enabled gate.
teacher-web Task 4: complete (commits b18f7da..2270405, review clean, 1 fix pass)
  useSession hook. Fix: ICE candidate buffer and remoteSet flag were hook-
  lifetime refs, so a torn-down connection leaked state into the next one;
  and ws.onmessage kept running against a closed peer connection after
  hang-up. Neither is covered by tests - the spike was single-shot per page
  load and never hit either.
teacher-web Task 5+6: complete (commits 7181792..fe1bd2f, reviewed together, 1 fix pass)
  All three screens. FIRST FULL RUN: list -> lobby -> lesson driven in a real
  browser, bidirectional video, ICE connected, timer, page toast, end returns.
  Fixes: the tick interval was rebuilt on every presence change so a second of
  real disconnected time vanished on reconnect - the number a teacher uses to
  decide compensation; and page_sync was transmitted from inside a state
  updater, which StrictMode double-invokes.
teacher-web Task 7: complete (commits bd3450e..a366b78, review clean, 1 fix pass)
  Note autosave + re-entry within 30 min. Fix: debounce never cleared its
  pending args, so flush re-sent the note after the timer had already fired -
  which on a 10-minute lesson is nearly every end. Stub now marks sessions
  ENDED so re-entry is reachable at all.

=== teacher-web PLAN COMPLETE: Tasks 1-7 ===
26 tests, clean build, full flow driven in a browser.

=== NEW PLAN: scheduling backend (1a1aaec) ===
Plan: docs/superpowers/plans/2026-08-07-scheduling-backend-implementation.md
Spec: docs/superpowers/specs/2026-08-07-lesson-scheduling-design.md
Docker 29.3.1 present, port 5432 free -> all 7 tasks runnable here.
Starting at Task 1.
scheduling Task 1: complete (301180d) - TS 7.0.2 works, no traps fired.
scheduling Task 2+3: complete (3241232..ca2b00c, reviewed together, no fix pass)
  Slot grid, recurrence with holidays, cancel deadline, no-show, credit rules.
  19 tests. Reviewer compiled a mutated CreditEvent union to prove the
  exhaustive switch really rejects an undecided event.
scheduling Task 4+5: complete (fb6a77d..1796ccb, reviewed together, 1 fix pass)
  Schema + materialisation job. Review CAUGHT A BLOCKER by executing it:
  Prisma 7 needs a driver adapter, so PrismaClient could not be constructed
  at all and materialize() could never have run. Also: recurrence rules
  ignored their own startsOn/endsOn, so an ended rule produced lessons
  forever; window was 29 days not 28; columns lacked timezone.
scheduling Task 6+7: complete (51d1093..bfad638, reviewed together, 1 fix pass)
  All ten endpoints, exercised live with curl. Review caught two criticals:
  scheduledAt went out as UTC while the screen slices the string, so every
  lesson time would have shown nine hours early; and /end had no terminal
  status guard, so calling it twice issued two credits for one missed lesson
  - invisible to the balance-vs-ledger check because both sides stayed
  consistent while both were wrong.

=== scheduling backend PLAN COMPLETE: Tasks 1-7 ===
22 tests, clean build, all endpoints verified against live Postgres.
teacher-web also at 26 tests / clean build after the SessionStatus widening.

=== STUB -> HTTP SWAP: complete (d095441) ===
teacher-web now talks to the real scheduling backend. Seeded 23:58:52+09:00
displayed as 23:58 in the UI - no offset. The interface held: no TeacherApi
method signature changed.
Caught only by driving a real browser: @fastify/cors defaults methods to
GET,HEAD,POST, so PUT was blocked and saveNote silently failed. curl does
not enforce CORS, so it was invisible until then.
Stopgap recorded in the spec: VITE_TEACHER_ID stands in for auth.

=== NEW PLAN: teacher scheduling screens (0584175) ===
Plan: docs/superpowers/plans/2026-08-08-teacher-scheduling-screens.md
Fills the gap between the two earlier plans: cancellation, makeup booking
and the student credit list. Backend endpoints already exist and were
verified against live Postgres.
Tasks 3-5 are prose rather than complete code - the same thinness that
produced this session's two worst defects in the backend. The plan says so.
