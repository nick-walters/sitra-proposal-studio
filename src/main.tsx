import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/table-card.css";
import { installSmartQuotes } from "./lib/smartQuotes";
import { installTableStyleVars } from "./lib/tableStyleSpec";

installSmartQuotes();
installTableStyleVars();


createRoot(document.getElementById("root")!).render(<App />);
