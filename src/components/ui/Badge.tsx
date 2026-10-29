import './Badge.css';
import { BADGE_LABELS, BADGE_SHAPES, type BadgeVariant } from '../../lib/badges';

/** React twin of Badge.astro, for islands. */
export default function Badge({ variant }: { variant: BadgeVariant }) {
  return (
    <span className={`badge badge-${variant}`}>
      <svg
        viewBox="0 0 12 12"
        width="12"
        height="12"
        aria-hidden="true"
        focusable="false"
        dangerouslySetInnerHTML={{ __html: BADGE_SHAPES[variant] }}
      />
      {BADGE_LABELS[variant]}
    </span>
  );
}
