import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-3xl font-bold text-slate-900">Page not found</h1>
      <p className="text-slate-500">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link to="/" className="font-medium text-brand-700 hover:underline">
        Back home
      </Link>
    </div>
  );
}
