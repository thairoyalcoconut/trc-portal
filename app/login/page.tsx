import { signIn, signUp } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string; mode?: string };
}) {
  const isSignup = searchParams.mode === "signup";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-brand-700">TRC Portal</h1>
          <p className="mt-1 text-sm text-gray-500">
            Thai Royal Coconut Co., Ltd. — internal use only
          </p>
        </div>

        {searchParams.message && (
          <div className="mb-4 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">
            {searchParams.message}
          </div>
        )}
        {searchParams.error && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {!isSignup ? (
            <form action={signIn} className="space-y-4">
              <Field label="Email" name="email" type="email" required />
              <Field label="Password" name="password" type="password" required />
              <button
                type="submit"
                className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Sign in
              </button>
            </form>
          ) : (
            <form action={signUp} className="space-y-4">
              <Field label="Full name" name="full_name" type="text" required />
              <Field label="Email" name="email" type="email" required />
              <Field label="Password" name="password" type="password" required minLength={6} />
              <button
                type="submit"
                className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Create account
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-sm text-gray-500">
            {!isSignup ? (
              <>
                New here?{" "}
                <a href="/login?mode=signup" className="text-brand-600 hover:underline">
                  Create an account
                </a>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <a href="/login" className="text-brand-600 hover:underline">
                  Sign in
                </a>
              </>
            )}
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          New accounts start unassigned — an admin must set your department
          before you can see any data.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type,
  required,
  minLength,
}: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </label>
  );
}
