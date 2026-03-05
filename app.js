import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

// -------------------------------
//  SESSION / HAFIZA
// -------------------------------
const sessions = {};

// -------------------------------
//  WHATSAPP MESAJ GÖNDERME
// -------------------------------
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

// -------------------------------
//  GEMINI REST API (v1) – AXIOS
// -------------------------------
async function callGemini(prompt) {
  const url =
    "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=" +
    process.env.GEMINI_API_KEY;

  try {
    const response = await axios.post(
      url,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    return (
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Soruyu biraz daha farklı ifade eder misiniz?"
    );
  } catch (err) {
    console.error("Gemini API error:", err.response?.data || err.message);

    return "Soruyu biraz daha farklı ifade eder misiniz?";
  }
}

// -------------------------------
//  SABİT METİNLER
// -------------------------------
const servicesList = {
  tr:
    "SamChe Company LLC olarak şu hizmetleri vermekteyiz:\n" +
    "1. Şirketlere Özel Yapay Zekâ Sistemleri & Otomasyon\n" +
    "2. Dijital Büyüme & İçerik Stratejisi\n" +
    "3. Marka Yönetimi & Sosyal Medya Geliştirme\n" +
    "4. Kitle Büyümesi & Performans Optimizasyonu\n" +
    "5. BAE Şirket Kurulumu & Pazar Giriş Danışmanlığı\n" +
    "6. Serbest Bölge Seçimi & Uyum (Compliance) Netliği",
  en:
    "SamChe Company LLC provides the following services:\n" +
    "1. Private AI Systems & Automation\n" +
    "2. Digital Growth & Content Strategy\n" +
    "3. Branding & Social Media Development\n" +
    "4. Audience Growth & Performance Optimization\n" +
    "5. UAE Business Setup & Market Entry Advisory\n" +
    "6. Free Zone Selection & Compliance Clarity",
  ar:
    "تقدم شركة SamChe Company LLC الخدمات التالية:\n" +
    "1. أنظمة ذكاء اصطناعي خاصة وأتمتة\n" +
    "2. استراتيجية النمو الرقمي والمحتوى\n" +
    "3. إدارة العلامة التجارية وتطوير وسائل التواصل الاجتماعي\n" +
    "4. نمو الجمهور وتحسين الأداء\n" +
    "5. تأسيس الأعمال في الإمارات ودخول السوق\n" +
    "6. اختيار المناطق الحرة وتوضيح المتطلبات التنظيمية",
};

const introAfterLang = {
  tr:
    "Merhaba, ben SamChe Company LLC'nin yapay zekâ asistanıyım.\n" +
    "Dubai’de şirket kuruluşu, vizeler, yaşam maliyetleri, iş planları, iş stratejileri, dijital büyüme gibi konularda istediğin soruyu sorabilirsin.\n\n" +
    servicesList.tr +
    "\n\nSize bugün nasıl yardımcı olabilirim?",
  en:
    "Hello, I am the AI assistant of SamChe Company LLC.\n" +
    "You can ask anything about company setup in Dubai, visas, cost of living, business plans, strategies, and digital growth.\n\n" +
    servicesList.en +
    "\n\nHow may I assist you today?",
  ar:
    "مرحبًا، أنا المساعد الذكي لشركة SamChe Company LLC.\n" +
    "يمكنك طرح أي سؤال حول تأسيس الشركات في دبي، التأشيرات، تكاليف المعيشة، خطط الأعمال، الاستراتيجيات، والنمو الرقمي.\n\n" +
    servicesList.ar +
    "\n\nكيف يمكنني مساعدتك اليوم؟",
};

const contactText = {
  tr: "SamChe Company LLC İletişim:\n+971 52 728 8586\ninfo@samchecompany.com",
  en: "SamChe Company LLC Contact:\n+971 52 728 8586\ninfo@samchecompany.com",
  ar: "بيانات الاتصال:\n+971 52 728 8586\ninfo@samchecompany.com",
};

const chatbotDemo = {
  tr: "AI chatbot demo ve fiyatlar:\nhttps://aichatbot.samchecompany.com/",
  en: "AI chatbot demo & pricing:\nhttps://aichatbot.samchecompany.com/",
  ar: "عرض تجريبي لروبوت الدردشة:\nhttps://aichatbot.samchecompany.com/",
};

const samcheProfile = `
SamChe Company LLC is a UAE‑based consultancy focused on Private AI systems, digital growth strategy, and business setup clarity.
We guide clients through UAE market entry, free zone selection, compliance clarity, launch planning, and AI‑powered digital growth.
`;

// -------------------------------
//  WEBHOOK DOĞRULAMA
// -------------------------------
app.get("/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === verifyToken
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }

  return res.sendStatus(403);
});

