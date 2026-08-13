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
scheduling screens Task 1-5: complete (10cd656..1fe53f9)
  Helpers, api layer, three screens, date navigation. All five browser
  checks passed against live Postgres; the apparent balance-vs-ledger
  mismatch was traced to the seed script, not the backend.
  GAP FOUND AND CLOSED: SessionList showed only today, so with a 24-hour
  cancellation cutoff the lessons worth cancelling were unreachable and
  every possible cancellation became a no-show.
  KNOWN: stub listSessions ignores its date argument, so the empty-day
  state cannot be exercised without a backend.

=== NEW SPEC: operator monitoring (77c4513) ===
docs/superpowers/specs/2026-08-08-operator-monitoring-design.md
Monitoring only - registration, assignment and timetable editing are out of
scope, which removed CSV import and bulk forms entirely.
Order is auth first, because the operator screen shows every child's
guardian contact and there is currently no auth at all.
Two gaps this closed:
  - IN_PROGRESS existed in the type and nothing ever wrote it, so a live
    "in progress" count would always have read zero.
  - The 90-second teacher-disconnect auto-close in the main design had no
    implementation path; the heartbeat is what finally makes it possible.

=== NEW PLAN: operator monitoring (252c74e) ===
docs/superpowers/plans/2026-08-08-operator-monitoring-implementation.md
Six tasks. Auth deferred by decision, so the plan carries the interim guard:
127.0.0.1 binding plus a shared-secret header, and the server refuses to
start without the secret set. Not auth - it only stops accidental exposure.
Task 3 finally implements the 90-second stale-session close the main design
agreed to long ago and never had a path for. It deliberately issues no
credit: a dead teacher browser is not a child's absence.
operator Task 1-3: complete (01ad171..e360cce, reviewed together, 1 fix pass)
  Liveness rule, start + heartbeat, stale reaper. Reviewing the three as one
  caught what per-task review could not: /start writes IN_PROGRESS but /end
  and /cancel predated it and only accepted SCHEDULED, so once the teacher
  screen calls /start a normally finished lesson would be refused and later
  mislabelled by the reaper as a lost heartbeat. Also fixed: the reaper wrote
  from a stale snapshot and could close a session that had just beaten;
  /start could reset startedAt under a double call; the auto-close reason
  lived in the note field the teacher can overwrite.
operator Task 4-6: complete (1115c7b..24d15b2, reviewed together, 2 fix passes)
  Operator API behind a shared secret, teacher screen reporting, admin-web.
  END TO END VERIFIED: entering a lesson in a browser flips the DB to
  IN_PROGRESS, the heartbeat advances, and /operator/live returns 1.
  Fixes: the live counters were named for things the server cannot observe
  (a "disconnected" count that actually measured teacher-browser lag); the
  404 body differed from Fastify's default so route existence leaked; the
  polled counts had no index behind them.

=== operator monitoring PLAN COMPLETE: Tasks 1-6 ===
scheduling 31 tests, teacher-web 35, all builds clean.
NOT DEPLOYABLE until auth exists - see design 2.1.

=== NEW PLAN: lesson call push (uncommitted mode) ===
Plan: docs/superpowers/plans/2026-08-11-lesson-call-push-implementation.md
Spec: docs/superpowers/specs/2026-08-11-lesson-call-push-design.md
13 tasks across scheduling / teacher-web / app-bookclub3-master.
DECIDED: no commits at all this run - work stays in the working tree.
DECIDED: app-bookclub3-master is not tracked (added to .gitignore); it is a
  separate project with no .git of its own.
Per-task diffs come from directory snapshots under C:\tmp\smsnap, not git
  ranges. Snapshot root is short on purpose: Kotlin package paths under the
  scratchpad exceeded Windows' 260-char limit and git could not read them.
