export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">e-agent</h1>
        <p className="text-gray-400 text-lg mb-8">
          Per-employee autonomous agents for enterprise
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/demo"
            className="bg-white text-black px-6 py-3 rounded-lg font-medium hover:bg-gray-200 transition"
          >
            Launch Demo
          </a>
        </div>
      </div>
    </main>
  );
}
