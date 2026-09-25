import { useTheme, type ThemePreference } from '../app/theme-context';

const options: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className="flex gap-1 rounded-md border border-border bg-surface p-1">
      <legend className="sr-only">Tema</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="cursor-pointer rounded-sm px-3 py-1.5 text-sm text-muted transition has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-2 has-focus-visible:outline-primary"
        >
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={preference === option.value}
            onChange={() => setPreference(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
