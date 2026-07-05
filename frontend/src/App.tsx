import { useState } from "react";
import { CompareSpike } from "./spike/CompareSpike";
import { MvpConsole } from "./mvp/MvpConsole";

type Tab = "spike" | "mvp";

export default function App() {
  const [tab, setTab] = useState<Tab>("spike");

  return (
    <div className="app">
      <header>
        <h1>trickline</h1>
        <nav>
          <button className={tab === "spike" ? "active" : ""} onClick={() => setTab("spike")}>
            ① 比較スパイク（ローカル）
          </button>
          <button className={tab === "mvp" ? "active" : ""} onClick={() => setTab("mvp")}>
            ② MVPコンソール（API連携）
          </button>
        </nav>
      </header>

      <main>{tab === "spike" ? <CompareSpike /> : <MvpConsole />}</main>
    </div>
  );
}
