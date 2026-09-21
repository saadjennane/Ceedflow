import { useRef } from 'react';
import { Icon } from './Icon';

/**
 * The one search field of the back office. It carries a clear button as soon as
 * there is something to clear — going back to the whole list used to mean
 * selecting the text and deleting it, which is a lot of work to undo a filter.
 *
 * The button only appears once something is typed, so an empty field stays the
 * plain box it looks like.
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  onFocus,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** What a screen reader announces. Falls back to the placeholder. */
  label?: string;
  onFocus?: () => void;
  style?: React.CSSProperties;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="search" style={style}>
      <Icon name="search" size={14} />
      <input
        ref={input}
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        // Escape clears without reaching for the mouse, which is what the key
        // does in every other search field they use.
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
      />
      {value && (
        <button
          type="button"
          className="clear"
          aria-label="Clear the search"
          title="Clear"
          // Typing usually carries on right after, so the cursor stays put.
          onClick={() => {
            onChange('');
            input.current?.focus();
          }}
        >
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}
