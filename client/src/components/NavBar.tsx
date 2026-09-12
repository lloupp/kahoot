import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./Button";

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3" aria-label="Main navigation">
        <Link to="/" className="text-lg font-bold text-brand-700">
          QuizArena
        </Link>
        {user ? (
          <div className="flex items-center gap-4 text-sm">
            <Link to="/dashboard" className="text-slate-600 hover:text-brand-700">
              My quizzes
            </Link>
            <Link to="/history" className="text-slate-600 hover:text-brand-700">
              History
            </Link>
            <span className="hidden text-slate-400 sm:inline">{user.name}</span>
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              Log out
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:text-brand-700">
              Teacher login
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
