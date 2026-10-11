"use client";

import { useEffect, useRef, type CanvasHTMLAttributes, type RefObject } from "react";
import { Renderer, type RendererHooks, type Scene } from "@/lib/render/renderer";

export interface BoardApi {
  /** Cell under a viewport point, or -1 off the board. */
  cellAt(clientX: number, clientY: number): number;
  /** Hexagon circumradius in CSS pixels. */
  unit(): number;
  focus(): void;
}

type CanvasProps = Omit<CanvasHTMLAttributes<HTMLCanvasElement>, "ref" | "children">;

interface Props extends CanvasProps {
  scene: Scene;
  hooks?: RendererHooks;
  apiRef?: RefObject<BoardApi | null>;
}

/**
 * The canvas and its renderer. All input handling is passed straight through
 * as canvas props, so the game and the editor can each bring their own.
 */
export function Board({ scene, hooks, apiRef, className, ...canvasProps }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const hooksRef = useRef(hooks);
  const sceneRef = useRef(scene);

  useEffect(() => {
    hooksRef.current = hooks;
  }, [hooks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: Renderer;
    try {
      renderer = new Renderer(canvas, {
        onTargetLit: (lit, total) => hooksRef.current?.onTargetLit?.(lit, total),
        onWinStart: () => hooksRef.current?.onWinStart?.(),
        onWinEnd: () => hooksRef.current?.onWinEnd?.(),
      });
    } catch {
      return; // No 2D canvas: the text description below the board still works.
    }
    rendererRef.current = renderer;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotion = () => renderer.setReducedMotion(motion.matches);
    applyMotion();
    motion.addEventListener("change", applyMotion);

    renderer.setScene(sceneRef.current);
    renderer.resize();
    const observer = new ResizeObserver(() => renderer.resize());
    observer.observe(canvas);
    // A change of zoom or a move to another screen changes the pixel ratio without a resize.
    window.addEventListener("resize", applyResize);
    function applyResize() {
      renderer.resize();
    }

    if (apiRef) {
      apiRef.current = {
        cellAt: (x, y) => renderer.cellAt(x, y),
        unit: () => renderer.unit,
        focus: () => canvas.focus(),
      };
    }
    return () => {
      motion.removeEventListener("change", applyMotion);
      window.removeEventListener("resize", applyResize);
      observer.disconnect();
      renderer.destroy();
      rendererRef.current = null;
      if (apiRef) apiRef.current = null;
    };
  }, [apiRef]);

  useEffect(() => {
    sceneRef.current = scene;
    rendererRef.current?.setScene(scene);
  }, [scene]);

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      className={`board-focus block h-full w-full touch-none select-none ${className ?? ""}`}
      {...canvasProps}
    />
  );
}
