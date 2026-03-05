import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

// -------------------------------
//  SESSION MEMORY
// -------------------------------
const sessions = {};

// -------------------------------
//  WHATSAPP SEND (4096 LIMIT SAFE)
// -------------------------------
async function sendMessage(to, body) {
  try {
    const chunks = [];
    for (let i = 0; i < body.length; i += 4000) {
      chunks.push(body.substring(i, i + 4000));
    }

    for (const chunk of chunks) {
      await axios.post(
        `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to,
          text: { body: chunk },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch (err) {
    console.error("WhatsApp send error:", err.response?.data || err.message);
  }
}

// -------------------------------
//  GEMINI 2.0 FLASH CALL
// -------------------------------
async function callGemini(prompt) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
    process.env.GEMINI_API_KEY;

  try {
    const response = await axios.post(
      url,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const reply =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return reply.trim() || null;
  } catch (err) {
    console.error("Gemini API error:", err.response?.data || err.message);
    return null;
  }
}

// -------------------------------
//  STATIC TEXTS
// -------------------------------
const introAfterLang = {
  tr:
    "Merhaba, ben SamChe Company LLC'nin yapay zekâ danışmanıyım.\n" +
    "BAE şirket kuruluşu, vizeler, yaşam maliyetleri, iş planları, iş stratejileri ve yapay zekâ çözümleri hakkında sorularınızı yanıtlayabilirim.Size nasıl yardımcı olabilirim?",
  en:
    "Hello, I am the AI consultant of SamChe Company LLC.\n" +
    "I can answer your questions about UAE company formation, visas, cost of living, business plans, business strategies, and artificial intelligence solutions. How can I assist you?",
  ar:
    "مرحبًا، أنا المساعد الذكي لشركة SamChe Company LLC.\n" +
    "أساعدك في تأسيس الشركات في دبي، التأشيرات، التكاليف، الخطط والاستراتيجيات.",
};

const contactText = {
  tr: "Temsilci: +971 52 728 8586",
  en: "Consultant: +971 52 728 8586",
  ar: "المستشار: ‎+971 52 728 8586",
};

// -------------------------------
//  WEBHOOK VERIFY
// -------------------------------
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

// -------------------------------
//  WEBHOOK MESSAGE HANDLER
// -------------------------------
app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body || "";
    const lower = text.toLowerCase();

    // FIRST MESSAGE
    if (!sessions[from]) {
      sessions[from] = {
        lang: null,
        history: [],
      };

      await sendMessage(
        from,
        "Welcome to SamChe Company LLC.\n" +
          "SamChe Company LLC'ye hoş geldiniz.\n" +
          "مرحبًا بكم.\n\n" +
          "Please select your language:\n1️⃣ English\n2️⃣ Türkçe\n3️⃣ العربية"
      );

      return res.sendStatus(200);
    }

    const session = sessions[from];

    // LANGUAGE SELECTION
    if (!session.lang) {
      if (text === "1") session.lang = "en";
      else if (text === "2") session.lang = "tr";
      else if (text === "3") session.lang = "ar";
      else {
        await sendMessage(from, "Please choose 1, 2 or 3.");
        return res.sendStatus(200);
      }

      await sendMessage(from, introAfterLang[session.lang]);
      return res.sendStatus(200);
    }

    const lang = session.lang;

    // MEMORY
    session.history.push({ role: "user", text });
    if (session.history.length > 10) session.history.shift();

    const historyText = session.history
      .map((m) => `User: ${m.text}`)
      .join("\n");

    // -------------------------------
    //  PROMPT WITH ALL RULES
    // -------------------------------
    const prompt =
      lang === "tr"
        ? `
SamChe Company LLC’nin kurumsal yapay zekâ danışmanısın. Profesyonel, stratejik ve yönlendirici cevaplar verirsin. Kullanıcı ne sorarsa sorsun aşağıdaki kurallara göre yanıt ver:

1) Kullanıcı “yapay zeka destekli chatbot”, “AI chatbot”, “whatsapp botu”, “instagram botu”, “web botu” isterse:
   - Şu sayfaya yönlendir:
     https://aichatbot.samchecompany.com/

2) Kullanıcı “yapay zeka destekli sistemler”, “AI automation”, “AI system”, “otomasyon”, “AI solutions” isterse:
   - Fiyat listesi:
     • Basic AI System: 1.500 AED
     • Advanced AI Automation: 3.500 AED
     • Enterprise AI System: 7.500 AED

3) Kullanıcı “şirket kurulum maliyeti” sorarsa:
   - Yönlendir:
     https://guide.samchecompany.com/

4) Kullanıcı sadece “oturum ücreti”, “residence fee”, “residence cost”, “freelance visa” sorarsa:
   Oturum ücreti totalde her şey dahil (13.000 AED). İşlemleri Türkiye’den başlatabiliyoruz.
   Ödeme yöntemleri:
   • İlk ödeme  (4000 AED)
   • 2. ödeme  (8000 AED)
   • 3. ödeme  (1000 AED)

