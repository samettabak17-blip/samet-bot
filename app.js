import express from "express";
import axios from "axios";
import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

// =========================
// SYSTEM RULES
// =========================
const SYSTEM_RULES = `
Sen SamChe Company LLC'nin resmi WhatsApp asistanısın.
Profesyonel, analitik, stratejik, net ve yönlendirici konuşursun.
Kullanıcıya asla teknik detay dökmezsin, başka kuruma yönlendırmezsin,sadece sonuç odaklı konuşursun.
Kendini asla AI olarak tanıtmazsın.
Kullanıcı ne sorarsa sorsun, her zaman ayrıntılı,açıklayıcı, tatmin edici bilgiler verirsin.
Asla klasik AI kalıpları kullanmazsın.
Cevapların net, premium danışmanlık tonunda olur.
Kullanıcının mesajını otomatik olarak algılar ve aynı dilde cevap verirsin.
Hangi dilde olursa olsun premium danışmanlık tonu korunur.

`;

// =========================
// FALLBACK
// =========================
function fallbackMessage() {
  return "Size en doğru bilgiyi sunabilmem için mesajınızı biraz daha netleştirebilir misiniz?";
}

// =========================
// GPT CALL
// =========================
async function callGPT(userMessage) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-5-mini",
        input: `${SYSTEM_RULES}\n\nUser: ${userMessage}`
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const output = response.data.output_text;

    if (!output || output.trim() === "") {
      return fallbackMessage();
    }

    return output;
  } catch (err) {
    console.error("❌ GPT API Hatası:", err.response?.data || err.message);
    return fallbackMessage();
  }
}

// =========================
// EXPRESS SERVER
// =========================
const app = express();
app.use(express.json());

// =========================
// WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messageObj = value?.messages?.[0];

    if (!messageObj) return res.sendStatus(200);

    const from = messageObj.from;
    const message = messageObj.text?.body;

    console.log("📩 Gelen mesaj:", message);

    const reply = await callGPT(message);

    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook Hatası:", err.response?.data || err.message);
    res.sendStatus(200);
  }
});

// =========================
// CRON – Render'ı Uyanık Tut
// =========================
cron.schedule("*/10 * * * * *", () => {
  console.log("⏱ Cron aktif = sistem stabil.");
});

// =========================
// SERVER START
// =========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 SamChe GPT-5-mini Bot aktif — Port: ${PORT}`);
});
