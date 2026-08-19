package com.studymeet.child.input

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.DisplayMetrics
import android.util.Log
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import com.google.gson.JsonObject
import com.google.gson.JsonParser

/**
 * 선생님 웹에서 보낸 원격 터치를 이 앱의 View 계층에 실제 터치로 주입한다.
 *
 * ## 전체 그림
 * ```
 * 선생님 웹 (useTouchInput.ts)          아이 앱
 *   PointerEvent                          SignalingClient.onMessage
 *     → 프레임 기준 0~1 정규화              → RemoteInputHandler.handleMessage   (소켓 스레드)
 *     → touch_input 메시지                  → 명령 큐 (move 병합)
 *          ─── WebSocket 릴레이 ───→        → 메인 스레드에서 드레인
 *                                           → CaptureGeometry 로 화면 좌표 복원
 *                                           → MotionEvent 조립
 *                                           → activity.dispatchTouchEvent
 * ```
 *
 * ## 설계에서 중요한 판단들
 *
 * **1. 권한이 필요 없다.**
 * 자기 자신의 Window 에 이벤트를 넣는 것은 `dispatchTouchEvent` 로 충분하다.
 * `Instrumentation.sendPointerSync` 나 `InputManager.injectInputEvent` 는
 * `INJECT_EVENTS`(signature 권한) 를 요구하고, 시스템 전역 조작은 접근성 서비스가
 * 필요하다. 여기서는 둘 다 쓰지 않으므로 일반 배포 앱에서 그대로 동작한다.
 * 반대로 말하면 **이 앱의 창 밖(홈 화면, 다른 앱, 시스템 UI)은 조작할 수 없다.**
 *
 * **2. 시각(timestamp)은 로컬 시계로 다시 찍는다.**
 * 메시지의 `timestamp` 는 선생님 PC 의 `Date.now()` 다. MotionEvent 는
 * `SystemClock.uptimeMillis()` 기준을 요구하고, GestureDetector 의 롱프레스·더블탭
 * 판정이 이 값을 직접 쓴다. 남의 벽시계를 넣으면 제스처 인식이 통째로 깨진다.
 *
 * **3. `click` / `double_click` 은 기본적으로 메아리다.**
 * 선생님 웹은 `up` 을 보낸 **직후에** 판정 결과로 `click` 을 한 번 더 보낸다.
 * 이미 down/up 을 주입했는데 여기서 또 탭을 만들면 모든 클릭이 두 번 눌린다.
 * 그래서 직전에 같은 포인터의 실제 up 이 있었으면 무시하고, 짝이 되는 down/up 없이
 * 단독으로 온 경우(마우스 전용 송신자 등)에만 탭을 합성한다.
 *
 * **4. 멀티터치는 저절로 된다.**
 * 두 손가락 핀치도 결국 포인터 두 개의 down/move/up 스트림이다. 그대로 재현하면
 * Android 의 ScaleGestureDetector 가 알아서 인식한다. 그래서 `gesture_input`
 * (drag/pinch 요약) 은 주입에 쓰지 않는다 — 쓰면 같은 동작이 두 번 적용된다.
 * 대신 [Listener] 로 흘려보내 화면 표시 등에 쓸 수 있게 한다.
 *
 * ## 사용법
 * ```kotlin
 * val input = RemoteInputHandler(activity)
 * input.frameSizeProvider = { screenCaptureManager?.frameSize }
 * input.isEnabled = true
 * // 시그널링 메시지를 그대로 넘긴다
 * input.handleMessage(rawJsonText)
 * // 정리
 * input.release()
 * ```
 */
