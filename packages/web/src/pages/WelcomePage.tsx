import { Link } from 'react-router-dom';

export default function WelcomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="mb-4 text-4xl font-bold">SelfTax</h1>
      <p className="mb-8 text-lg text-gray-600">
        Free AI-powered tax preparation. Your data stays on your device.
      </p>
      <Link
        to="/profile"
        className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
      >
        Get Started
      </Link>
    </div>
  );
}
