import { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 ${className}`} {...props} />;
}
