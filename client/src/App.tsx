import { AlertTriangle, RefreshCw, ServerOff } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { CallProvider } from './context/CallContext';
import { UiProvider } from './context/UiContext';
import { AppShell } from './components/AppShell';
import { JoinScreen } from './components/JoinScreen';
import { Toasts } from './components/Toasts';
import { LanternMark } from './components/Logo';
import { CallOverlay } from './components/call/CallOverlay';
import { IncomingCallDialog } from './components/call/IncomingCallDialog';

function Splash() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,146,60,0.22),transparent_65%)] blur-2xl" />
      </div>
      <div className="relative flex flex-col items-center animate-fade-in">
        <div className="animate-float">
          <LanternMark size={72} />
        </div>
        <div className="mt-5 text-[22px] font-bold tracking-tight text-ink">Lantern</div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink3">
          Local network chat
        </div>
        <div className="mt-8 flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-accent animate-blink"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
        <div className="mt-3 text-[12px] text-ink3">Connecting to your local server…</div>
      </div>
    </div>
  );
}

function Unreachable() {
  const { bootError, retryBoot } = useApp();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-5 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-panel p-7 shadow-[var(--shadow)] animate-fade-up">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <ServerOff size={26} />
        </div>
        <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-ink">Can’t reach the server</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink2">
          {bootError || 'Lantern could not contact the laptop hosting this network.'}
        </p>
        <div className="mt-5 rounded-2xl border border-line bg-panel2 p-4 text-[12.5px] leading-relaxed text-ink2">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <AlertTriangle size={14} className="text-accent" />
            Things to check
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The hosting laptop is still running <code className="rounded bg-panel3 px-1">npm start</code>.</li>
            <li>This device is on the same Wi-Fi network.</li>
            <li>You opened the full <code className="rounded bg-panel3 px-1">https://</code> address from the host.</li>
            <li>The host firewall allows the port shown in the terminal.</li>
          </ul>
        </div>
        <button onClick={retryBoot} className="btn-primary mt-5 w-full">
          <RefreshCw size={16} /> Try again
        </button>
      </div>
    </div>
  );
}

function Root() {
  const { phase } = useApp();
  if (phase === 'loading') return <Splash />;
  if (phase === 'unreachable') return <Unreachable />;
  if (phase === 'join') return <JoinScreen />;
  return (
    <UiProvider>
      <AppShell />
    </UiProvider>
  );
}

export default function App() {
  return (
    <AppProvider>
      <CallProvider>
        <Root />
        <Toasts />
        <CallOverlay />
        <IncomingCallDialog />
      </CallProvider>
    </AppProvider>
  );
}
