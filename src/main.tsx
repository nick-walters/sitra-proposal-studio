import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installSmartQuotes } from "./lib/smartQuotes";

installSmartQuotes();

createRoot(document.getElementById("root")!).render(<App />);
