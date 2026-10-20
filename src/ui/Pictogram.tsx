import { shapes, viewBox, type Pose, type Prop, type Shape } from '../domain/figure';

/**
 * Renders the Atlas figure in a pose, with its equipment. The body is bold, the far limbs and
 * equipment quieter, all in the current text color, so it follows any palette.
 */

const STROKE = { body: 2.7, far: 2.7, prop: 1.5, head: 0 } as const;

function render(shape: Shape, index: number) {
  const common = {
    key: index,
    class: `pg-${shape.layer}`,
  };
  if (shape.kind === 'line') {
    return <polyline {...common} points={shape.points!.map((p) => p.join(',')).join(' ')} stroke-width={STROKE[shape.layer]} />;
  }
  if (shape.kind === 'circle') {
    return <circle {...common} cx={shape.center![0]} cy={shape.center![1]} r={shape.r} stroke-width={shape.layer === 'head' ? 0 : STROKE.prop} />;
  }
  const [cx, cy] = shape.center!;
  // Figure angles have 0 = down; an SVG rect lies along +x, which is 90, so turn it by (90 - angle).
  return (
    <rect
      {...common}
      x={cx - shape.length! / 2}
      y={cy - shape.width! / 2}
      width={shape.length}
      height={shape.width}
      rx={Math.min(1.1, shape.width! / 2)}
      transform={`rotate(${90 - shape.angle!} ${cx} ${cy})`}
      stroke-width={STROKE.prop}
    />
  );
}

export function Pictogram({ pose, props, size = 28, label }: { pose: Pose; props?: Prop[]; size?: number; label?: string }) {
  const list = shapes(pose, props);
  return (
    <svg
      class="pictogram"
      width={size}
      height={size}
      viewBox={viewBox(list).join(' ')}
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
    >
      {list.map(render)}
    </svg>
  );
}
