import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { supabase } from "./supabase";

const API_URL = "http://localhost:5000/api";
const USERS_STORAGE_KEY = "meonix_users";
const CURRENT_USER_STORAGE_KEY = "meonix_current_user";

const createUserId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const mapTradeFromDb = (trade) => ({
  id: trade.id,
  createdAt: trade.created_at,
  userId: trade.user_id,
  entry: trade.entry,
  stop: trade.stop,
  takeProfit: trade.take_profit,
  riskAmount: trade.risk_amount,
  positionSize: trade.position_size,
});

const formatNumber = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
};

const formatCurrency = (value) => `$${formatNumber(value)}`;

export default function App() {
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState("");
  const [risk, setRisk] = useState("2");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [result, setResult] = useState(null);
  const [trades, setTrades] = useState([]);

  useEffect(() => {
    const savedCurrentUser = localStorage.getItem(CURRENT_USER_STORAGE_KEY);

    if (savedCurrentUser) {
      try {
        const currentUser = JSON.parse(savedCurrentUser);
        const normalizedUser = currentUser.id
          ? currentUser
          : { ...currentUser, id: createUserId() };

        if (!currentUser.id) {
          const savedUsers = localStorage.getItem(USERS_STORAGE_KEY);

          if (savedUsers) {
            const users = JSON.parse(savedUsers);

            if (Array.isArray(users)) {
              const updatedUsers = users.map((storedUser) =>
                storedUser.email === normalizedUser.email
                  ? normalizedUser
                  : storedUser
              );

              localStorage.setItem(
                USERS_STORAGE_KEY,
                JSON.stringify(updatedUsers)
              );
            }
          }

          localStorage.setItem(
            CURRENT_USER_STORAGE_KEY,
            JSON.stringify(normalizedUser)
          );
        }

        setUser(normalizedUser);
      } catch {
        localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setTrades([]);
      return;
    }

    getTrades();
  }, [user]);

  const stats = useMemo(() => {
    const totalRisk = trades.reduce(
      (sum, trade) => sum + Number(trade.riskAmount || 0),
      0
    );
    const averagePosition =
      trades.length === 0
        ? 0
        : trades.reduce(
            (sum, trade) => sum + Number(trade.positionSize || 0),
            0
          ) / trades.length;

    return [
      { label: "Saved Trades", value: trades.length },
      { label: "Total Risk", value: formatCurrency(totalRisk) },
      { label: "Avg Position", value: formatNumber(averagePosition) },
      {
        label: "Latest Entry",
        value: trades[0]?.entry ? formatNumber(trades[0].entry) : "-",
      },
    ];
  }, [trades]);

  const resetAuthForm = () => {
    setAuthEmail("");
    setAuthPassword("");
  };

  const getStoredUsers = () => {
    const savedUsers = localStorage.getItem(USERS_STORAGE_KEY);

    if (!savedUsers) {
      return [];
    }

    try {
      const parsedUsers = JSON.parse(savedUsers);
      return Array.isArray(parsedUsers) ? parsedUsers : [];
    } catch {
      localStorage.removeItem(USERS_STORAGE_KEY);
      return [];
    }
  };

  const getCurrentUser = () => {
    const savedCurrentUser = localStorage.getItem(CURRENT_USER_STORAGE_KEY);

    if (!savedCurrentUser) {
      return null;
    }

    try {
      return JSON.parse(savedCurrentUser);
    } catch {
      localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      return null;
    }
  };

  const handleAuthSubmit = (e) => {
    e.preventDefault();

    const email = authEmail.trim().toLowerCase();
    const password = authPassword.trim();

    if (!email || !password) {
      alert("Please enter your email and password");
      return;
    }

    const users = getStoredUsers();

    if (authMode === "register") {
      const emailExists = users.some((storedUser) => storedUser.email === email);

      if (emailExists) {
        alert("Email already registered");
        return;
      }

      const newUser = { id: createUserId(), email, password };

      localStorage.setItem(
        USERS_STORAGE_KEY,
        JSON.stringify([...users, newUser])
      );
      localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(newUser));
      setUser(newUser);
      resetAuthForm();
      return;
    }

    if (users.length === 0) {
      alert("No account found. Please register first.");
      return;
    }

    let storedUser = users.find(
      (currentUser) =>
        currentUser.email === email && currentUser.password === password
    );

    if (!storedUser) {
      alert("Invalid email or password");
      return;
    }

    if (!storedUser.id) {
      storedUser = { ...storedUser, id: createUserId() };
      const updatedUsers = users.map((currentUser) =>
        currentUser.email === storedUser.email ? storedUser : currentUser
      );

      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
    }

    localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(storedUser));
    setUser(storedUser);
    resetAuthForm();
  };

  const switchAuthMode = () => {
    setAuthMode((currentMode) =>
      currentMode === "login" ? "register" : "login"
    );
    resetAuthForm();
  };

  const logout = () => {
    setUser(null);
    setResult(null);
    localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
  };

  const getTrades = async () => {
    const currentUser = getCurrentUser();

    if (!currentUser?.email) {
      setTrades([]);
      return;
    }

    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .eq("user_id", currentUser.email)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setTrades([]);
      return;
    }

    setTrades(Array.isArray(data) ? data.map(mapTradeFromDb) : []);
  };

  const calculate = async () => {
    const currentUser = getCurrentUser();

    if (!currentUser?.email) {
      setTrades([]);
      return;
    }

    try {
      const res = await axios.post(`${API_URL}/calculate`, {
        balance,
        risk,
        entry,
        stop,
        takeProfit,
      });

      setResult(res.data);

      const tradeToSave = {
        user_id: currentUser.email,
        entry,
        stop,
        take_profit: takeProfit,
        risk_amount: res.data.riskAmount,
        position_size: res.data.positionSize,
      };

      const { data, error } = await supabase
        .from("trades")
        .insert(tradeToSave)
        .select()
        .single();

      if (error) {
        alert("Trade calculated, but could not save it");
        return;
      }

      setTrades((currentTrades) => [mapTradeFromDb(data), ...currentTrades]);
    } catch {
      alert("Please fill all fields correctly");
    }
  };

  const deleteTrade = async (id) => {
    const currentUser = getCurrentUser();

    if (!currentUser?.email) {
      setTrades([]);
      return;
    }

    setTrades((currentTrades) =>
      currentTrades.filter((trade) => trade.id !== id)
    );

    const { error } = await supabase
      .from("trades")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.email);

    if (error) {
      console.error(error);
      getTrades();
    }
  };

  const renderInput = (label, value, onChange, placeholder) => (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
        {label}
      </span>
      <input
        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-[#00ff88]/70 focus:bg-black/60 focus:ring-4 focus:ring-[#00ff88]/10"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );

  if (!user) {
    const isLogin = authMode === "login";

    return (
      <div className="min-h-screen bg-[#050606] px-4 py-8 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
          <section className="hidden lg:block">
            <div className="max-w-xl">
              <div className="mb-6 inline-flex rounded-full border border-[#00ff88]/25 bg-[#00ff88]/10 px-4 py-2 text-sm font-semibold text-[#00ff88]">
                Crypto risk calculator SaaS
              </div>
              <h1 className="text-6xl font-black tracking-tight text-white">
                Meonix Risk
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-8 text-gray-400">
                A focused trading dashboard for position sizing, risk control,
                and clean trade history tracking.
              </p>
              <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
                {["Fast sizing", "Saved history", "User scoped"].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300 shadow-2xl shadow-black/20"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <div className="mb-8">
              <div className="mb-4 h-12 w-12 rounded-2xl border border-[#00ff88]/30 bg-[#00ff88]/15 text-center text-2xl font-black leading-[3rem] text-[#00ff88]">
                M
              </div>
              <h2 className="text-3xl font-bold">Meonix Risk</h2>
              <p className="mt-2 text-sm text-gray-400">
                {isLogin
                  ? "Login to open your dashboard."
                  : "Create your local Meonix account."}
              </p>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Email
                </span>
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-[#00ff88]/70 focus:ring-4 focus:ring-[#00ff88]/10"
                  type="email"
                  placeholder="you@meonix.app"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Password
                </span>
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-[#00ff88]/70 focus:ring-4 focus:ring-[#00ff88]/10"
                  type="password"
                  placeholder="Enter password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </label>

              <button
                type="submit"
                className="w-full rounded-xl bg-[#00ff88] px-5 py-3 text-sm font-black text-black shadow-lg shadow-[#00ff88]/20 transition hover:bg-[#3dffa5] active:scale-[0.99]"
              >
                {isLogin ? "Login" : "Register"}
              </button>
            </form>

            <button
              onClick={switchAuthMode}
              className="mt-5 w-full rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-[#00ff88] transition hover:border-[#00ff88]/40 hover:bg-[#00ff88]/10"
            >
              {isLogin
                ? "Need an account? Register"
                : "Already have an account? Login"}
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050606] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-black/30 px-5 py-6 backdrop-blur-xl lg:flex lg:flex-col">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl border border-[#00ff88]/30 bg-[#00ff88]/15 text-center text-xl font-black leading-[2.75rem] text-[#00ff88]">
              M
            </div>
            <div>
              <p className="text-lg font-black">Meonix Risk</p>
              <p className="text-xs text-gray-500">Trading dashboard</p>
            </div>
          </div>

          <nav className="mt-10 space-y-2">
            {["Dashboard", "Calculator", "History"].map((item) => (
              <a
                key={item}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-gray-200"
                href={item === "Dashboard" ? "#top" : `#${item.toLowerCase()}`}
              >
                {item}
                <span className="h-2 w-2 rounded-full bg-[#00ff88]" />
              </a>
            ))}
          </nav>

          <div className="mt-auto rounded-3xl border border-[#00ff88]/20 bg-[#00ff88]/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00ff88]">
              Signed in
            </p>
            <p className="mt-2 break-all text-sm text-gray-200">{user.email}</p>
          </div>
        </aside>

        <main id="top" className="w-full pb-24 lg:pb-0">
          <header className="sticky top-0 z-10 border-b border-white/10 bg-[#050606]/85 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00ff88]">
                  Risk console
                </p>
                <h1 className="mt-1 text-xl font-black sm:text-2xl">
                  Dashboard
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="text-xs text-gray-500">Signed in as</p>
                  <p className="max-w-[220px] truncate text-sm font-semibold text-gray-200">
                    {user.email}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-[#00ff88]/40 hover:text-[#00ff88]"
                >
                  Logout
                </button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    {stat.label}
                  </p>
                  <p className="mt-3 text-2xl font-black text-white">
                    {stat.value}
                  </p>
                </div>
              ))}
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <div
                id="calculator"
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00ff88]">
                      Calculator
                    </p>
                    <h2 className="mt-2 text-2xl font-black">Position Risk</h2>
                  </div>
                  <span className="rounded-full border border-[#00ff88]/20 bg-[#00ff88]/10 px-3 py-1 text-xs font-bold text-[#00ff88]">
                    Live API
                  </span>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {renderInput("Balance", balance, setBalance, "$10,000")}
                  {renderInput("Risk", risk, setRisk, "2%")}
                  {renderInput("Entry Price", entry, setEntry, "65000")}
                  {renderInput("Stop Loss", stop, setStop, "63500")}
                  <div className="sm:col-span-2">
                    {renderInput(
                      "Take Profit",
                      takeProfit,
                      setTakeProfit,
                      "69500"
                    )}
                  </div>
                </div>

                <button
                  onClick={calculate}
                  className="mt-5 w-full rounded-2xl bg-[#00ff88] px-5 py-4 text-sm font-black text-black shadow-lg shadow-[#00ff88]/20 transition hover:bg-[#3dffa5] active:scale-[0.99]"
                >
                  Calculate & Save Trade
                </button>

                {result && (
                  <div className="mt-6 grid gap-3 rounded-3xl border border-[#00ff88]/20 bg-black/40 p-4 sm:grid-cols-2">
                    {[
                      ["Risk", formatCurrency(result.riskAmount)],
                      ["Position Size", formatNumber(result.positionSize)],
                      ["Max Loss", `-${formatCurrency(result.maxLoss)}`],
                      [
                        "Potential Profit",
                        `+${formatCurrency(result.potentialProfit)}`,
                      ],
                      ["Risk / Reward", `1:${formatNumber(result.rr)}`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl bg-white/[0.03] p-3">
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className="mt-1 font-black text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                id="history"
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00ff88]">
                      Journal
                    </p>
                    <h2 className="mt-2 text-2xl font-black">Trade History</h2>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-gray-400">
                    {trades.length} saved
                  </span>
                </div>

                {trades.length === 0 ? (
                  <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-black/30 p-8 text-center">
                    <div className="mx-auto h-12 w-12 rounded-2xl border border-[#00ff88]/25 bg-[#00ff88]/10 text-center text-xl font-black leading-[3rem] text-[#00ff88]">
                      +
                    </div>
                    <h3 className="mt-4 text-lg font-black">No trades yet</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">
                      Calculate a position and your saved trade will appear here
                      instantly.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mt-6 hidden overflow-hidden rounded-2xl border border-white/10 md:block">
                      <table className="w-full table-fixed text-left text-sm">
                        <thead className="bg-black/40 text-xs uppercase tracking-[0.16em] text-gray-500">
                          <tr>
                            <th className="px-4 py-4">Entry</th>
                            <th className="px-4 py-4">Stop</th>
                            <th className="px-4 py-4">Take Profit</th>
                            <th className="px-4 py-4">Risk</th>
                            <th className="px-4 py-4">Position</th>
                            <th className="px-4 py-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {trades.map((trade) => (
                            <tr
                              key={trade.id}
                              className="bg-white/[0.02] transition hover:bg-[#00ff88]/5"
                            >
                              <td className="px-4 py-4 font-semibold">
                                {formatNumber(trade.entry)}
                              </td>
                              <td className="px-4 py-4 text-gray-300">
                                {formatNumber(trade.stop)}
                              </td>
                              <td className="px-4 py-4 text-gray-300">
                                {formatNumber(trade.takeProfit)}
                              </td>
                              <td className="px-4 py-4 text-gray-300">
                                {formatCurrency(trade.riskAmount)}
                              </td>
                              <td className="px-4 py-4 text-[#00ff88]">
                                {formatNumber(trade.positionSize)}
                              </td>
                              <td className="px-4 py-4 text-right">
                                <button
                                  onClick={() => deleteTrade(trade.id)}
                                  className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-400/20"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-6 space-y-3 md:hidden">
                      {trades.map((trade) => (
                        <div
                          key={trade.id}
                          className="rounded-3xl border border-white/10 bg-black/30 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                                Position
                              </p>
                              <p className="mt-1 text-lg font-black text-[#00ff88]">
                                {formatNumber(trade.positionSize)}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteTrade(trade.id)}
                              className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-300"
                            >
                              Delete
                            </button>
                          </div>
                          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-2xl bg-white/[0.03] p-3">
                              <p className="text-xs text-gray-500">Entry</p>
                              <p className="mt-1 font-semibold">
                                {formatNumber(trade.entry)}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-white/[0.03] p-3">
                              <p className="text-xs text-gray-500">Stop</p>
                              <p className="mt-1 font-semibold">
                                {formatNumber(trade.stop)}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-white/[0.03] p-3">
                              <p className="text-xs text-gray-500">TP</p>
                              <p className="mt-1 font-semibold">
                                {formatNumber(trade.takeProfit)}
                              </p>
                            </div>
                            <div className="rounded-2xl bg-white/[0.03] p-3">
                              <p className="text-xs text-gray-500">Risk</p>
                              <p className="mt-1 font-semibold">
                                {formatCurrency(trade.riskAmount)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#050606]/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2 text-center text-xs font-bold text-gray-400">
          <a className="rounded-xl bg-white/[0.04] px-3 py-2 text-[#00ff88]" href="#top">
            Home
          </a>
          <a className="rounded-xl bg-white/[0.04] px-3 py-2" href="#calculator">
            Calc
          </a>
          <a className="rounded-xl bg-white/[0.04] px-3 py-2" href="#history">
            History
          </a>
        </div>
      </nav>
    </div>
  );
}
