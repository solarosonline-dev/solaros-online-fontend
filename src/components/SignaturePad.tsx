import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import "./SignaturePad.css";

export type SignaturePadHandle = {
  /** `null` if nothing has been drawn yet. */
  toDataUrl: () => string | null;
  clear: () => void;
};

type Point = { x: number; y: number };

function pointFromEvent(canvas: HTMLCanvasElement, e: React.PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** A minimal canvas-based signature pad — no external drawing library. Draws
 * in device pixels (scaled by devicePixelRatio) so the exported PNG stays
 * crisp regardless of the CSS display size. */
const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (hasSignature: boolean) => void; disabled?: boolean }>(
  function SignaturePad({ onChange, disabled }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const hasSignatureRef = useRef(false);
    const [hasSignature, setHasSignature] = useState(false);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111";
    }, []);

    function setSigned(v: boolean) {
      hasSignatureRef.current = v;
      setHasSignature(v);
      onChange?.(v);
    }

    function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      if (disabled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      const ctx = canvas.getContext("2d")!;
      const p = pointFromEvent(canvas, e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }

    function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current || disabled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      const p = pointFromEvent(canvas, e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (!hasSignatureRef.current) setSigned(true);
    }

    function handlePointerUp() {
      drawingRef.current = false;
    }

    function handleClear() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSigned(false);
    }

    useImperativeHandle(ref, () => ({
      toDataUrl: () => (hasSignatureRef.current && canvasRef.current ? canvasRef.current.toDataURL("image/png") : null),
      clear: handleClear,
    }));

    return (
      <div className="sigpad">
        <canvas
          ref={canvasRef}
          className={`sigpad-canvas${disabled ? " sigpad-canvas--disabled" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {!hasSignature && <span className="sigpad-placeholder">Sign here</span>}
        <button type="button" className="sigpad-clear" onClick={handleClear} disabled={disabled || !hasSignature}>
          Clear
        </button>
      </div>
    );
  },
);

export default SignaturePad;
