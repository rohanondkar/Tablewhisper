import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; onError?: (msg: string) => void };
type State = { error: string | null };

/** Keeps the console chrome visible if the map canvas throws. */
export default class MapErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error.message || String(error));
    console.error("Map panel crashed", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="map-workspace" style={{ padding: "1rem" }}>
          <h2>Map failed to load</h2>
          <p className="muted">{this.state.error}</p>
          <button
            type="button"
            className="btn"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
