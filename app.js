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
//  SEND WHATSAPP MESSAGE
// -------------------------------
async function sendMessage(to, body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    console.error("WhatsApp send error:", err.response?.data || err.message);
  }
}

// -------------------------------
//  CORPORATE FALLBACK
// -------------------------------
function corporateFallback(lang) {
  if (lang === "tr") {
    return (
      "Sorunuzu tam olarak anlayamadım ancak size yardımcı olmak isterim. " +
      "Dubai’de şirket kuruluşu, serbest bölge seçimi, vizeler, maliyetler, iş modeli, pazar stratejisi veya yapay zekâ çözümleri hakkında daha net bir soru sorabilirsiniz.\n\n" +
      "Canlı temsilci: +971 52 728 8586"
    );
  }
  if (lang === "en") {
    return (
      "I couldn’t fully understand your question, but I’d be glad to assist. " +
      "You may ask more specifically about Dubai company setup, free zones, visas, costs, business models, or AI solutions.\n\n" +
      "Live consultant: +971 52 728 8586"
    );
  }
  return (
    "لم أفهم سؤالك تمامًا، لكن يسعدني مساعدتك. " +
    "يمكنك طرح سؤال أكثر تحديدًا حول تأسيس الشركات في دبي، المناطق الحرة، التأشيرات، التكاليف أو حلول الذكاء الاصطناعي.\n\n" +
    "المستشار المباشر: ‎+971 52 728 8586"
  );
}

// -------------------------------
//  OPENAI GPT‑4.1‑PRO CALL
// -------------------------------
async function callOpenAI(prompt) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4.1-pro",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("OpenAI API error:", err.response?.data || err.message);
    return null;
  }
}

// -------------------------------
//  STATIC TEXTS
// -------------------------------
const servicesList = {
  tr:
    "SamChe Company LLC olarak sunduğumuz hizmetler:\n" +
    "1. Şirketlere Özel Yapay Zekâ Sistemleri\n" +
    "2. Dijital Büyüme & İçerik Stratejisi\n" +
    "3. Marka Yönetimi & Sosyal Medya\n" +
    "4. Kitle Büyümesi & Performans Optimizasyonu\n" +
    "5. BAE Şirket Kurulumu & Pazar Girişi\n" +
    "6. Serbest Bölge Seçimi & Uyum (Compliance)",
  en:
    "SamChe Company LLC provides:\n" +
    "1. Private AI Systems\n" +
    "2. Digital Growth & Content Strategy\n" +
    "3. Branding & Social Media\n" +
    "4. Audience Growth & Performance Optimization\n" +
    "5. UAE Business Setup & Market Entry\n" +
    "6. Free Zone Selection & Compliance",
  ar:
    "تقدم SamChe Company LLC:\n" +
    "1. أنظمة ذكاء اصطناعي خاصة\n" +
    "2. استراتيجية النمو الرقمي والمحتوى\n" +
    "3. إدارة العلامة التجارية ووسائل التواصل\n" +
    "4. نمو الجمهور وتحسين الأداء\n" +
    "5. تأسيس الأعمال في الإمارات\n" +
    "6. اختيار المناطق الحرة والامتثال"
};

const introAfterLang = {
  tr:
    "Merhaba, ben SamChe Company LLC'nin yapay zekâ danışmanıyım.\n" +
    "Dubai şirket kuruluşu, vizeler, maliyetler, iş planı, strateji ve yapay zekâ çözümleri hakkında sorularınızı yanıtlayabilirim.\n\n" +
    servicesList.tr,
  en:
    "Hello, I am the AI consultant of SamChe Company LLC.\n" +
    "I can assist with Dubai company setup, visas, costs, business planning, strategy, and AI solutions.\n\n" +
    servicesList.en,
  ar:
    "مرحبًا، أنا المساعد الذكي لشركة SamChe Company LLC.\n" +
    "أساعدك في تأسيس الشركات في دبي، التأشيرات، التكاليف، الخطط والاستراتيجيات.\n\n" +
    servicesList.ar
};

