import { useMemo } from 'preact/hooks';
import { shapes, svgMarkup, type Pose, type Prop } from '../domain/figure';

/**
 * Renders the Atlas figure in a pose, with its equipment, in the current text color (so it follows
 * any palette). The markup comes from domain/figure, the same as the review pages.
 */
export function Pictogram({ pose, props, size = 28, label }: { pose: Pose; props?: Prop[]; size?: number; label?: string }) {
  const html = useMemo(() => svgMarkup(shapes(pose, props), size, label), [pose, props, size, label]);
  return <span class="pictogram-box" dangerouslySetInnerHTML={{ __html: html }} />;
}