lesson Task 1: complete (no commit; diff C:\tmp\task-01-diff.txt, review clean)
  decideNudge + isNudgeable. 11 tests, full suite 42/42.
  Minor deferred to final review:
    - nudge.test.ts test named "빈 문자열 회원번호" passes '   ' (whitespace),
      never a true ''. Behaviour is correct (trim() covers both); the name
      overstates coverage. Originates in the plan's Task 1 code block.
  Carried forward to Task 5: decideNudge trusts the caller for sent/failed;
    the route must compute them from the real send result.
lesson Task 2: complete (no commit; diff C:\tmp\task-02-diff.txt, review clean)
  PushSender seam + classifyFcmError. 6 tests. No firebase-admin import yet.
lesson Task 3: complete (no commit; diff C:\tmp\task-03-diff.txt, review clean)
  Student.customerNumber + Device model + POST /devices. 5 tests, suite 53/53.
  db:push SKIPPED - no Postgres on this machine. Must run before Task 13.
lesson Task 4: complete (no commit; diff C:\tmp\task-04-diff.txt, review clean)
  firebase-admin 13.10.0 + createFcmSender(). Returns null without a key so a
  missing credential costs push, not the server. tsc clean.
  NOT exercised at runtime yet - no Postgres, and no service account key.
lesson Task 5: complete (no commit; diff C:\tmp\task-05-diff.txt, review clean)
  nudge now looks up devices, sends, prunes invalid tokens, 409s on a finished
  session. failed counts BOTH invalid and retryable; only invalid are deleted.
  Suite 53/53, tsc clean. Endpoint NOT exercised - no Postgres.
  Minor deferred to final review:
    - pushSender.send() has no try/catch, so a whole-batch FCM exception 500s
      instead of resolving to a typed NudgeOutcome, and skips the result log.
SERVER SIDE COMPLETE (Tasks 1-5).
lesson Task 6: complete (no commit; diff C:\tmp\task-06-diff.txt, review clean)
  nudgeMessage() maps reason -> the action it implies. Call button moved out of
  the readiness warning box so it survives the readiness stub being replaced.
  7 tests, teacher-web suite 42/42.
lesson Task 7: complete (no commit; diff C:\tmp\task-07-diff.txt, review clean)
  google-services plugin applied CONDITIONALLY on composeApp/google-services.json
  so a missing credential costs push, not the build. firebase-bom 34.1.0 resolved.
  Firebase confined to androidMain. POST_NOTIFICATIONS + USE_FULL_SCREEN_INTENT.
  assembleBookpadDebug SUCCESSFUL with the no-FCM fallback line in the log.
  NOTE: first bookclub build took ~2h (cold dependency cache). Later ones warm.
lesson Task 8: complete (no commit; diff C:\tmp\task-08-diff.txt, review clean after 2 fix passes)
  childCustomerNumber now persisted and restored when the launcher supplies
  nothing - a push-woken app used to run as the dummy customer.
  Fix 1: the plan block silently dropped an existing AppLogger call.
  Fix 2: a BLANK launcher value took the authoritative branch, so an empty
    customer number reached UserSession and every API call. Now falls through.
  MapSettings came from multiplatform-settings-test, not the core artifact the
    plan named; confined to commonTest. 6/6 shared tests.
PACE CHANGE: bookclub Gradle dominates (Task 7 alone = 119 min, cold cache).
  Remaining bookclub tasks are batched (9+10, then 11+12), verified with
  compileDebugKotlinAndroid instead of assembleBookpadDebug where an APK is not
  needed, and reviewers are told not to explore the tree.
lesson Task 9+10: complete (no commit; diff C:\tmp\task-0910-diff.txt, review clean)
  Reviewed together. Scheduling backend gets its own named("studymeet") Ktorfit
  so the gateway envelope and the 204-no-body backend never mix. lessonModule
  registered in BOTH MainApplication and KoinHelper. Screen.Lesson destination,
  MVI component, placeholder screen, openLesson() dedup on active config.
  Deviation: dimensions.spacing16 does not exist; used dimensions.space.space16.
  Builds 45s / 35s with compileBookpadDebugKotlinAndroid - cache now warm.
