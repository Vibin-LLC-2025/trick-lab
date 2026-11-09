/** A button with aria-pressed, drawn as a switch (`.toggle`, DESIGN.md 9.5). `name` overrides the visible label as the accessible name. */
export function Toggle({
  label,
  name,
  pressed,
  keys,
  onClick,
}: {
  label: string;
  name?: string;
  pressed: boolean;
  keys?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`toggle${pressed ? ' toggle--on' : ''}`}
      aria-pressed={pressed}
      aria-label={name}
      aria-keyshortcuts={keys}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
