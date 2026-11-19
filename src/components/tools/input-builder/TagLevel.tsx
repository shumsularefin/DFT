import TagVisual from './TagVisual';
import { useLevel } from './hooks';

/** TagVisual that follows the site reading level (for the MDX component). */
export function TagLevel({ tag, value }: { tag: string; value?: string }) {
  const level = useLevel();
  return <TagVisual tag={tag} value={value ?? ''} level={level} />;
}