lesson Task 11+12: complete (no commit; diff C:\tmp\task-1112-diff.txt, review clean after 1 fix pass)
  Reviewed together. Call notification (full-screen + heads-up fallback, logs
  which the system allowed), LessonCallActivity (exported=false), OPEN_LESSON
  route, FCM service, DeviceTokenRegistrar, POST_NOTIFICATIONS request.
  DEVICE VERIFIED on R8YW70BEYLZ: call screen renders, 들어가기 -> Splash -> Main
  -> Lesson with the session id threaded through. Token fetch fails cleanly
  without google-services.json and does not crash.
  Fixes: messaging service scope was never cancelled; onNewIntent pushed the
  lesson without the Splash deferral, so a warm-start call could be swallowed
  by replaceCurrent(Main).
  Recorded as deliberate: one notification id (a newer call supersedes an older
  one, like a second phone call); onNewToken does not retry before bootstrap.
  PLAN DEFECT: Task 11 Step 7 adb command cannot start a non-exported activity
  on a retail device. The plan should say so.
lesson Task 14 (NEW, user request mid-run): complete (no commit; diff C:\tmp\task-14-diff.txt, review clean after 2 minor fixes)
  KRS library screen now has a [수업 들어가기] button next to the vocabulary
  challenge button. Green pill so the two do not read as one block.
  Video-camera glyph hand-authored as an ImageVector - this app has no Material
  icon dependency and release does not shrink, so a library would ship whole for
  one glyph.
  Click travels the SAME route the vocabulary button already uses (individual
  callback through KrsCurriculumPane, unwrapped to KrsIntent in KrsTabContent).
  DEVICE VERIFIED: button -> lesson screen (manual-entry) -> back returns.
  Fixes applied inline: redundant by lazy on an object property; import order.
  OPEN GAP: a manual entry has no real session id. LessonEntry.MANUAL_SESSION_ID
    stands in until the child app can ask the backend which session is its own.

=== STOPPED: Task 13 (end to end) BLOCKED ===
Needs all three, none of which exist yet:
  - Postgres running + prisma db:push (schema never pushed)
  - google-services.json for com.wjthinkbig.bookclub3app.bookpad
  - Firebase service account key for the scheduling server
Everything else in the plan is code-complete and verified as far as it can be.

=== NEW PLAN: lesson audio call (uncommitted mode) ===
Plan: docs/superpowers/plans/2026-08-12-lesson-audio-call-implementation.md
Spec: docs/superpowers/specs/2026-08-12-lesson-audio-call-design.md
11 tasks. Audio only - no camera, renderer, PiP, foreground service, reconnect.
Teacher is caller, child is callee. New :studymeet Android library module.
Snapshots prefixed a01.. under C:\tmp\smsnap; diffs at C:\tmp\aNN-diff.txt.
audio Task 1: complete (no commit; diff C:\tmp\a01-diff.txt, review clean)
  pickCurrentSession + CURRENT_SESSION_WINDOW_MS. 10 tests.
  Minors deferred to final review (both originate in the plan, not the implementer):
    - LOBBY_OPEN is in JOINABLE_STATUSES but no test exercises it; a typo in
      that allowlist member would not be caught.
    - status is bare string, so an unrecognised status is silently excluded
      rather than caught at compile time.
audio Task 2: complete (no commit; diff C:\tmp\a02-diff.txt, review clean after 1 fix pass)
  GET /students/:customerNumber/current-session. Ownership enforced by the
  where clause; all three failure paths return an identical 404 so "exists but
  not yours" cannot be told from "does not exist". Suite 63/63, live curl OK.
  Fix: scheduledAt went out as UTC while every other route uses toKstIsoString.
    That exact shape caused a nine-hour display error in this repo once before.
  Controller fix before review: .env had SIGNALING_URL=ws://localhost:8081,
    which Android blocks as cleartext - only the literal 127.0.0.1 is permitted.
  Minor deferred to final review:
    - include teacher runs for every candidate session, not just the picked one.
