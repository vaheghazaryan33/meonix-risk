require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

const sessions = {};

bot.start((ctx) => {
  ctx.reply(
    "🚀 Welcome to Meonix Risk\n\nCalculate your crypto trade risk before opening a position.",
    Markup.inlineKeyboard([
      [Markup.button.callback("📊 Calculate Risk", "calculate")],
      [Markup.button.url("🌐 Open Web App", process.env.WEB_APP_URL)],
    ])
  );
});

bot.action("calculate", (ctx) => {
  sessions[ctx.from.id] = { step: "balance", data: {} };
  ctx.reply("Enter your account balance, example: 1000");
});

bot.on("text", (ctx) => {
  const userId = ctx.from.id;
  const session = sessions[userId];

  if (!session) {
    return ctx.reply("Press /start and choose 📊 Calculate Risk");
  }

  const value = Number(ctx.message.text);

  if (!value || value <= 0) {
    return ctx.reply("Please enter a valid number.");
  }

  if (session.step === "balance") {
    session.data.balance = value;
    session.step = "risk";
    return ctx.reply("Enter risk %, example: 2");
  }

  if (session.step === "risk") {
    session.data.risk = value;
    session.step = "entry";
    return ctx.reply("Enter entry price, example: 100");
  }

  if (session.step === "entry") {
    session.data.entry = value;
    session.step = "stop";
    return ctx.reply("Enter stop loss price, example: 95");
  }

  if (session.step === "stop") {
    session.data.stop = value;
    session.step = "tp";
    return ctx.reply("Enter take profit price, example: 110");
  }

  if (session.step === "tp") {
    session.data.tp = value;

    const { balance, risk, entry, stop, tp } = session.data;

    const riskAmount = balance * (risk / 100);
    const stopDistance = Math.abs(entry - stop);
    const profitDistance = Math.abs(tp - entry);

    if (stopDistance === 0) {
      delete sessions[userId];
      return ctx.reply("Stop loss cannot be equal to entry price.");
    }

    const positionSize = riskAmount / stopDistance;
    const profit = positionSize * profitDistance;
    const rr = profit / riskAmount;

    delete sessions[userId];

    return ctx.reply(
      `✅ Meonix Risk Result\n\n` +
        `💰 Balance: $${balance}\n` +
        `⚠️ Risk: ${risk}% = $${riskAmount.toFixed(2)}\n` +
        `🎯 Entry: ${entry}\n` +
        `🛑 Stop Loss: ${stop}\n` +
        `🚀 Take Profit: ${tp}\n\n` +
        `📦 Position Size: ${positionSize.toFixed(4)}\n` +
        `📉 Max Loss: -$${riskAmount.toFixed(2)}\n` +
        `📈 Potential Profit: +$${profit.toFixed(2)}\n` +
        `⚖️ Risk/Reward: 1:${rr.toFixed(2)}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("🔁 Calculate Again", "calculate")],
        [Markup.button.url("🌐 Open Web App", process.env.WEB_APP_URL)],
      ])
    );
  }
});

bot.launch();
console.log("Meonix Risk Bot running...");