import { useEffect, useState } from "react";
import axios from "axios";
import { supabase } from "./supabase";

const API_URL = "https://meonix-risk.onrender.com/api";
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

      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify([...users, newUser]));
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

      setTrades([mapTradeFromDb(data), ...trades]);
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

    const { error } = await supabase
      .from("trades")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.email);

    if (error) {
      alert("Could not delete trade");
      return;
    }

    setTrades((currentTrades) =>
      currentTrades.filter((trade) => trade.id !== id)
    );
  };

  if (!user) {
    const isLogin = authMode === "login";

    return (
      <div className="min-h-screen bg-[#0b0b0b] text-white p-4">
        <div className="max-w-md mx-auto pt-16">
          <div className="bg-[#111] border border-[#222] rounded-2xl p-6">
            <h1 className="text-3xl font-bold text-[#00ff88]">Meonix Risk</h1>
            <p className="text-gray-400 mt-2">
              {isLogin
                ? "Login to open your risk dashboard."
                : "Create your local Meonix account."}
            </p>

            <form onSubmit={handleAuthSubmit} className="mt-6 space-y-4">
              <input
                className="input"
                type="email"
                placeholder="Email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
              />
              <input
                className="input"
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />

              <button
                type="submit"
                className="w-full bg-[#00ff88] text-black font-bold py-3 rounded-xl"
              >
                {isLogin ? "Login" : "Register"}
              </button>
            </form>

            <button
              onClick={switchAuthMode}
              className="w-full mt-4 text-sm text-[#00ff88]"
            >
              {isLogin
                ? "Need an account? Register"
                : "Already have an account? Login"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white p-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between pt-6">
        <div>
          <p className="text-sm text-gray-400">Signed in as</p>
          <p className="text-[#00ff88] font-semibold">{user.email}</p>
        </div>

        <button
          onClick={logout}
          className="border border-[#222] bg-[#111] px-4 py-2 rounded-xl text-sm text-gray-200 hover:border-[#00ff88]/50"
        >
          Logout
        </button>
      </div>

      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6 pt-10">
        <div className="bg-[#111] border border-[#222] rounded-2xl p-6">
          <h1 className="text-3xl font-bold text-[#00ff88]">Meonix Risk</h1>
          <p className="text-gray-400 mt-2">Calculate before you lose.</p>

          <div className="mt-6 space-y-4">
            <input className="input" placeholder="Balance $" value={balance} onChange={(e) => setBalance(e.target.value)} />
            <input className="input" placeholder="Risk %" value={risk} onChange={(e) => setRisk(e.target.value)} />
            <input className="input" placeholder="Entry Price" value={entry} onChange={(e) => setEntry(e.target.value)} />
            <input className="input" placeholder="Stop Loss" value={stop} onChange={(e) => setStop(e.target.value)} />
            <input className="input" placeholder="Take Profit" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} />

            <button onClick={calculate} className="w-full bg-[#00ff88] text-black font-bold py-3 rounded-xl">
              Calculate & Save
            </button>
          </div>

          {result && (
            <div className="mt-6 bg-black rounded-xl p-4 border border-[#00ff88]/30 space-y-2">
              <p>Risk: <b>${result.riskAmount}</b></p>
              <p>Position Size: <b>{result.positionSize}</b></p>
              <p>Max Loss: <b>-${result.maxLoss}</b></p>
              <p>Potential Profit: <b>+${result.potentialProfit}</b></p>
              <p>Risk/Reward: <b>1:{result.rr}</b></p>
            </div>
          )}
        </div>

        <div className="bg-[#111] border border-[#222] rounded-2xl p-6">
          <h2 className="text-2xl font-bold">Trade History</h2>

          <div className="mt-4 space-y-3">
            {trades.length === 0 && (
              <p className="text-gray-400">No trades yet.</p>
            )}

            {trades.map((trade) => (
              <div key={trade.id} className="bg-black border border-[#222] rounded-xl p-4">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="text-[#00ff88] font-bold">
                      Position {trade.positionSize}
                    </p>
                    <p className="text-sm text-gray-400">
                      Entry {trade.entry} / Stop {trade.stop} / TP {trade.takeProfit}
                    </p>
                    <p className="text-sm mt-1">
                      Risk ${trade.riskAmount}
                    </p>
                  </div>

                  <button
                    onClick={() => deleteTrade(trade.id)}
                    className="text-red-400 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