// -------------------------------
//  FİYAT HESABI
// -------------------------------
function calculateSetupPrice(visas) {
  const v = parseInt(visas || "1", 10);
  const base =
    v <= 1 ? 12000 : v === 2 ? 15000 : v === 3 ? 18000 : 20000 + (v - 3) * 2000;
  return { min: base + 6000, max: base + 7000 };
}

// -------------------------------
//  WEBHOOK MESAJ
// -------------------------------
app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body || "";
    const lower = text.toLowerCase();

    // İlk mesaj
    if (!sessions[from]) {
      sessions[from] = {
        lang: null,
        history: [],
        flow: { mode: "chat", sector: null, visas: null },
      };

      await sendMessage(
        from,
        "Welcome to SamChe Company LLC.\n" +
          "SamChe Company LLC'ye hoş geldiniz.\n" +
          "مرحبًا بكم.\n\n" +
          "Please select your language:\n" +
          "1️⃣ English\n2️⃣ Türkçe\n3️⃣ العربية"
      );

      return res.sendStatus(200);
    }

    const session = sessions[from];

    // Dil seçimi
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

    // İletişim isteği
    if (
      lower.includes("iletişim") ||
      lower.includes("contact") ||
      lower.includes("call")
    ) {
      await sendMessage(from, contactText[lang]);
      return res.sendStatus(200);
    }

    // Chatbot demo
    if (lower.includes("chatbot") || lower.includes("demo")) {
      await sendMessage(from, chatbotDemo[lang]);
      return res.sendStatus(200);
    }

    // Şirket kurma akışı
    if (
      session.flow.mode === "chat" &&
      (lower.includes("şirket kur") ||
        lower.includes("sirket kur") ||
        lower.includes("company setup") ||
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
          : "كم عدد التأشيرات المطلوبة؟"
      );
      return res.sendStatus(200);
    }

    if (session.flow.mode === "setup_visas") {
      session.flow.visas = text;
      session.flow.mode = "chat";

      const { min, max } = calculateSetupPrice(text);

      const msg =
        lang === "tr"
          ? `Sektör: ${session.flow.sector}\nVize: ${text}\n\nYaklaşık maliyet: ${min}–${max} AED`
          : lang === "en"
          ? `Sector: ${session.flow.sector}\nVisas: ${text}\n\nEstimated cost: ${min}–${max} AED`
          : `القطاع: ${session.flow.sector}\nالتأشيرات: ${text}\n\nالتكلفة التقريبية: ${min}–${max} درهم`;

      await sendMessage(from, msg);
      return res.sendStatus(200);
    }

    // Hafıza
    session.history.push({ role: "user", text });
    if (session.history.length > 10) session.history.shift();

    const historyText = session.history
      .map((m) => `User: ${m.text}`)
      .join("\n");

    const prompt =
      lang === "tr"
        ? `Sen SamChe Company LLC'nin resmi asistanısın.\n${samcheProfile}\n\nSohbet geçmişi:\n${historyText}\n\nKullanıcı mesajı:\n${text}`
        : lang === "en"
        ? `You are the official assistant of SamChe Company LLC.\n${samcheProfile}\n\nConversation:\n${historyText}\n\nUser message:\n${text}`
        : `أنت المساعد الرسمي لشركة SamChe Company LLC.\n${samcheProfile}\n\nالمحادثة:\n${historyText}\n\nرسالة المستخدم:\n${text}`;

    const reply = await callGemini(prompt);

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
