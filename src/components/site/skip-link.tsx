/**
 * Keyboard-visible skip-to-content link. Hidden until focused (Tab), then
 * appears top-left. The first keyboard action on any page reveals it.
 */
export function SkipLink({ target = "main-content" }: { target?: string }) {
  return (
    <a href={`#${target}`} className="skip-link">
      Skip to content
    </a>
  );
}