const contactText = {
  tr: "Canlı temsilci: +971 52 728 8586",
  en: "Live consultant: +971 52 728 8586",
  ar: "مستشار مباشر: ‎+971 52 728 8586"
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
//  PRICE CALCULATION
// -------------------------------
function calculateSetupPrice(visas) {
  const v = parseInt(visas || "1", 10);
  const base =
    v <= 1 ? 12000 : v === 2 ? 15000 : v === 3 ? 18000 : 20000 + (v - 3) * 2000;
  return { min: base + 6000, max: base + 7000 };
}

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
        flow: { mode: "chat", sector: null, visas: null }
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

    // CONTACT REQUEST
    if (
      lower.includes("contact") ||
      lower.includes("iletişim") ||
      lower.includes("whatsapp") ||
      lower.includes("call")
    ) {
      await sendMessage(from, contactText[lang]);
      return res.sendStatus(200);
    }

    // COMPANY SETUP FLOW
    if (
      session.flow.mode === "chat" &&
      (lower.includes("company") ||
        lower.includes("şirket") ||
        lower.includes("business setup"))
    ) {
      session.flow.mode = "setup_sector";
      await sendMessage(
        from,
        lang === "tr"
          ? "Hangi sektörde şirket kurmak istiyorsunuz?"
          : lang === "en"
          ? "Which sector will your company operate in?"
          : "في أي قطاع ترغب في تأسيس الشركة؟"
      );
      return res.sendStatus(200);
    }

    if (session.flow.mode === "setup_sector") {
      session.flow.sector = text;
      session.flow.mode = "setup_visas";

      await sendMessage(
        from,
        lang === "tr"
          ? "Kaç vize planlıyorsunuz?"
          : lang === "en"
          ? "How many visas do you plan?"
          : "كم عدد التأشيرات التي تخطط لها؟"
      );
      return res.sendStatus(200);
    }

    if (session.flow.mode === "setup_visas") {
      session.flow.visas = text;
      session.flow.mode = "chat";

      const { min, max } = calculateSetupPrice(text);

      const msg =
        lang === "tr"
          ? `Sektör: ${session.flow.sector}\nVize: ${text}\nYaklaşık maliyet: ${min}–${max} AED`
          : lang === "en"
          ? `Sector: ${session.flow.sector}\nVisas: ${text}\nEstimated cost: ${min}–${max} AED`
          : `القطاع: ${session.flow.sector}\nالتأشيرات: ${text}\nالتكلفة التقريبية: ${min}–${max} درهم`;

      await sendMessage(from, msg);
      return res.sendStatus(200);
    }

    // MEMORY
    session.history.push({ role: "user", text });
    if (session.history.length > 10) session.history.shift();

    const historyText = session.history.map(m => `User: ${m.text}`).join("\n");

    // CONSULTANT PROMPT
    const prompt =
      lang === "tr"
        ? `Sen SamChe Company LLC’nin üst düzey danışmanlık diline sahip yapay zekâ asistanısın. Profesyonel, stratejik, analitik ve yol gösterici cevaplar ver. Sohbet geçmişi:\n${historyText}\n\nKullanıcının son mesajı:\n${text}`
        : lang === "en"
        ? `You are the senior corporate AI consultant of SamChe Company LLC. Provide strategic, structured, analytical, advisory answers. Conversation history:\n${historyText}\n\nUser message:\n${text}`
        : `أنت المستشار الذكي لشركة SamChe Company LLC. قدم إجابات تحليلية واستراتيجية وواضحة. سياق المحادثة:\n${historyText}\n\nرسالة المستخدم:\n${text}`;

    const reply = await callOpenAI(prompt);

    if (!reply) {
      await sendMessage(from, corporateFallback(lang));
      return res.sendStatus(200);
    }

    session.history.push({ role: "assistant", text: reply });

    await sendMessage(from, reply);

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
