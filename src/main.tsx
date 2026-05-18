import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp } from "antd";
import { queryClient } from "./lib/query-client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <App />
        </AntApp>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
