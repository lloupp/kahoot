import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { buttonClasses } from "../components/Button";

export function Landing() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-4 py-16 text-center">
      <div>
        <h1 className="text-4xl font-extrabold text-brand-800 sm:text-5xl">QuizArena</h1>
        <p className="mt-3 text-lg text-slate-600">Live quiz games for the classroom, in real time.</p>
      </div>
      <div className="grid w-full gap-6 sm:grid-cols-2">
        <Card className="flex flex-col items-center gap-4">
          <h2 className="text-xl font-semibold">I&apos;m playing</h2>
          <p className="text-sm text-slate-500">Got a game PIN from your teacher? Jump in.</p>
          <Link to="/join" className={buttonClasses("primary", "lg", "w-full")}>
            Enter game PIN
          </Link>
        </Card>
        <Card className="flex flex-col items-center gap-4">
          <h2 className="text-xl font-semibold">I&apos;m teaching</h2>
          <p className="text-sm text-slate-500">Create quizzes and host live games for your students.</p>
          <Link to="/login" className={buttonClasses("secondary", "lg", "w-full")}>
            Teacher login
          </Link>
        </Card>
      </div>
    </div>
  );
}
