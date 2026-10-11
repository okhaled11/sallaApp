import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import PhoneCapture from "./components/ScanToProduct/PhoneCapture.jsx";
import "./styles/App.css";
import "./styles/flat-ui.css";

// The phone opens the QR link standalone (not inside the Salla dashboard):
// render the lightweight capture page instead of the full app.
const isPhoneCapture =
  new URLSearchParams(window.location.search).get("m") === "capture";

createRoot(document.getElementById("root")).render(
  <StrictMode>{isPhoneCapture ? <PhoneCapture /> : <App />}</StrictMode>,
);
