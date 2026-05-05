const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

let trades = [];

app.post("/api/calculate", (req, res) => {
  const { balance, risk, entry, stop, takeProfit } = req.body;

  const b = Number(balance);
  const r = Number(risk);
  const e = Number(entry);
  const s = Number(stop);
  const tp = Number(takeProfit);

  if (!b || !r || !e || !s || !tp || e === s) {
    return res.status(400).json({ message: "Invalid input" });
  }

  const riskAmount = b * (r / 100);
  const stopDistance = Math.abs(e - s);
  const profitDistance = Math.abs(tp - e);
  const positionSize = riskAmount / stopDistance;
  const potentialProfit = positionSize * profitDistance;
  const rr = potentialProfit / riskAmount;

  const trade = {
    id: Date.now(),
    balance: b,
    risk: r,
    entry: e,
    stop: s,
    takeProfit: tp,
    riskAmount: riskAmount.toFixed(2),
    positionSize: positionSize.toFixed(4),
    maxLoss: riskAmount.toFixed(2),
    potentialProfit: potentialProfit.toFixed(2),
    rr: rr.toFixed(2),
    createdAt: new Date(),
  };

  trades.unshift(trade);

  res.json(trade);
});

app.get("/api/trades", (req, res) => {
  res.json(trades);
});

app.delete("/api/trades/:id", (req, res) => {
  const id = Number(req.params.id);
  trades = trades.filter((trade) => trade.id !== id);
  res.json({ message: "Trade deleted" });
});

app.listen(PORT, () => {
  console.log(`Meonix Risk backend running on http://localhost:${PORT}`);
});