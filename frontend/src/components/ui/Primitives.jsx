import { Loader2, AlertTriangle } from 'lucide-react'

export function Card({ title, subtitle, icon: Icon, action, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || subtitle || action) && (
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {Icon && <Icon size={16} className="text-slate-400" />}
              <div>
                {title && <h3 className="text-sm font-semibold text-slate-700">{title}</h3>}
                {subtitle && <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{subtitle}</p>}
              </div>
            </div>
            {action}
          </div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

export function Select({ value, onChange, options, disabled }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700
                 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
                 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export function RangeSlider({ value, min, max, step, onChange, formatValue, disabled }) {
  return (
    <div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-600 disabled:accent-slate-300"
      />
      <div className="mt-0.5 flex justify-between text-[11px] text-slate-400">
        <span>{formatValue ? formatValue(min) : min}</span>
        <span className="font-semibold text-slate-600">{formatValue ? formatValue(value) : value}</span>
        <span>{formatValue ? formatValue(max) : max}</span>
      </div>
    </div>
  )
}

export function ToggleGroup({ value, onChange, options, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function PrimaryButton({ children, onClick, disabled, loading, icon: Icon, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2
                  text-sm font-semibold text-white transition-colors hover:bg-blue-700
                  disabled:cursor-not-allowed disabled:bg-slate-300 ${className}`}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon && <Icon size={16} />}
      {children}
    </button>
  )
}

export function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <AlertTriangle size={16} className="shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function StatPill({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

export function EmptyState({ message }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">
      {message}
    </div>
  )
}
