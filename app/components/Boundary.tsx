'use client';

import React from 'react';

interface State { err: Error | null }
interface Props { label: string; children: React.ReactNode }

export class Boundary extends React.Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    // Log to console with a label so the source of the crash is obvious.
    // eslint-disable-next-line no-console
    console.error(`[Boundary: ${this.props.label}]`, err, info.componentStack);
  }

  reset = () => this.setState({ err: null });

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="border border-descend/40 bg-descend/5 text-descend px-5 py-6 font-mono text-xs">
        <div className="eyebrow mb-2">{this.props.label} failed</div>
        <div className="text-ivory font-display italic text-lg mb-2">The mirror cracked.</div>
        <pre className="whitespace-pre-wrap text-[11px] text-descend/90 max-h-40 overflow-auto">
          {String(this.state.err?.message || this.state.err)}
        </pre>
        <button
          onClick={this.reset}
          className="mt-3 text-[10px] uppercase tracking-[0.22em] border border-descend/50 hover:bg-descend/10 px-3 py-1.5"
        >
          Reset panel
        </button>
      </div>
    );
  }
}
