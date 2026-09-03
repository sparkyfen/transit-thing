import type { Lateness as Value } from '../transit/delay';

const MAX_MINUTES = 999;

export function latenessText(value: Value): { label: string; glyph: string; late: boolean } | null {
  if (!value) return null;
  const minutes = Math.min(MAX_MINUTES, value.minutes);
  const late = value.kind === 'late';
  const unit = minutes === 1 ? 'minute' : 'minutes';
  return { label: `Running ${minutes} ${unit} ${late ? 'late' : 'early'}`, glyph: `${late ? '+' : '-'}${minutes} min`, late };
}

// early is good news, so it reads in the live color; late reads as a warning
export function Lateness({ value }: { value: Value }) {
  const text = latenessText(value);
  return (
    <span className={`w-[4rem] text-right font-mono text-body whitespace-nowrap ${text?.late ? 'text-warn' : 'text-ok'}`}>
      {text ? (
        <>
          <span className="sr-only">{text.label}</span>
          <span aria-hidden="true">{text.glyph}</span>
        </>
      ) : null}
    </span>
  );
}
