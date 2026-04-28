import { useRef, useState, useCallback, useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

/**
 * DraggableVideoBubble — wraps a child (video stream circle) and makes it
 * freely draggable + resizable within its container.
 *
 * Props:
 *  - children: the bubble content (StreamCircle, emoji fallback, etc.)
 *  - initialPosition: { x, y } in pixels from top-left of container
 *  - initialSize: number (diameter in pixels), default 64
 *  - minSize / maxSize: number constraints
 *  - containerRef: ref to the bounding container element
 *  - className: extra classNames
 *  - style: extra inline styles
 *  - bubbleId: unique id for this bubble
 *  - onPositionChange: (bubbleId, {x, y, size}) => void
 */
const DraggableVideoBubble = ({
  children,
  initialPosition,
  initialSize = 64,
  minSize = 48,
  maxSize = 200,
  containerRef,
  className = "",
  style = {},
  bubbleId,
  onPositionChange,
}) => {
  const bubbleRef = useRef(null);
  const [pos, setPos] = useState(initialPosition || { x: 20, y: 80 });
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [showResizeHandle, setShowResizeHandle] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef({ y: 0, size: 0 });

  // Clamp position within container bounds
  const clampPosition = useCallback(
    (x, y, currentSize) => {
      const container = containerRef?.current;
      if (!container) return { x, y };
      const rect = container.getBoundingClientRect();
      const maxX = rect.width - currentSize;
      const maxY = rect.height - currentSize;
      return {
        x: Math.max(0, Math.min(maxX, x)),
        y: Math.max(0, Math.min(maxY, y)),
      };
    },
    [containerRef]
  );

  // --- Drag handlers ---
  const onDragStart = useCallback(
    (e) => {
      // Don't start drag from resize handle
      if (e.target.closest("[data-resize-handle]")) return;
      e.preventDefault();
      e.stopPropagation();

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      dragStartRef.current = {
        x: clientX,
        y: clientY,
        posX: pos.x,
        posY: pos.y,
      };
      setIsDragging(true);
    },
    [pos]
  );

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = clientX - dragStartRef.current.x;
      const dy = clientY - dragStartRef.current.y;
      const newPos = clampPosition(
        dragStartRef.current.posX + dx,
        dragStartRef.current.posY + dy,
        size
      );
      setPos(newPos);
    };

    const onEnd = () => {
      setIsDragging(false);
      onPositionChange?.(bubbleId, { ...pos, size });
    };

    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [isDragging, size, clampPosition, bubbleId, pos, onPositionChange]);

  // --- Resize handlers ---
  const onResizeStart = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      resizeStartRef.current = { y: clientY, size };
      setIsResizing(true);
    },
    [size]
  );

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e) => {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dy = clientY - resizeStartRef.current.y;
      // Dragging down = bigger, up = smaller
      const newSize = Math.max(
        minSize,
        Math.min(maxSize, resizeStartRef.current.size + dy)
      );
      setSize(newSize);
      // Re-clamp position with new size
      setPos((prev) => clampPosition(prev.x, prev.y, newSize));
    };

    const onEnd = () => {
      setIsResizing(false);
      onPositionChange?.(bubbleId, { ...pos, size });
    };

    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [isResizing, minSize, maxSize, clampPosition, bubbleId, pos, onPositionChange]);

  // Quick resize toggle: tap the icon to cycle between small/medium/large
  const handleQuickResize = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sizes = [minSize, Math.round((minSize + maxSize) / 2), maxSize];
      const currentIdx = sizes.findIndex((s) => Math.abs(s - size) < 10);
      const nextIdx = (currentIdx + 1) % sizes.length;
      const newSize = sizes[nextIdx];
      setSize(newSize);
      setPos((prev) => clampPosition(prev.x, prev.y, newSize));
      onPositionChange?.(bubbleId, { ...pos, size: newSize });
    },
    [size, minSize, maxSize, clampPosition, bubbleId, pos, onPositionChange]
  );

  return (
    <div
      ref={bubbleRef}
      className={`absolute z-30 select-none ${className}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: size,
        height: size,
        cursor: isDragging ? "grabbing" : "grab",
        transition: isDragging || isResizing ? "none" : "box-shadow 0.2s ease",
        touchAction: "none",
        ...style,
      }}
      onMouseDown={onDragStart}
      onTouchStart={onDragStart}
      onMouseEnter={() => setShowResizeHandle(true)}
      onMouseLeave={() => {
        if (!isResizing) setShowResizeHandle(false);
      }}
    >
      {/* Bubble content — full size circle */}
      <div
        className="w-full h-full rounded-full overflow-hidden"
        style={{
          boxShadow: isDragging
            ? "0 0 0 3px hsl(var(--primary) / 0.6), 0 8px 24px rgba(0,0,0,0.4)"
            : "0 0 0 2px hsl(var(--background) / 0.6), 0 4px 12px rgba(0,0,0,0.5)",
        }}
      >
        {children}
      </div>

      {/* Resize handle — bottom-right corner, visible on hover/touch */}
      {(showResizeHandle || isResizing) && (
        <div
          data-resize-handle
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card/90 backdrop-blur border border-glass-border flex items-center justify-center cursor-nwse-resize hover:bg-primary/20 transition-colors"
          onMouseDown={onResizeStart}
          onTouchStart={onResizeStart}
          onDoubleClick={handleQuickResize}
          title="Drag to resize, double-click to cycle sizes"
        >
          {size > (minSize + maxSize) / 2 ? (
            <Minimize2 className="w-3 h-3 text-muted-foreground" />
          ) : (
            <Maximize2 className="w-3 h-3 text-muted-foreground" />
          )}
        </div>
      )}
    </div>
  );
};

export default DraggableVideoBubble;
