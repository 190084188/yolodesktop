import { useState } from "react";
import { ConfigProvider, theme, App as AntApp } from "antd";

function App() {
  const [isDark] = useState(true);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: "#1677ff" },
      }}
    >
      <AntApp>
        <div style={{ padding: 24 }}>
          <h1>YoloDesktop</h1>
          <p>Loading...</p>
        </div>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
