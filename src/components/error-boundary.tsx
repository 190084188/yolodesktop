import { Component, ReactNode } from "react";
import { Button, Result } from "antd";
import i18n from "../i18n";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title={i18n.t("common:error")}
          subTitle={this.state.error?.message}
          extra={
            <Button type="primary" onClick={() => this.setState({ hasError: false, error: null })}>
              {i18n.t("common:tryAgain")}
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
