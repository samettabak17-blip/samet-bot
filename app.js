import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

// -------------------------------
//  SESSION / MEMORY
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
//  CORPORATE FALLBACK
// -------------------------------
function corporateFallback(lang) {
  if (lang === "tr") {
    return (
      "Sorunuzu tam olarak anlayamadım ancak size yardımcı olmak isterim. " +
      "Dubai’de şirket kuruluşu, vizeler, maliyetler, serbest bölgeler, iş planı, pazar stratejisi veya yapay zekâ çözümleri hakkında daha net bir soru sorabilirsiniz. " +
      "Dilerseniz sizi canlı bir temsilciye de yönlendirebilirim.\n\n" +
      "Canlı temsilci: +971 52 728 8586"
    );
  }

  if (lang === "en") {
    return (
      "I couldn’t fully understand your question, but I’d be glad to assist. " +
      "You can ask more specifically about Dubai company setup, visas, costs, free zones, business planning, market strategy, or AI solutions. " +
      "If you prefer, I can also connect you with a live consultant.\n\n" +
      "Live consultant: +971 52 728 8586"
    );
  }

  return (
    "لم أفهم سؤالك تمامًا، لكن يسعدني مساعدتك. " +
    "يمكنك طرح سؤال أكثر تحديدًا حول تأسيس الشركات في دبي، التأشيرات، التكاليف، المناطق الحرة، خطط الأعمال، الاستراتيجيات أو حلول الذكاء الاصطناعي. " +
    "ويمكنني تحويلك إلى مستشار مباشر إذا رغبت.\n\n" +
    "المستشار المباشر: ‎+971 52 728 8586"
  );
}

// -------------------------------
//  GEMINI REST API – 1.5 PRO LATEST
// -------------------------------
async function callGemini(prompt, lang) {
  const url =
    "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro-latest:generateContent?key=" +
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

    if (!reply.trim()) {
      return corporateFallback(lang);
    }

    return reply;
  } catch (err) {
    console.error("Gemini API error:", err.response?.data || err.message);
    return corporateFallback(lang);
  }
}

// -------------------------------
//  STATIC TEXTS
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
  tr: "Canlı temsilci: +971 52 728 8586\nE‑posta: info@samchecompany.com",
  en: "Live consultant: +971 52 728 8586\nEmail: info@samchecompany.com",
  ar: "مستشار مباشر: ‎+971 52 728 8586\nالبريد: info@samchecompany.com",
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
      lower.includes("iletişim") ||
      lower.includes("contact") ||
      lower.includes("call") ||
      lower.includes("telefon") ||
      lower.includes("whatsapp")
    ) {
      await sendMessage(from, contactText[lang]);
      return res.sendStatus(200);
    }

    // CHATBOT DEMO
    if (lower.includes("chatbot") || lower.includes("demo")) {
      await sendMessage(from, chatbotDemo[lang]);
      return res.sendStatus(200);
    }

    // COMPANY SETUP FLOW
    if (
      session.flow.mode === "chat" &&
      (lower.includes("şirket kur") ||
        lower.includes("sirket kur") ||
        lower.includes("company setup") ||
        lower.includes("business setup") ||
        lower.includes("company formation"))
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
          ? "Yaklaşık kaç vize (ortak/çalışan) planlıyorsunuz?"
          : lang === "en"
          ? "Approximately how many visas (partners/employees) do you plan?"
          : "تقريبًا كم عدد التأشيرات (شركاء/موظفين) التي تخطط لها؟"
      );
      return res.sendStatus(200);
    }

    if (session.flow.mode === "setup_visas") {
      session.flow.visas = text;
      session.flow.mode = "chat";

      const { min, max } = calculateSetupPrice(text);

      const msg =
        lang === "tr"
          ? `Sektör: ${session.flow.sector}\nVize sayısı: ${text}\n\nGenel piyasa koşullarına göre yaklaşık şirket kuruluş maliyeti: ${min}–${max} AED aralığındadır.\nBu rakamlar serbest bölge seçimi, ofis modeli ve ek hizmetlere göre netleştirilebilir.`
          : lang === "en"
          ? `Sector: ${session.flow.sector}\nVisas: ${text}\n\nBased on typical market ranges, the approximate company setup cost would be around: ${min}–${max} AED.\nThese figures can be refined based on free zone choice, office model and additional services.`
          : `القطاع: ${session.flow.sector}\nعدد التأشيرات: ${text}\n\nاستنادًا إلى نطاقات السوق العامة، فإن التكلفة التقريبية لتأسيس الشركة تكون في حدود: ${min}–${max} درهم إماراتي.\nيمكن تعديل هذه الأرقام حسب المنطقة الحرة، نوع المكتب والخدمات الإضافية.`;

      await sendMessage(from, msg);
      return res.sendStatus(200);
    }

    // MEMORY
    session.history.push({ role: "user", text });
    if (session.history.length > 10) session.history.shift();

    const historyText = session.history
      .map((m) => `User: ${m.text}`)
      .join("\n");

    const prompt =
      lang === "tr"
        ? `Sen SamChe Company LLC'nin resmi ve kurumsal yapay zekâ asistanısın.\n\nŞirket profili:\n${samcheProfile}\n\nRolün:\n- Dubai şirket kuruluş danışmanı\n- BAE pazar ve iş stratejisi danışmanı\n- Özel yapay zekâ ve dijital büyüme danışmanı\n\nKurallar:\n- Profesyonel, net ve uygulanabilir cevaplar ver.\n- Fiyat, süreç, strateji ve yol haritası konusunda adım adım yönlendirme yap.\n- SamChe Company LLC'nin kurumsal imajına uygun, güven veren bir tonda konuş.\n- Gerektiğinde canlı temsilciye yönlendirebileceğini belirt.\n\nSohbet geçmişi:\n${historyText}\n\nKullanıcının son mesajı:\n${text}`
        : lang === "en"
        ? `You are the official, corporate AI assistant of SamChe Company LLC.\n\nCompany profile:\n${samcheProfile}\n\nYour role:\n- Dubai business setup consultant\n- UAE market and strategy advisor\n- Private AI and digital growth consultant\n\nRules:\n- Provide professional, clear and actionable answers.\n- Guide step‑by‑step on costs, structure, strategy and next steps.\n- Maintain a confident, advisory tone aligned with SamChe’s brand.\n- When appropriate, you may suggest speaking with a live consultant.\n\nConversation history:\n${historyText}\n\nUser's latest message:\n${text}`
        : `أنت المساعد الذكي الرسمي لشركة SamChe Company LLC.\n\nملف الشركة:\n${samcheProfile}\n\nدورك:\n- مستشار لتأسيس الأعمال في دبي\n- مستشار لاستراتيجية السوق في الإمارات\n- مستشار لحلول الذكاء الاصطناعي والنمو الرقمي\n\nالقواعد:\n- قدّم إجابات مهنية وواضحة وقابلة للتنفيذ.\n- ارشد المستخدم خطوة بخطوة في التكاليف، الهيكلة، الاستراتيجية والخطوات التالية.\n- استخدم نبرة رسمية وموثوقة تتماشى مع هوية SamChe.\n- عند الحاجة، يمكنك اقتراح التواصل مع مستشار مباشر.\n\nسياق المحادثة:\n${historyText}\n\nرسالة المستخدم الأخيرة:\n${text}`;

    const reply = await callGemini(prompt, lang);

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
