package com.studymeet.teacher.overlay

import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View

class DrawingView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    data class Stroke(val path: Path, val paint: Paint)

    private val strokes = mutableListOf<Stroke>()
    private var currentPath: Path? = null
    private var currentPaint: Paint? = null
    private var drawingEnabled = false
    private var currentPoints = mutableListOf<Pair<Float, Float>>()

    var penColor: Int = Color.parseColor("#4ECDC4")
    var penWidth: Float = 4f

    var onStrokeCompleted: ((List<Pair<Float, Float>>, Int, Float) -> Unit)? = null

    init {
        setBackgroundColor(Color.TRANSPARENT)
    }

    fun setDrawingEnabled(enabled: Boolean) {
        drawingEnabled = enabled
    }

    fun clear() {
        strokes.clear()
        invalidate()
    }

    fun addExternalStroke(points: List<Pair<Float, Float>>, color: Int, strokeWidth: Float) {
        if (points.size < 2) return
        val path = Path()
        path.moveTo(points[0].first * width, points[0].second * height)
        for (i in 1 until points.size) {
            path.lineTo(points[i].first * width, points[i].second * height)
        }
        val paint = Paint().apply {
            this.color = color
            this.strokeWidth = strokeWidth * resources.displayMetrics.density
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            isAntiAlias = true
        }
        strokes.add(Stroke(path, paint))
        invalidate()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (!drawingEnabled) return false

        val nx = event.x / width.toFloat()
        val ny = event.y / height.toFloat()

        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                currentPaint = Paint().apply {
                    color = penColor
                    strokeWidth = penWidth * resources.displayMetrics.density
                    style = Paint.Style.STROKE
                    strokeCap = Paint.Cap.ROUND
                    strokeJoin = Paint.Join.ROUND
                    isAntiAlias = true
                }
                currentPath = Path().apply { moveTo(event.x, event.y) }
                currentPoints = mutableListOf(Pair(nx, ny))
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                currentPath?.lineTo(event.x, event.y)
                currentPoints.add(Pair(nx, ny))
                invalidate()
                return true
            }
            MotionEvent.ACTION_UP -> {
                currentPath?.let { path ->
                    currentPaint?.let { paint ->
                        strokes.add(Stroke(path, paint))
                    }
                }
                onStrokeCompleted?.invoke(currentPoints.toList(), penColor, penWidth)
                currentPath = null
                currentPaint = null
                currentPoints.clear()
                invalidate()
                return true
            }
        }
        return false
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        for (stroke in strokes) {
            canvas.drawPath(stroke.path, stroke.paint)
        }
        // Draw current in-progress stroke
        currentPath?.let { path ->
            currentPaint?.let { paint ->
                canvas.drawPath(path, paint)
            }
        }
    }
}
