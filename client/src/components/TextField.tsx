import { InputHTMLAttributes, forwardRef, useId } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, Props>(({ label, error, id, className = "", ...props }, ref) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={`rounded-lg border px-3 py-2 text-base focus-visible:outline outline-2 outline-offset-1 ${
          error ? "border-red-400 outline-red-500" : "border-slate-300 outline-brand-500"
        } ${className}`}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
});
TextField.displayName = "TextField";
