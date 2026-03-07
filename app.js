// app.js – WhatsApp + Gemini 2.0 Flash (final)

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
    "BAE şirket kuruluşu, vizeler, oturum, yaşam maliyetleri, iş planları, iş stratejileri, yapay zekâ çözümleri ve webchat AI chatbot hizmetleri hakkında sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?\n\n",
  en:
    "Hello, I am the AI consultant of SamChe Company LLC.\n" +
    "I can answer your questions about UAE company formation, residency, visas, cost of living, business plans, business strategies, AI solutions, and webchat AI chatbot services. How can I assist you?\n\n",
  ar:
    "مرحبًا، أنا المساعد الذكي لشركة SamChe Company LLC.\n" +
    "أستطيع مساعدتك في تأسيس الشركات في الإمارات، الإقامة، التأشيرات، تكاليف المعيشة، خطط الأعمال، الاستراتيجيات، حلول الذكاء الاصطناعي وخدمة روبوت الدردشة الذكي (Webchat AI Chatbot). كيف يمكنني مساعدتك؟\n\n",
};

const contactText = {
  tr: "Canlı temsilci: +971 52 728 8586",
  en: "Live consultant: +971 52 728 8586",
  ar: "مستشار مباشر: ‎+971 52 728 8586",
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
        lastMessageTime: Date.now(),
        followUpSent: false,
      };

      await sendMessage(
        from,
        "Welcome to SamChe Company LLC.\n" +
          "SamChe Company LLC'ye hoş geldiniz.\n" +
          "مرحبًا بكم.\n\n" +
          "Please select your language:\n" +
          "1️⃣ English\n" +
          "2️⃣ Türkçe\n" +
          "3️⃣ العربية\n\n" +
          "Lütfen dil seçiminizi yapınız:\n" +
          "1️⃣ İngilizce\n" +
          "2️⃣ Türkçe\n" +
          "3️⃣ Arapça"
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

    // CONTACT
    if (
      lower.includes("contact") ||
      lower.includes("iletişim") ||
      lower.includes("whatsapp") ||
      lower.includes("call") ||
      lower.includes("telefon")
    ) {
      await sendMessage(from, contactText[lang]);
      return res.sendStatus(200);
    }

    // AI CHATBOT PRICE / PLAN REDIRECT
    if (
      lower.includes("ai bot") ||
      lower.includes("chatbot") ||
      lower.includes("bot fiyat") ||
      lower.includes("ai fiyat") ||
      lower.includes("chatbot fiyat") ||
      lower.includes("webchat") ||
      lower.includes("ai plan") ||
      lower.includes("bot plan")
    ) {
      await sendMessage(
        from,
        "AI chatbot fiyat ve planları için şu sayfayı ziyaret edebilirsiniz:\nhttps://aichatbot.samchecompany.com"
      );
      return res.sendStatus(200);
    }

    // MEMORY UPDATE
    session.history.push({ role: "user", text });
    if (session.history.length > 10) session.history.shift();
    session.lastMessageTime = Date.now();
    session.followUpSent = false;

    const historyText = session.history
      .map((m) => `User: ${m.text}`)
      .join("\n");

    // PROMPT
    const prompt =
      lang === "tr"
        ? `SamChe Company LLC’nin kurumsal yapay zekâ danışmanısın. Profesyonel, stratejik, analitik ve yol gösterici cevaplar ver.Kullanıcı iletişim bilgileri istendiğinde ya da canlı bir temsilci ile doğrudan sohbet etmek istediğinde, iletişim bilgilerini doğrudan verme.önce kullanıcının niyetini öğren,Kullanıcı bilgi aldıktan sonra kullanıcıyı bilgilendirdikten sonra ciddi niyet gösterirse (şirket kurmak, oturum almak, Dubai’de işlem yapmak) onu canlı danışmana yönlendir ve iletişim bilgilerini ver. Ciddi niyet yoksa iletişim bilgisi verme.Kullanıcıya detaylı bilgi vermeden uzman bir danışmanla sizi görüştüreceğiz gibi söylemler kullanma.Öncelikli amacın kullanıcının niyetini anlamak ve detaylı bilgi vermek olsun. Eğer kullanıcı sadece sohbet ediyor, bilgi alıyor, merak ediyor, ciddi değilse,İletişim bilgisi asla verme,sadece bilgi ver.hiçbir mesaja iletişim bilgisi ekleme.kullanıcı iletişim bilgisi alma konusunda ısrarcı olursa(3-4 kez iletişim bilgisi isterse) sadece 1 kere ver.iletişim bilgileri: mail:info@samchecompany.com-telefon: +971 50 179 38 80 - +971 52 662 28 75- web: https://samchecompany.com- instagram: https://www.instagram.com/samchecompany - linkedin:https://www.linkedin.com/company/samche-company-llc Linkleri asla Markdown formatında yazma. Linkleri sadece düz metin olarak yaz. Sohbet geçmişi:\n${historyText}\n\nKullanıcının son mesajı:\n${text}`
        : lang === "en"
        ? `You are the senior corporate AI consultant of SamChe Company LLC. Provide strategic, structured, analytical, advisory answers. Do not directly share contact details or connect to a live consultant unless the user clearly shows serious intent (such as setting up a company, obtaining residency, or doing business in Dubai) after receiving sufficient information. Your primary goal is to understand the user's intent and provide detailed, helpful information. If the user is only chatting, exploring, or casually asking, do not share any contact details. Only if the user insists 3–4 times specifically asking for contact details, share them once. Contact details: mail: info@samchecompany.com - phone: +971 50 179 38 80 - +971 52 662 28 75 - web: https://samchecompany.com - instagram: https://www.instagram.com/samchecompany - linkedin: https://www.linkedin.com/company/samche-company-llc. Never format links in Markdown, always plain text. Conversation history:\n${historyText}\n\nUser message:\n${text}`
        : `أنت المستشار الذكي لشركة SamChe Company LLC. قدّم إجابات مهنية، تحليلية واستشارية. لا تشارك بيانات التواصل أو تربط المستخدم بمستشار مباشر إلا إذا أظهر نية جدية واضحة (مثل تأسيس شركة، الحصول على إقامة، أو القيام بأعمال في دبي) بعد حصوله على معلومات كافية. هدفك الأساسي هو فهم نية المستخدم وتقديم معلومات تفصيلية ومفيدة. إذا كان المستخدم فقط يستفسر أو يتحدث بشكل عام، فلا تشارك أي بيانات تواصل. إذا أصر المستخدم 3–4 مرات على طلب بيانات التواصل، شاركها مرة واحدة فقط. بيانات التواصل: mail: info@samchecompany.com - phone: +971 50 179 38 80 - +971 52 662 28 75 - web: https://samchecompany.com - instagram: https://www.instagram.com/samchecompany - linkedin: https://www.linkedin.com/company/samche-company-llc. لا تكتب الروابط بصيغة Markdown، بل كنص عادي فقط. سياق المحادثة:\n${historyText}\n\nرسالة المستخدم:\n${text}`;

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

// -------------------------------
//  24 SAAT HATIRLATMA SİSTEMİ
// -------------------------------
setInterval(async () => {
  const now = Date.now();

  for (const user in sessions) {
    const s = sessions[user];
    if (!s.lastMessageTime) continue;

    const diffHours = (now - s.lastMessageTime) / (1000 * 60 * 60);

    if (!s.followUpSent && diffHours >= 24) {
      const reminderMessage =
        "Merhaba, SamChe Company LLC olarak önceki görüşmemiz kapsamında ilerlemeyi değerlendirmek üzere tekrar iletişime geçiyorum. Dubai’de şirket kurma, oturum alma gibi konularda son kararınız nedir? Hazır olduğunuzda süreci birlikte netleştirip bir sonraki adıma geçebiliriz.";

      await sendMessage(user, reminderMessage);

      s.followUpSent = true;
    }
  }
}, 60 * 60 * 1000);

// -------------------------------
//  SERVER
// -------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("SamChe Bot running on port " + port));