audio Task 3: complete (no commit; diff C:\tmp\a03-diff.txt, review clean)
  LessonCallEngine + LessonCallState + CallFailure in :shared/commonMain, no
  platform types. NoopLessonCallEngine fails loudly rather than pretending.
  Bound on BOTH platforms; Android binding is replaced in Task 7.
  ENV LIMIT: iOS targets cannot compile on this Windows host (CommonCrypto
  cinterop). The iOS edit is verified by inspection only, every task from here on.
audio Task 4: complete (no commit; diff C:\tmp\a04-diff.txt, review clean after 1 fix pass)
  :studymeet android library added. implementation(projects.shared) one way only;
  webrtc + okhttp confined to it; composeApp consumes it from androidMain so it
  stays off the iOS build. Manifest: INTERNET, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS.
  Controller fixes: snapshot script did not capture studymeet/ or settings.gradle
    .kts, so the first diff could not show the load-bearing files - script fixed.
    Catalog said okhttp 4.12.0 while Gradle resolved 5.2.1 via Ktor; declared
    version now matches what is actually on the classpath.
audio Task 5: complete (no commit; diffs C:\tmp\a05-diff.txt + a05-fix-diff.txt, review clean after 1 fix pass)
  SignalingMessage codec + IceCandidateBuffer<T>. 20 tests.
  Fix: the clear() test drained the buffer before clearing, so it proved nothing;
    Ready/PeerLeft were never round-tripped through the encoder; and the
    never-throw contract had no malformed-candidate coverage. All three closed.
audio Task 6: complete (no commit; diffs C:\tmp\a06-diff.txt + a06-fix-diff.txt, review clean after 1 fix pass)
  SignalingClient (OkHttp WebSocket) + WebRtcAudioSession (audio-only PeerConnection).
  Fixes: audioSource was a local and leaked on every teardown; localAudioTrack was
    nulled without dispose; SDP failures only logged and never reached onFailed, so
    a failed setRemoteDescription left the call stuck at connecting with no signal;
    createAnswer fired before setRemoteDescription had applied; candidate dropped
    with no log when peerConnection was null; OkHttp dispatcher never shut down.
  close() order verified safe: peerConnection, track, source, factory, eglBase.
  Minor deferred to final review:
    - eglBase.release() is unguarded against a double close().
audio Task 7: complete (no commit; diffs C:\tmp\a07-diff.txt + a07-fix-diff.txt + a07-fix2-diff.txt, review clean after 2 fix passes)
  AndroidLessonCallEngine assembled; Android Koin binding switched off the Noop.
  Fix 1: every retry stranded a PeerConnectionFactory, EglBase and OkHttp
    dispatcher - join() and both failure callbacks replaced objects without
    closing them, and the retry button makes that the common path. Also: the
    room query injected a slash into the URL path; audio routing was forced to
    speaker and never restored; three fields were unsynchronised.
  Fix 2: fix 1 held the lock across close(), called from listener threads - a
    circular wait. Lock now covers only the reference swap. Permission branch
    also tears down now.
  Minor deferred to final review:
    - a stale failure callback from an old session can tear down a session that
      a retry has already replaced. A generation counter would close it.
audio Task 8: complete (no commit; diffs C:\tmp\a08-diff.txt + a08-fix-diff.txt, review clean after 2 fix passes)
  JoinInfo + GetJoinInfoUseCase + LessonApi.getCurrentSession. Screen.Lesson
  sessionId now nullable; LessonEntry.MANUAL_SESSION_ID deleted.
  Fix 1: 404 and network failure were one untyped Throwable, so a dropped wifi
    would have told the child "there is no lesson". Added NoCurrentSessionException.
  Fix 2: that mapping could never fire - the shared HttpClient has expectSuccess
    off, so a 404 was being deserialized as a success body. Added
    createForStudymeet() with validation on; only the studymeet Ktorfit uses it.
    create() was factored but verified byte-identical in behaviour for every
    existing gateway API.
