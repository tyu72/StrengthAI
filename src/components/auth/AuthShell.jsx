import { Link } from 'react-router-dom'
import logo from '@/assets/logo.png'

export function AuthShell({
  title,
  subtitle,
  fields,
  submitLabel,
  submitting,
  message,
  error,
  onSubmit,
  links,
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background px-[26px] pt-[60px] pb-10 text-foreground">
      <img src={logo} alt="StrengthAI" className="mb-[26px] h-[52px] w-[52px] rounded-2xl object-cover" />

      <h1 className="text-[27px] font-bold leading-[1.15] tracking-[-0.03em]">{title}</h1>
      <p className="mt-[7px] text-[13.5px] leading-[1.5] text-muted-foreground">{subtitle}</p>

      <form onSubmit={onSubmit} className="mt-[26px] flex flex-col gap-[10px]">
        {fields.map((f) => (
          <div key={f.name} className="rounded-[14px] border border-border bg-card px-[14px] py-[11px]">
            <label
              htmlFor={f.name}
              className="block text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground"
            >
              {f.label}
            </label>
            <input
              id={f.name}
              name={f.name}
              type={f.type}
              value={f.value}
              onChange={f.onChange}
              placeholder={f.placeholder}
              autoComplete={f.autoComplete}
              required
              className="mt-1 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        ))}

        {error ? (
          <p className="mt-3 text-[12.5px] leading-[1.5] text-destructive">{error}</p>
        ) : message ? (
          <p className="mt-3 text-[12.5px] leading-[1.5] text-primary">{message}</p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-[18px] w-full rounded-[14px] bg-primary py-[15px] text-center text-[14.5px] font-bold text-primary-foreground disabled:opacity-60"
        >
          {submitting ? '…' : submitLabel}
        </button>
      </form>

      <div className="flex-1" />

      <div className="mt-[26px] flex flex-col items-center gap-[9px]">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="text-center text-[12.5px] text-muted-foreground">
            {l.pre}
            <span className="font-semibold text-primary">{l.text}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