class RemoteInputHandler(
    private val activity: Activity,
    private val config: Config = Config()
) {

    /**
     * @param maxPointers        동시에 재현할 최대 포인터 수.
     * @param maxQueuedCommands  메인 스레드가 밀렸을 때 쌓아둘 명령 상한. 넘으면 오래된 move 부터 버린다.
     * @param tapHoldMs          합성 탭에서 누르고 있는 시간.
     * @param doubleTapGapMs     합성 더블탭의 첫 down 과 두 번째 down 사이 간격.
     *                           `ViewConfiguration.getDoubleTapTimeout()`(300ms) 보다 넉넉히 작아야 한다.
     * @param clickEchoWindowMs  실제 up 이후 이 시간 안에 온 click/double_click 은 메아리로 보고 버린다.
     * @param stuckPointerMs     down 후 아무 소식이 없을 때 포인터를 강제로 취소하기까지의 시간.
     *                           선생님이 끊겼을 때 화면이 눌린 채로 굳는 것을 막는다.
     * @param clampToScreen      레터박스를 가리킨 좌표를 화면 안으로 접어 넣을지. false 면 버린다.
     */
    data class Config(
        val maxPointers: Int = 10,
        val maxQueuedCommands: Int = 256,
        val tapHoldMs: Long = 60,
        val doubleTapGapMs: Long = 170,
        val clickEchoWindowMs: Long = 1_000,
        val stuckPointerMs: Long = 6_000,
        val clampToScreen: Boolean = true
    )

    /** 화면 표시나 로깅에 쓰라고 열어둔 관찰 지점. 모두 메인 스레드에서 호출된다. */
    interface Listener {
        /** 터치가 실제로 주입된 직후. 좌표는 화면 픽셀. */
        fun onTouchInjected(action: String, screenX: Float, screenY: Float, pointerCount: Int) {}

        /** 주입에 쓰이지 않는 제스처 요약 메시지. 필요하면 여기서 직접 해석한다. */
        fun onGesture(message: JsonObject) {}

        /** 메시지를 버렸을 때. 좌표가 화면 밖이거나 핸들러가 꺼져 있는 경우 등. */
        fun onDropped(reason: String) {}
    }

    var listener: Listener? = null

    /**
     * false 면 들어오는 모든 입력을 조용히 버린다.
     * 통화 중이 아니거나 화면 공유가 꺼졌을 때, PiP 상태일 때 내려둔다.
     */
    @Volatile
    var isEnabled: Boolean = false
        set(value) {
            val was = field
            field = value
            if (was && !value) cancelAll("disabled")
        }

    /**
     * 지금 내보내고 있는 영상 프레임 크기. 좌표 복원의 기준이다.
     * null 이면 화면 크기를 그대로 쓴다(레터박스 보정 없음).
     *
     * `{ screenCaptureManager?.frameSize }` 처럼 매번 최신값을 읽는 람다를 넣어야 한다.
     * 화면 공유를 껐다 켜면 해상도가 바뀔 수 있다.
     */
    @Volatile
    var frameSizeProvider: (() -> Pair<Int, Int>?)? = null

    /**
     * 터치를 받을 View. null 이면 Activity 창 전체에 넣는다(기본).
     *
     * 특정 View 로 한정하면 그 View 밖의 좌표는 자연히 무시된다.
     * 좌표는 해당 View 의 화면상 위치를 빼서 지역 좌표로 변환된다.
     */
    @Volatile
    var targetViewProvider: (() -> View?)? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    /** 소켓 스레드와 메인 스레드가 함께 만지는 유일한 자료구조. */
    private val queue = ArrayDeque<Command>()
    private val queueLock = Any()
    private var flushScheduled = false

    /** 메인 스레드 전용 상태. 락 없이 접근한다. */
    private val activePointers = ArrayList<ActivePointer>(4)
    private var gestureDownTime = 0L
    private var lastEventTime = 0L
    private val recentUps = HashMap<Int, Long>()
    private var syntheticInFlight = false
    private var lastActivityUptime = 0L
    private var watchdogPosted = false

    private var cachedGeometry: CaptureGeometry? = null
    private val locationBuffer = IntArray(2)

    private var injectedCount = 0L
    private var droppedCount = 0L

    // =====================================================================
    // 진입점 — 소켓 스레드에서 호출된다
    // =====================================================================

    /**
     * 시그널링에서 받은 원본 JSON 문자열을 처리한다.
     * @return 이 핸들러가 소비한 메시지면 true. false 면 호출자가 다른 용도로 쓰면 된다.
     */
    fun handleMessage(rawJson: String): Boolean {
        val json = try {
            JsonParser.parseString(rawJson).takeIf { it.isJsonObject }?.asJsonObject
        } catch (e: Exception) {
            Log.w(TAG, "원격 입력 JSON 파싱 실패: ${e.message}")
            null
        } ?: return false
        return handleMessage(json)
    }

    /** 이미 파싱된 메시지를 처리한다. 호출자가 한 번 파싱했다면 이쪽이 낫다. */
    fun handleMessage(json: JsonObject): Boolean {
        return when (json.optString("type")) {
            TYPE_TOUCH -> {
                handleTouchMessage(json)
                true
            }
            TYPE_GESTURE -> {
                // 주입에는 쓰지 않는다. 클래스 주석의 판단 4번 참고.
                mainHandler.post { listener?.onGesture(json) }
                true
            }
            else -> false
        }
    }

    private fun handleTouchMessage(json: JsonObject) {
        if (!isEnabled) {
            droppedCount++
            return
        }

        val action = json.optString("action") ?: return
        val nx = json.optFloat("x") ?: return
        val ny = json.optFloat("y") ?: return
        if (!nx.isFinite() || !ny.isFinite()) return

        val remoteId = json.optInt("pointerId") ?: DEFAULT_REMOTE_POINTER_ID
        val pressure = json.optFloat("pressure") ?: DEFAULT_PRESSURE
        val toolType = toolTypeOf(json.optString("pointerType"))

        val command = when (action) {
            "down" -> Command.Touch(Kind.DOWN, remoteId, nx, ny, pressure, toolType)
            "move" -> Command.Touch(Kind.MOVE, remoteId, nx, ny, pressure, toolType)
            "up" -> Command.Touch(Kind.UP, remoteId, nx, ny, pressure, toolType)
            "cancel" -> Command.Touch(Kind.CANCEL, remoteId, nx, ny, pressure, toolType)
            "click" -> Command.Tap(remoteId, nx, ny, doubleTap = false, toolType = toolType)
            "double_click" -> Command.Tap(remoteId, nx, ny, doubleTap = true, toolType = toolType)
            else -> {
                Log.w(TAG, "알 수 없는 터치 동작: $action")
                return
            }
        }
        enqueue(command)
    }

    /** 눌려 있는 모든 포인터를 취소한다. 통화 종료, 화면 공유 중단, 앱 백그라운드 진입 시 호출한다. */
    fun cancelAll(reason: String = "cancel") {
        enqueue(Command.CancelAll(reason))
    }

    /** 핸들러를 완전히 정리한다. Activity 의 onDestroy 에서 부른다. */
    fun release() {
        isEnabled = false
        synchronized(queueLock) {
            queue.clear()
            flushScheduled = false
        }
        mainHandler.removeCallbacksAndMessages(null)
        // 남은 포인터는 메인 스레드에서만 정리할 수 있다.
        runOnMain {
            forceCancelActivePointers("release")
            recentUps.clear()
            syntheticInFlight = false
        }
    }

    /** 진단용 통계. */
    fun stats(): String = "injected=$injectedCount, dropped=$droppedCount, active=${activePointers.size}"

    // =====================================================================
    // 명령 큐 — 지연을 최소화하면서 순서를 지킨다
    // =====================================================================

    /**
     * 큐에 넣고 메인 스레드 드레인을 예약한다.
     *
     * move 병합이 핵심이다. 선생님 웹은 requestAnimationFrame 마다 move 를 보내므로
     * 초당 60개가 들어오는데, 메인 스레드가 한 번 밀리면 그만큼이 쌓이고 손가락이
     * 지나간 자취를 뒤늦게 되짚는 고무줄 현상이 생긴다. 같은 포인터의 연속된 move 는
     * 마지막 것만 의미가 있으므로 큐 끝에서 덮어쓴다. down/up 은 절대 병합하지 않는다.
     */
    private fun enqueue(command: Command) {
        synchronized(queueLock) {
            val last = queue.lastOrNull()
            if (command is Command.Touch && command.kind == Kind.MOVE &&
                last is Command.Touch && last.kind == Kind.MOVE &&
                last.remoteId == command.remoteId
            ) {
                queue.removeLast()
                droppedCount++
            }

            queue.addLast(command)

            // 그래도 넘치면 오래된 move 부터 버린다. down/up 은 상태를 바꾸므로 지킨다.
            if (queue.size > config.maxQueuedCommands) {
                val victim = queue.indexOfFirst { it is Command.Touch && it.kind == Kind.MOVE }
                if (victim >= 0) queue.removeAt(victim) else queue.removeFirst()
                droppedCount++
            }

            if (flushScheduled) return
            flushScheduled = true
        }
        mainHandler.post(flushRunnable)
    }

    private val flushRunnable = Runnable { drainQueue() }

    private fun drainQueue() {
        while (true) {
            val command = synchronized(queueLock) {
                val next = queue.removeFirstOrNull()
                if (next == null) flushScheduled = false
                next
            } ?: return

            try {
                execute(command)
            } catch (e: Exception) {
                Log.e(TAG, "원격 입력 처리 실패: ${e.message}", e)
            }
        }
    }

    private fun execute(command: Command) {
        when (command) {
            is Command.Touch -> when (command.kind) {
                Kind.DOWN -> onRemoteDown(command)
                Kind.MOVE -> onRemoteMove(command)
                Kind.UP -> onRemoteUp(command, cancelled = false)
                Kind.CANCEL -> onRemoteUp(command, cancelled = true)
            }
            is Command.Tap -> onRemoteTap(command)
            is Command.CancelAll -> forceCancelActivePointers(command.reason)
        }
    }

    // =====================================================================
    // 포인터 상태 기계 — 여기부터는 전부 메인 스레드
    // =====================================================================

    private fun onRemoteDown(cmd: Command.Touch) {
        val point = resolvePoint(cmd.nx, cmd.ny) ?: return

        // 같은 포인터가 up 없이 다시 down 하면 이동으로 본다. 네트워크로 up 이 유실됐을 때다.
        val existing = activePointers.find { it.remoteId == cmd.remoteId }
        if (existing != null) {
            existing.screenX = point.first
            existing.screenY = point.second
            existing.pressure = normalizePressure(cmd.pressure, down = true)
            dispatchPointerEvent(MotionEvent.ACTION_MOVE, "move")
            return
        }

        if (activePointers.size >= config.maxPointers) {
            drop("포인터 한도 초과(${config.maxPointers})")
            return
        }

        val now = uptimeNow()
        if (activePointers.isEmpty()) {
            // 새 제스처의 시작. downTime 은 제스처가 끝날 때까지 고정이어야 한다.
            gestureDownTime = now
            lastEventTime = now
        }

        val pointer = ActivePointer(
            androidId = allocatePointerId(),
            remoteId = cmd.remoteId,
            screenX = point.first,
            screenY = point.second,
            pressure = normalizePressure(cmd.pressure, down = true),
            toolType = cmd.toolType
        )
        val index = activePointers.size
        activePointers.add(pointer)

        val action = if (index == 0) {
            MotionEvent.ACTION_DOWN
        } else {
            MotionEvent.ACTION_POINTER_DOWN or (index shl MotionEvent.ACTION_POINTER_INDEX_SHIFT)
        }
        dispatchPointerEvent(action, if (index == 0) "down" else "pointer_down")
        armWatchdog()
    }

    private fun onRemoteMove(cmd: Command.Touch) {
        val pointer = activePointers.find { it.remoteId == cmd.remoteId }
        if (pointer == null) {
            // down 을 놓쳤다. 유령 move 로 뷰를 건드리는 것보다 버리는 편이 안전하다.
            drop("down 없는 move (pointerId=${cmd.remoteId})")
            return
        }
        val point = resolvePoint(cmd.nx, cmd.ny) ?: return
        pointer.screenX = point.first
        pointer.screenY = point.second
        pointer.pressure = normalizePressure(cmd.pressure, down = true)
        dispatchPointerEvent(MotionEvent.ACTION_MOVE, "move")
    }

    private fun onRemoteUp(cmd: Command.Touch, cancelled: Boolean) {
        val index = activePointers.indexOfFirst { it.remoteId == cmd.remoteId }
        if (index < 0) {
            drop("모르는 포인터의 up (pointerId=${cmd.remoteId})")
            return
        }
        val pointer = activePointers[index]

        // 마지막 좌표를 반영한다. 뷰는 up 지점을 보고 클릭 여부를 판정한다.
        resolvePoint(cmd.nx, cmd.ny)?.let {
            pointer.screenX = it.first
            pointer.screenY = it.second
        }
        // 손을 떼는 순간의 압력은 0 이 정상이다.
        pointer.pressure = 0f

        val action = when {
            cancelled && activePointers.size == 1 -> MotionEvent.ACTION_CANCEL
            activePointers.size == 1 -> MotionEvent.ACTION_UP
            // 여러 손가락 중 하나만 취소되는 경우는 ACTION_CANCEL 로 표현할 수 없다.
            // ACTION_CANCEL 은 제스처 전체를 무효화하기 때문이다. POINTER_UP 으로 낮춘다.
            else -> MotionEvent.ACTION_POINTER_UP or (index shl MotionEvent.ACTION_POINTER_INDEX_SHIFT)
        }

        dispatchPointerEvent(action, if (cancelled) "cancel" else "up")

        activePointers.removeAt(index)
        recentUps[cmd.remoteId] = uptimeNow()
        if (activePointers.isEmpty()) {
            gestureDownTime = 0L
            pruneRecentUps()
        }
    }

    /**
     * `click` / `double_click` 처리.
     *
     * 직전에 같은 포인터의 진짜 up 이 있었다면 그 down/up 이 이미 탭을 만들었다.
     * 여기서 또 만들면 두 번 눌린다. 더블클릭도 마찬가지로, 선생님 웹은 탭 두 번의
     * down/up 을 모두 보내므로 Android 의 GestureDetector 가 스스로 더블탭을 인식한다.
     */
    private fun onRemoteTap(cmd: Command.Tap) {
        val lastUp = recentUps[cmd.remoteId]
        val now = uptimeNow()
        if (lastUp != null && now - lastUp <= config.clickEchoWindowMs) {
            // 메아리. 판정 결과만 알려주고 주입하지 않는다.
            listener?.onTouchInjected(
                if (cmd.doubleTap) "double_click(echo)" else "click(echo)",
                0f, 0f, 0
            )
            return
        }

        if (activePointers.isNotEmpty()) {
            drop("다른 포인터가 눌린 중에는 탭을 합성하지 않는다")
            return
        }
        if (syntheticInFlight) {
            drop("합성 탭이 이미 진행 중")
            return
        }

        val point = resolvePoint(cmd.nx, cmd.ny) ?: return
        syntheticInFlight = true
        scheduleSyntheticTap(point.first, point.second, cmd.toolType, cmd.doubleTap)
    }

    /**
     * down/up 쌍을 시간 간격을 두고 주입한다.
     *
     * 같은 프레임에 down 과 up 을 붙여 넣으면 리플 애니메이션이 보이지 않고,
     * 일부 커스텀 뷰는 ACTION_DOWN 을 소비하기 전에 ACTION_UP 을 받아 클릭을 놓친다.
     */
    private fun scheduleSyntheticTap(x: Float, y: Float, toolType: Int, doubleTap: Boolean) {
        val id = SYNTHETIC_REMOTE_ID
        val gap = config.doubleTapGapMs
        val hold = config.tapHoldMs

        postTapDown(id, x, y, toolType, delay = 0)
        postTapUp(id, x, y, delay = hold)

        if (doubleTap) {
            postTapDown(id, x, y, toolType, delay = gap)
            postTapUp(id, x, y, delay = gap + hold)
            mainHandler.postDelayed({ syntheticInFlight = false }, gap + hold + 1)
        } else {
            mainHandler.postDelayed({ syntheticInFlight = false }, hold + 1)
        }
    }

    private fun postTapDown(remoteId: Int, x: Float, y: Float, toolType: Int, delay: Long) {
        val run = Runnable {
            if (!isEnabled) return@Runnable
            if (activePointers.isNotEmpty()) return@Runnable
            val now = uptimeNow()
            gestureDownTime = now
            lastEventTime = now
            activePointers.add(
                ActivePointer(
                    androidId = allocatePointerId(),
                    remoteId = remoteId,
                    screenX = x,
                    screenY = y,
                    pressure = DEFAULT_PRESSURE,
                    toolType = toolType
                )
            )
            dispatchPointerEvent(MotionEvent.ACTION_DOWN, "synthetic_down")
        }
        if (delay <= 0) run.run() else mainHandler.postDelayed(run, delay)
    }

    private fun postTapUp(remoteId: Int, x: Float, y: Float, delay: Long) {
        mainHandler.postDelayed({
            val index = activePointers.indexOfFirst { it.remoteId == remoteId }
            if (index < 0) return@postDelayed
            activePointers[index].apply {
                screenX = x
                screenY = y
                pressure = 0f
            }
            dispatchPointerEvent(MotionEvent.ACTION_UP, "synthetic_up")
            activePointers.removeAt(index)
            if (activePointers.isEmpty()) gestureDownTime = 0L
        }, delay)
    }

    /**
     * 눌린 채로 남은 포인터를 전부 취소한다.
     *
     * 이걸 빼먹으면 선생님 연결이 down 과 up 사이에서 끊겼을 때 뷰가 눌린 상태로
     * 굳어버리고, 아이가 화면을 만져도 반응하지 않는다.
     */
    private fun forceCancelActivePointers(reason: String) {
        if (activePointers.isEmpty()) return
        Log.d(TAG, "남은 포인터 ${activePointers.size}개 취소: $reason")
        dispatchPointerEvent(MotionEvent.ACTION_CANCEL, "cancel_all")
        activePointers.clear()
        gestureDownTime = 0L
        watchdogPosted = false
    }

    /** down 이후 응답이 끊긴 포인터를 회수하는 감시자. */
    private fun armWatchdog() {
        if (watchdogPosted) return
        watchdogPosted = true
        mainHandler.postDelayed(watchdogRunnable, WATCHDOG_INTERVAL_MS)
    }

    private val watchdogRunnable = object : Runnable {
        override fun run() {
            watchdogPosted = false
            if (activePointers.isEmpty()) return
            if (uptimeNow() - lastActivityUptime >= config.stuckPointerMs) {
                forceCancelActivePointers("무응답 ${config.stuckPointerMs}ms")
                return
            }
            watchdogPosted = true
            mainHandler.postDelayed(this, WATCHDOG_INTERVAL_MS)
        }
    }

    // =====================================================================
    // MotionEvent 조립과 주입
    // =====================================================================

    /**
     * 현재 포인터 집합으로 MotionEvent 를 만들어 주입한다.
     *
     * MotionEvent 하나는 그 순간 화면에 닿아 있는 **모든** 포인터를 담는다.
     * 포인터 하나가 움직여도 나머지의 현재 좌표를 함께 실어야 하며,
     * ACTION_POINTER_DOWN/UP 은 어느 포인터인지를 액션 상위 비트에 인덱스로 싣는다.
     * 이 규약을 어기면 ViewGroup 의 터치 대상 추적이 어긋나 이벤트가 사라진다.
     */
    private fun dispatchPointerEvent(action: Int, label: String) {
        val count = activePointers.size
        if (count == 0) return

        val target = targetViewProvider?.invoke()
        val offset = resolveTargetOffset(target)

        val properties = arrayOfNulls<MotionEvent.PointerProperties>(count)
        val coords = arrayOfNulls<MotionEvent.PointerCoords>(count)

        for (i in 0 until count) {
            val pointer = activePointers[i]
            properties[i] = MotionEvent.PointerProperties().apply {
                id = pointer.androidId
                toolType = pointer.toolType
            }
            coords[i] = MotionEvent.PointerCoords().apply {
                x = pointer.screenX - offset[0]
                y = pointer.screenY - offset[1]
                pressure = pointer.pressure
                // 접촉 면적. 손가락 굵기를 흉내 내는 값으로, 그림 앱 등이 참조한다.
                size = TOUCH_SIZE
                setAxisValue(MotionEvent.AXIS_TOUCH_MAJOR, TOUCH_MAJOR_PX)
                setAxisValue(MotionEvent.AXIS_TOUCH_MINOR, TOUCH_MAJOR_PX)
            }
        }

        // eventTime 은 downTime 이상이어야 하고 뒤로 갈 수 없다.
        // 같은 밀리초에 여러 이벤트가 몰리면 1ms 씩 밀어 단조성을 지킨다.
        val now = uptimeNow()
        val eventTime = if (now <= lastEventTime) lastEventTime + 1 else now
        lastEventTime = eventTime
        lastActivityUptime = eventTime
        if (gestureDownTime == 0L) gestureDownTime = eventTime

        val event = MotionEvent.obtain(
            gestureDownTime,
            eventTime,
            action,
            count,
            properties,
            coords,
            0,                                  // metaState
            0,                                  // buttonState
            1f,                                 // xPrecision
            1f,                                 // yPrecision
            0,                                  // deviceId — 가상 장치
            0,                                  // edgeFlags
            // 도구가 마우스여도 소스는 터치스크린으로 둔다. SOURCE_MOUSE 는 호버/버튼
            // 상태를 함께 요구하고, 뷰에 따라 클릭 처리 경로가 갈라진다.
            InputDevice.SOURCE_TOUCHSCREEN,
            0                                   // flags
        )

        try {
            val handled = if (target != null) {
                target.dispatchTouchEvent(event)
            } else {
                // Activity.dispatchTouchEvent 는 onUserInteraction 을 부르고
                // 창 전체(데코 뷰)로 내려보낸다. 실제 손가락과 가장 가까운 경로다.
                activity.dispatchTouchEvent(event)
            }
            injectedCount++
            if (!handled && action == MotionEvent.ACTION_DOWN) {
                Log.v(TAG, "아무도 소비하지 않은 터치: (${event.x}, ${event.y})")
            }
            listener?.onTouchInjected(label, activePointers[0].screenX, activePointers[0].screenY, count)
        } finally {
            // obtain 한 이벤트는 반드시 돌려준다. 안 하면 풀이 고갈된다.
            event.recycle()
        }
    }

    /** 대상 View 의 화면상 좌상단. 지역 좌표로 바꿀 때 뺀다. */
    private fun resolveTargetOffset(target: View?): IntArray {
        locationBuffer[0] = 0
        locationBuffer[1] = 0
        val view = target ?: activity.window?.peekDecorView()
        // 분할 화면·프리폼에서는 창이 화면 원점에 있지 않다. 전체 화면이면 (0,0) 이다.
        view?.getLocationOnScreen(locationBuffer)
        return locationBuffer
    }

    // =====================================================================
    // 좌표 변환
    // =====================================================================

    /**
     * 정규화 좌표(0~1, 프레임 기준) → 화면 픽셀.
     * 레터박스를 가리키면 [Config.clampToScreen] 에 따라 접거나 버린다.
     */
    private fun resolvePoint(nx: Float, ny: Float): Pair<Float, Float>? {
        val geometry = currentGeometry()

        if (!geometry.isInsideContent(nx, ny)) {
            if (!config.clampToScreen) {
                drop("화면 밖 좌표 ($nx, $ny)")
                return null
            }
        }
        return geometry.toSourceXClamped(nx) to geometry.toSourceYClamped(ny)
    }

    /**
     * 지금 유효한 캡처 기하를 돌려준다.
     *
     * 화면 크기는 회전할 때마다 바뀌고 프레임 크기는 캡처를 다시 시작할 때 바뀐다.
     * 둘 중 하나라도 달라지면 다시 만든다. 매 이벤트마다 만들지 않는 이유는
     * move 가 초당 60번 들어오기 때문이다.
     */
    private fun currentGeometry(): CaptureGeometry {
        val (sourceW, sourceH) = currentDisplaySize()
        val frame = frameSizeProvider?.invoke()
        val frameW = frame?.first ?: sourceW
        val frameH = frame?.second ?: sourceH

        val cached = cachedGeometry
        if (cached != null && cached.matches(sourceW, sourceH, frameW, frameH)) return cached

        return CaptureGeometry(sourceW, sourceH, frameW, frameH).also {
            cachedGeometry = it
            Log.d(TAG, "좌표 기준 갱신: $it (레터박스=${it.hasLetterbox})")
        }
    }

    /**
     * 현재 화면 크기.
     *
     * [com.studymeet.child.video.ScreenCaptureManager.resolveCaptureSize] 와 **같은 API** 를
     * 써야 한다. 한쪽이 `currentWindowMetrics`, 다른 쪽이 `getRealMetrics` 를 쓰면
     * 분할 화면에서 기준이 어긋나 터치가 통째로 밀린다.
     */
    private fun currentDisplaySize(): Pair<Int, Int> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = activity.windowManager.currentWindowMetrics.bounds
            bounds.width() to bounds.height()
        } else {
            val metrics = DisplayMetrics()
            @Suppress("DEPRECATION")
            (activity.getSystemService(Context.WINDOW_SERVICE) as WindowManager)
                .defaultDisplay.getRealMetrics(metrics)
            metrics.widthPixels to metrics.heightPixels
        }
    }

    // =====================================================================
    // 보조
    // =====================================================================

    /** 비어 있는 가장 작은 Android 포인터 id. 인덱스와 달리 제스처 내내 고정이다. */
    private fun allocatePointerId(): Int {
        var candidate = 0
        while (activePointers.any { it.androidId == candidate }) candidate++
        return candidate
    }

    private fun normalizePressure(raw: Float, down: Boolean): Float {
        if (!raw.isFinite()) return DEFAULT_PRESSURE
        val clamped = raw.coerceIn(0f, 1f)
        // 눌린 상태에서 압력 0 은 "떼어짐"으로 해석되는 뷰가 있다. 최소값을 준다.
        return if (down && clamped <= 0f) MIN_DOWN_PRESSURE else clamped
    }

    private fun toolTypeOf(pointerType: String?): Int = when (pointerType) {
        "pen" -> MotionEvent.TOOL_TYPE_STYLUS
        "mouse" -> MotionEvent.TOOL_TYPE_MOUSE
        else -> MotionEvent.TOOL_TYPE_FINGER
    }

    private fun pruneRecentUps() {
        if (recentUps.size < 16) return
        val cutoff = uptimeNow() - config.clickEchoWindowMs
        recentUps.entries.removeAll { it.value < cutoff }
    }

    private fun drop(reason: String) {
        droppedCount++
        if (droppedCount % 60 == 1L) Log.d(TAG, "원격 입력 버림: $reason")
        listener?.onDropped(reason)
    }

    private fun uptimeNow(): Long = SystemClock.uptimeMillis()

    private fun runOnMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else mainHandler.post(block)
    }

    // =====================================================================
    // 내부 자료형
    // =====================================================================

    private class ActivePointer(
        val androidId: Int,
        val remoteId: Int,
        var screenX: Float,
        var screenY: Float,
        var pressure: Float,
        val toolType: Int
    )

    private enum class Kind { DOWN, MOVE, UP, CANCEL }

    private sealed class Command {
        class Touch(
            val kind: Kind,
            val remoteId: Int,
            val nx: Float,
            val ny: Float,
            val pressure: Float,
            val toolType: Int
        ) : Command()

        class Tap(
            val remoteId: Int,
            val nx: Float,
            val ny: Float,
            val doubleTap: Boolean,
            val toolType: Int
        ) : Command()

        class CancelAll(val reason: String) : Command()
    }

    companion object {
        private const val TAG = "RemoteInputHandler"

        const val TYPE_TOUCH = "touch_input"
        const val TYPE_GESTURE = "gesture_input"

        /** pointerId 를 보내지 않는 송신자를 위한 기본 슬롯. */
        private const val DEFAULT_REMOTE_POINTER_ID = 0

        /** 합성 탭 전용 원격 id. 실제 브라우저 pointerId 와 겹치지 않도록 음수를 쓴다. */
        private const val SYNTHETIC_REMOTE_ID = -1

        private const val DEFAULT_PRESSURE = 1.0f
        private const val MIN_DOWN_PRESSURE = 0.05f

        /** 손끝 접촉 면적 흉내. 실제 기기값과 같은 자릿수면 충분하다. */
        private const val TOUCH_SIZE = 0.08f
        private const val TOUCH_MAJOR_PX = 24f

        private const val WATCHDOG_INTERVAL_MS = 2_000L
    }
}

// ---------------------------------------------------------------------------
// Gson 안전 접근자 — 필드가 없거나 타입이 다를 때 예외 대신 null 을 준다.
// 네트워크로 들어온 JSON 을 asString/asFloat 로 바로 까면 악의가 없어도 앱이 죽는다.
// ---------------------------------------------------------------------------

private fun JsonObject.optString(key: String): String? = try {
    get(key)?.takeIf { it.isJsonPrimitive }?.asString
} catch (e: Exception) {
    null
}

private fun JsonObject.optFloat(key: String): Float? = try {
    get(key)?.takeIf { it.isJsonPrimitive }?.asFloat
} catch (e: Exception) {
    null
}

private fun JsonObject.optInt(key: String): Int? = try {
    get(key)?.takeIf { it.isJsonPrimitive }?.asInt
} catch (e: Exception) {
    null
}
