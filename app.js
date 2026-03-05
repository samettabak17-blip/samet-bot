import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

const sessions = {};

async function sendMessage(to, body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("WhatsApp send error:", err.response?.data || err.message);
  }
}

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
    "6. اختيار المناطق الحرة والامتثال",
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
    servicesList.ar,
};

const contactText = {
  tr: "Canlı temsilci: +971 52 728 8586",
  en: "Live consultant: +971 52 728 8586",
  ar: "مستشار مباشر: ‎+971 52 728 8586",
};

app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body || "";
    const lower = text.toLowerCase();

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

    if (
      lower.includes("contact") ||
      lower.includes("iletişim") ||
      lower.includes("whatsapp") ||
      lower.includes("call")
    ) {
      await sendMessage(from, contactText[lang]);
      return res.sendStatus(200);
    }

    session.history.push({ role: "user", text });
    if (session.history.length > 10) session.history.shift();

    const historyText = session.history
      .map((m) => `User: ${m.text}`)
      .join("\n");

    const prompt =
      lang === "tr"
        ? `Sen SamChe Company LLC’nin kurumsal yapay zekâ danışmanısın. Profesyonel, stratejik, analitik ve yol gösterici cevaplar ver. Sohbet geçmişi:\n${historyText}\n\nKullanıcının son mesajı:\n${text}`
        : lang === "en"
        ? `You are the senior corporate AI consultant of SamChe Company LLC. Provide strategic, structured, analytical, advisory answers. Conversation history:\n${historyText}\n\nUser message:\n${text}`
        : `أنت المستشار الذكي لشركة SamChe Company LLC. قدم إجابات تحليلية واستراتيجية وواضحة. سياق المحادثة:\n${historyText}\n\nرسالة المستخدم:\n${text}`;

    const reply = await callGemini(prompt);

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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("SamChe Bot running on port " + port));
