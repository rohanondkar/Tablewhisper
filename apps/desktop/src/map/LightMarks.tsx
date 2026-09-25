import { useEffect, useRef } from "react";
import { Group, Shape } from "react-konva";
import Konva from "konva";
import type { MapLight } from "../api";

type Props = {
  lights: MapLight[];
  selectedId: string | null;
  draggable: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
};

/** Torch flickers and its glow breathes. A lamp stays a steady glass halo. */
export function LightMarks({ lights, selectedId, draggable, onSelect, onDragEnd }: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const hasTorch = lights.some((light) => (light.kind || "torch") !== "lamp");

  useEffect(() => {
    const layer = groupRef.current?.getLayer();
    if (!layer || !hasTorch) return;
    const anim = new Konva.Animation(() => undefined, layer);
    anim.start();
    return () => {
      anim.stop();
    };
  }, [hasTorch, lights.length]);

  return (
    <Group ref={groupRef}>
      {lights.map((light) => (
        <Shape
          key={light.id}
          x={light.x}
          y={light.y}
          draggable={draggable}
          onMouseDown={(ev) => {
            ev.cancelBubble = true;
          }}
          onClick={(ev) => {
            ev.cancelBubble = true;
            onSelect(light.id);
          }}
          onDragStart={(ev) => {
            ev.cancelBubble = true;
          }}
          onDragEnd={(ev) => {
            ev.cancelBubble = true;
            onDragEnd(light.id, ev.target.x(), ev.target.y());
          }}
          sceneFunc={(context, shape) => {
            const ctx = (context as unknown as { _context: CanvasRenderingContext2D })._context;
            paintLight(ctx, light.kind === "lamp" ? "lamp" : "torch", selectedId === light.id);
            context.fillStrokeShape(shape);
          }}
          hitFunc={(context, shape) => {
            context.beginPath();
            context.arc(0, 0, 16, 0, Math.PI * 2);
            context.fillStrokeShape(shape);
          }}
        />
      ))}
    </Group>
  );
}

function paintLight(ctx: CanvasRenderingContext2D, kind: "torch" | "lamp", selected: boolean) {
  const t = performance.now() / 1000;
  ctx.save();
  if (kind === "lamp") {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#ffe7a3";
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#fff6d0";
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = selected ? "#fff" : "#e7d7a4";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const flick = 0.86 + Math.sin(t * 11) * 0.08 + Math.sin(t * 17) * 0.04;
  const lean = Math.sin(t * 9) * 1.8;
  ctx.globalAlpha = 0.28 * flick;
  ctx.fillStyle = "#ff9a3c";
  ctx.beginPath();
  ctx.ellipse(lean * 0.2, 1, 11 * flick, 8 * flick, 0, 0, Math.PI * 2);
  ctx.fill();
  const tongues: Array<[string, number, number]> = [
    ["#ff4d1a", 5.2, 0],
    ["#ffb020", 3.6, 0.6],
    ["#fff4c4", 1.8, 0.2],
  ];
  tongues.forEach(([color, width, shift], index) => {
    const height = (12 + Math.sin(t * 13 + index) * 2.4) * flick;
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(lean * 0.35 + shift, -height * 0.28, width * flick, height * 0.42, lean * 0.04, 0, Math.PI * 2);
    ctx.fill();
  });
  if (selected) {
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, -2, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