audio Task 9: complete (no commit; diffs C:\tmp\a09-diff.txt + a09-fix2-diff.txt, review clean after 2 fix passes)
  LessonComponent fetches join info and drives the engine; LessonScreen shows
  each failure in words a child can act on.
  DEVICE CRASH FOUND AND FIXED: libwebrtc calls onIceConnectionChange on its own
    signalling thread, and the leak fix from Task 7 disposed the PeerConnection
    inside that callback - SIGABRT on a destroyed mutex, 2/2 reproducible.
    Failure teardown now posts to the main thread. Verified: crash buffer empty,
    pid survives, screen shows the failure.
  Fix 2: the posted teardown had no call identity, so a retry could have its new
    session torn down by a stale post. Generation counter added.
    Also: a dropped network read as "문제가 생겼어요", same as an internal error.
    New LessonPhase.LookupFailed - the design requires those to differ.
  Minor deferred to final review:
    - generation is captured by reading the live value at post time, leaving a
      few-instruction TOCTOU window. Pinning it to the session instance closes it.
    - no automated test covers the generation guard or the LookupFailed path.
audio Task 10: complete (no commit; diffs C:\tmp\a10-diff.txt + a10-fix-diff.txt, review clean after 1 fix pass)
  MainActivity.requestMicPermission() shared by onCreate and onResume.
  Controller verified the re-ask path by revoking the permission: the grant
  dialog did reappear.
  Fix: onResume re-asked unconditionally, so declining reopened the same dialog
    immediately and the child never reached the retry button. Now gated by a
    per-visit flag cleared in onStop.
audio Task 11: complete (verification only)
  FIRST AUDIO CONNECTION: iceConnectionState CHECKING -> CONNECTED on the tablet,
  and coturn logged an allocation within 5s of it, then released it at hang-up.
  Route: tablet -> USB adb reverse -> coturn on the PC -> teacher browser.
  NOT verified: byte-level media flow (getStats bytesSent/bytesReceived). The
    browser scripting tool was blocked mid-run. Nobody heard audio - no such
    claim is made.
  Also found: ending the session from teacher-web correctly blocked a rejoin;
    resetting status by raw SQL did NOT restore a working call - the signalling
    room state is not cleared by a DB flip. Worth knowing before anyone tests
    that way again.
  Design doc §7 updated with confirmed/unconfirmed.
  §7-2 (calling across two real networks) remains UNANSWERED - USB bridged it.

=== audio plan: all 11 tasks done, FINAL REVIEW FOUND SERIOUS ISSUES ===
Whole-plan diff: C:\tmp\audio-branch-diff.txt (2414 lines)
Final review (opus) found what per-task review could not see:
  MUST FIX:
   1. currentSession has no LOWER time bound and student.ts has no date scope,
      while reapStale only reaps IN_PROGRESS. A lesson the teacher never starts
      stays SCHEDULED in the past forever, sorts first, and routes the child
      into a dead room on every future tap. A test locks this in as intended.
   2. MainActivity.requestMicPermission() is public for the lesson screen but
      nothing calls it. A child who denies is trapped: retry re-CHECKS the
      permission, never re-ASKS. Spec 5 requires the re-request.
   3. join() increments the generation BEFORE closing the old socket, and that
      close likely fires onFailure - so the old failure is tagged with the NEW
      generation and tears down the session the retry just built.
   4. onConnected() has no generation guard and no main-thread hop, unlike
      onFailed(). A dying session can publish Connected after Idle/Failed.
   5. WebRtcAudioSession.peerConnection is neither volatile nor guarded;
      handleRemote* run on the OkHttp thread while close() runs on main.
   6. IceCandidateBuffer is touched from three threads and is a bare list.
  SHOULD FIX: ENGINE_ERROR unreachable (SDP faults report as ICE_FAILED);
   bare String status; signaling/README.md still says tablet is caller;
   expectSuccess now also affects registerDevice; two lesson screens can stack
   over one singleton engine.
UNPROVEN AND MOST IMPORTANT: no evidence any audio byte ever crossed. ICE
  CONNECTED + a coturn allocation prove a transport, not a media path.