5) Kullanıcı “şirket kurmak”, “Dubai’de şirket”, “free zone”, “LLC”, “license” sorarsa:
   - Genel bilgi ver ve temsilciye yönlendir: +971 52 728 8586

6) Kullanıcı “vize”, “oturum”, “residence”, “visa” sorarsa:
   - Genel bilgi ver:
     “Vize ve oturum süreçleri kişinin durumuna göre değişir.”
   - Temsilciye yönlendir.

7) Kullanıcı fiyat sorarsa:
   - Kesin rakam verme:
     “Fiyatlar hizmete göre değişir. Kesin bilgi için temsilci: +971 52 728 8586”
`
        : lang === "en"
        ? `
You are the corporate AI consultant of SamChe Company LLC. Follow these rules:

1) If the user asks for “AI chatbot”, “WhatsApp bot”, “Instagram bot”, “website bot”:
   https://aichatbot.samchecompany.com/

2) If the user asks for “AI systems”, “AI automation”, “AI integration”:
   • Basic AI System: 1,500 AED
   • Advanced AI Automation: 3,500 AED
   • Enterprise AI System: 7,500 AED

3) If the user asks about “company setup cost”:
   https://chat.samchecompany.com/

4) If the user asks about “residence fee”, “residence cost”, “freelance visa”:
   The total residence fee is 13,000 AED all-inclusive.
   Payments:
   • 4,000 AED
   • 8,000 AED
   • 1,000 AED

5) If the user asks about “company setup”, “free zone”, “LLC”, “license”:
   Provide general info and direct to consultant.

6) If the user asks about “visa”, “residence”, “entry permit”:
   Provide general info and direct to consultant.

7) If the user asks about pricing:
   “Pricing varies. For accurate details: +971 52 728 8586”
`
        : `
أنت المستشار الذكي لشركة SamChe Company LLC. اتبع القواعد التالية:

1) إذا طلب المستخدم “شات بوت ذكاء اصطناعي”:
   https://aichatbot.samchecompany.com/

2) إذا طلب “أنظمة ذكاء اصطناعي”:
   • 1500 درهم
   • 3500 درهم
   • 7500 درهم

3) إذا سأل عن “تكلفة تأسيس شركة”:
   https://chat.samchecompany.com/

4) إذا سأل عن “رسوم الإقامة” أو “freelance visa”:
   الرسوم الإجمالية 13,000 درهم.
   الدفعات:
   • 4000 درهم
   • 8000 درهم
   • 1000 درهم

5) إذا سأل عن “تأسيس شركة”:
   قدّم معلومات عامة ثم وجّهه إلى المستشار.

6) إذا سأل عن “تأشيرة” أو “إقامة”:
   قدّم معلومات عامة ثم وجّهه إلى المستشار.

7) إذا سأل عن الأسعار:
   “الأسعار تختلف حسب الخدمة. للمعلومات الدقيقة: ‎+971 52 728 8586”
`;

    const reply = await callGemini(prompt);

    await sendMessage(from, reply || "Bir hata oluştu.");

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// -------------------------------
//  SERVER
// -------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("SamChe Bot running on port " + port));
