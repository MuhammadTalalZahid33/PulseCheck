export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-up-400">
          ●
        </span>
        <span className="font-mono text-sm tracking-wide text-mute-200">PulseCheck</span>
      </div>
      {children}
    </div>
  );
}
