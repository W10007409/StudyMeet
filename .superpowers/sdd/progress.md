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
