type Props = {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Separate required confirmation that the person is 18 or older. */
  ageChecked: boolean;
  onAgeChange: (value: boolean) => void;
};

// Required, initially unchecked consent for registration. Links open in a new
// tab so the person does not lose the form they are filling in.
export default function ConsentCheckbox({ checked, onChange, ageChecked, onAgeChange }: Props) {
  const link = "text-white underline underline-offset-2 hover:text-white/80";
  return (
    <div className="flex flex-col gap-3">
    <label className="flex items-start gap-3 text-sm text-white/75 leading-relaxed cursor-pointer">
      <input
        type="checkbox"
        checked={ageChecked}
        onChange={(e) => onAgeChange(e.target.checked)}
        required
        className="mt-1 h-5 w-5 shrink-0 accent-white cursor-pointer"
      />
      <span>Мені виповнилося 18 років</span>
    </label>
    <label className="flex items-start gap-3 text-sm text-white/75 leading-relaxed cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
        className="mt-1 h-5 w-5 shrink-0 accent-white cursor-pointer"
      />
      <span>
        Я прочитав(-ла) і приймаю{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className={link}>
          Умови використання
        </a>{" "}
        та{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className={link}>
          Політику конфіденційності
        </a>
      </span>
    </label>
    </div>
  );
}
