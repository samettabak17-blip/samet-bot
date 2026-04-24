// =====================================================
// SAMCHE INTELLIGENCE CORE
// PART A
// FOUNDATION + ENV + SERVER + MEMORY + LANGUAGE
// =====================================================

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const http = require("http");
const cron = require("node-cron");

// =====================================================
// ENV CHECK
// =====================================================

const REQUIRED_ENV = [
  "OPENAI_API_KEY",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_ID",
  "VERIFY_TOKEN"
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing ENV: ${key}`);
    process.exit(1);
  }
}

// =====================================================
// CONFIG
// =====================================================

const PORT = Number(process.env.PORT || 10000);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const GPT_MODEL =
  process.env.OPENAI_MODEL || "gpt-5-mini";

// =====================================================
// APP
// =====================================================

const app = express();

app.use(
  express.json({
    limit: "10mb"
  })
);

const server =
  http.createServer(app);

// =====================================================
// HELPERS
// =====================================================

function now() {
  return Date.now();
}

function log(...args) {
  console.log(
    new Date().toISOString(),
    ...args
  );
}

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeText(value = "") {
  return String(value)
    .trim()
    .slice(0, 3000);
}

// =====================================================
// SESSION MEMORY
// =====================================================

const sessions =
  new Map();

function createSession(userId) {
  return {
    userId,

    createdAt: now(),
    updatedAt: now(),
    lastMessageAt: now(),

    greeted: false,

    language: "tr",

    topic: "general",
    subTopic: null,

    selectedPath: null,

    history: [],

    ping10Sent: false,
    ping3hSent: false,
    ping24hSent: false
  };
}

function getSession(userId) {
  if (
    !sessions.has(
      userId
    )
  ) {
    sessions.set(
      userId,
      createSession(userId)
    );
  }

  const s =
    sessions.get(
      userId
    );

  s.updatedAt =
    now();

  s.lastMessageAt =
    now();

  return s;
}

function remember(
  session,
  role,
  text
) {
  session.history.push({
    role,
    text,
    at: now()
  });

  if (
    session.history
      .length > 12
  ) {
    session.history.shift();
  }
}

// =====================================================
// LANGUAGE ENGINE
// =====================================================

function detectLanguage(
  text,
  previous = "tr"
) {
  if (!text) {
    return previous;
  }

  // Arabic chars
  if (
    /[\u0600-\u06FF]/.test(
      text
    )
  ) {
    return "ar";
  }

  const raw =
    String(text).toLowerCase();

  const clean =
    normalizeText(text);

  let tr = 0;
  let en = 0;

  const trWords = [
    "merhaba",
    "sirket",
    "oturum",
    "vize",
    "fiyat",
    "nasil",
    "istiyorum",
    "yardim"
  ];

  const enWords = [
    "hello",
    "company",
    "visa",
    "residency",
    "price",
    "cost",
    "how",
    "want",
    "help"
  ];

  for (const w of trWords) {
    if (
      clean.includes(w)
    ) tr++;
  }

  for (const w of enWords) {
    if (
      raw.includes(w)
    ) en++;
  }

  if (
    /[çğıöşü]/i.test(
      text
    )
  ) {
    tr += 5;
  }

  if (tr >= en) {
    return "tr";
  }

  if (en > tr) {
    return "en";
  }

  return previous;
}

// =====================================================
// GREETING
// =====================================================

function greeting(lang = "tr") {
  if (lang === "en") {
    return `Hello, I’m here to assist you on behalf of SamChe Company LLC.

I can help with company formation in Dubai, business plans, residency options, visas, costs and advisory services. How may I assist you today?`;
  }

  if (lang === "ar") {
    return `مرحباً، أنا هنا لمساعدتكم نيابةً عن SamChe Company LLC.

يمكنني مساعدتكم في تأسيس الشركات في دبي، خطط الأعمال، خيارات الإقامة، التأشيرات، التكاليف والخدمات الاستشارية. كيف يمكنني مساعدتكم اليوم؟`;
  }

  return `Merhaba, SamChe Company LLC adına size yardımcı olmak için buradayım.
Dubai’de şirket kuruluşu, iş planları, oturum seçenekleri, vizeler, maliyetler ve sonrasında sunduğumuz danışmanlık hizmetleriyle ilgili tüm sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?`;
}

// =====================================================
// HEALTHCHECK
// =====================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    bot: "INTELLIGENCE CORE",
    sessions:
      sessions.size
  });
});

// =====================================================
// SAMCHE INTELLIGENCE CORE
// PART B
// RULE ENGINE + GPT + MAIN BRAIN
// =====================================================

// =====================================================
// SAFE FALLBACK
// =====================================================

function fallback(lang = "tr") {
  if (lang === "en") {
    return "Could you clarify your request a little more so I can guide you accurately?";
  }

  if (lang === "ar") {
    return "هل يمكن توضيح طلبكم بشكل أكبر حتى أتمكن من إرشادكم بدقة؟";
  }

  return "Size doğru yönlendirme yapabilmem için talebinizi biraz daha netleştirebilir misiniz?";
}

// =====================================================
// TOPIC DETECTION
// =====================================================

function detectTopic(text) {
  const t = normalizeText(text);

  if (
    t.includes("oturum") ||
    t.includes("visa") ||
    t.includes("vize") ||
    t.includes("residency") ||
    t.includes("sponsorlu")
  ) {
    return "residency";
  }

  if (
    t.includes("sirket") ||
    t.includes("company") ||
    t.includes("mainland") ||
    t.includes("freezone")
  ) {
    return "company";
  }

  if (
    t.includes("ai") ||
    t.includes("chatbot") ||
    t.includes("otomasyon")
  ) {
    return "ai";
  }

  return "general";
}

// =====================================================
// RULE RESPONSES
// =====================================================

function residencyMain(lang = "tr") {
  if (lang === "en") {
    return `There are 3 common residency options in Dubai:

• Sponsored residency
• Residency through real estate investment
• Residency by establishing your own company

Which option would you like to explore?`;
  }

  if (lang === "ar") {
    return `هناك 3 خيارات شائعة للإقامة في دبي:

• إقامة برعاية جهة راعية
• إقامة عبر الاستثمار العقاري
• إقامة من خلال تأسيس شركة

ما الخيار الذي ترغبون بمعرفته؟`;
  }

  return `Dubai’de genel olarak 3 ana oturum seçeneği bulunmaktadır:

• Sponsorlu oturum
• Gayrimenkul yatırımı yoluyla oturum
• Şirket kurarak yatırımcı oturumu

Hangi seçenekle ilgileniyorsunuz?`;
}

function sponsoredReply(lang = "tr") {
  if (lang === "en") {
    return `Sponsored residency is a practical solution for living in Dubai without opening your own company. Approximate packages start from 13,000 AED. Would you like timeline or document details?`;
  }

  if (lang === "ar") {
    return `الإقامة بالرعاية حل عملي للعيش في دبي دون تأسيس شركة. تبدأ الباقات التقريبية من 13,000 درهم. هل ترغبون بمعرفة المدة أو المستندات؟`;
  }

  return `Sponsorlu oturum, kendi şirketinizi kurmadan Dubai’de yaşamak isteyenler için pratik bir çözümdür. Paketler genel olarak 13.000 AED seviyesinden başlar. Süreç veya evrak detaylarını ister misiniz?`;
}

function companyReply(lang = "tr") {
  if (lang === "en") {
    return `Dubai company setup is generally structured through Mainland and Free Zone models. The right option depends on your sector and visa needs. Which sector are you planning for?`;
  }

  if (lang === "ar") {
    return `يتم تأسيس الشركات في دبي غالباً عبر البر الرئيسي أو المنطقة الحرة. يعتمد الخيار الأفضل على النشاط وعدد التأشيرات. ما هو نشاطكم؟`;
  }

  return `Dubai’de şirket kuruluşu genellikle Mainland ve Free Zone modelleri üzerinden planlanır. En doğru yapı sektörünüze ve vize ihtiyacınıza göre belirlenir. Hangi sektörde faaliyet göstermek istiyorsunuz?`;
}

function aiReply(lang = "tr") {
  if (lang === "en") {
    return `We provide AI chatbots, automation systems, and customer response solutions tailored for businesses. Would you like WhatsApp or website automation?`;
  }

  if (lang === "ar") {
    return `نقدم روبوتات ذكاء اصطناعي وأنظمة أتمتة وحلول تواصل للشركات. هل ترغبون بحلول واتساب أم الموقع الإلكتروني؟`;
  }

  return `İşletmelere özel AI chatbotları, otomasyon sistemleri ve müşteri iletişim çözümleri sunuyoruz. WhatsApp mı yoksa web sitesi için mi düşünüyorsunuz?`;
}

// =====================================================
// GPT SUPPORT
// =====================================================

async function askGPT(session, userText) {
  try {
    const lang = session.language;

    const system =
      lang === "en"
        ? "You are a professional Dubai business consultant. Reply only in English."
        : lang === "ar"
        ? "أنت مستشار أعمال محترف في دبي. أجب بالعربية فقط."
        : "Sen profesyonel Dubai iş danışmanısın. Sadece Türkçe cevap ver.";

    const messages = [
      {
        role: "system",
        content: system
      }
    ];

    for (const h of session.history.slice(-6)) {
      messages.push({
        role: h.role,
        content: h.text
      });
    }

    messages.push({
      role: "user",
      content: userText
    });

    const response =
      await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: GPT_MODEL,
          messages,
          temperature: 0.4,
          max_tokens: 450
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

    return (
      response.data?.choices?.[0]?.message?.content ||
      fallback(lang)
    );

  } catch (error) {
    log("GPT ERROR:", error.message);
    return fallback(session.language);
  }
}

// =====================================================
// MAIN BRAIN
// =====================================================

async function buildReply(session, userText) {
  session.language =
    detectLanguage(
      userText,
      session.language
    );

  // First greeting
  if (!session.greeted) {
    session.greeted = true;
    return greeting(session.language);
  }

  remember(session, "user", userText);

  session.topic =
    detectTopic(userText);

  const clean =
    normalizeText(userText);

  // Residency rules
  if (session.topic === "residency") {

    if (
      clean.includes("sponsorlu") ||
      clean.includes("sponsor")
    ) {
      const msg =
        sponsoredReply(session.language);

      remember(session, "assistant", msg);
      return msg;
    }

    const msg =
      residencyMain(session.language);

    remember(session, "assistant", msg);
    return msg;
  }

  // Company rules
  if (session.topic === "company") {
    const msg =
      companyReply(session.language);

    remember(session, "assistant", msg);
    return msg;
  }

  // AI rules
  if (session.topic === "ai") {
    const msg =
      aiReply(session.language);

    remember(session, "assistant", msg);
    return msg;
  }

  // GPT support
  const msg =
    await askGPT(session, userText);

  remember(session, "assistant", msg);

  return msg;
}

// =====================================================
// SAMCHE INTELLIGENCE CORE
// PART C
// WHATSAPP WEBHOOK + CRON + STARTUP
// =====================================================

// =====================================================
// SEND MESSAGE
// =====================================================

async function sendWhatsAppMessage(to, body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          preview_url: false,
          body: String(body).slice(0, 4096)
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );
  } catch (error) {
    log("SEND ERROR:", error.message);
  }
}

// =====================================================
// WEBHOOK VERIFY
// =====================================================

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// =====================================================
// WEBHOOK RECEIVE
// =====================================================

app.post("/webhook", async (req, res) => {
  try {
    res.sendStatus(200);

    const msg =
      req.body?.entry?.[0]
        ?.changes?.[0]
        ?.value?.messages?.[0];

    if (!msg) return;
    if (msg.type !== "text") return;

    const from = msg.from;
    const text = safeText(
      msg.text?.body || ""
    );

    if (!from || !text) return;

    const session =
      getSession(from);

    // reset follow-up flags
    session.ping10Sent = false;
    session.ping3hSent = false;
    session.ping24hSent = false;

    const reply =
      await buildReply(
        session,
        text
      );

    if (!reply) return;

    await sendWhatsAppMessage(
      from,
      reply
    );

  } catch (error) {
    log(
      "WEBHOOK ERROR:",
      error.message
    );
  }
});

// =====================================================
// FOLLOW-UP CRON
// every minute
// =====================================================

cron.schedule("* * * * *", async () => {
  try {
    const current = now();

    for (const [id, s] of sessions) {
      const diff =
        current -
        s.lastMessageAt;

      const mins =
        diff / 60000;

      const hrs =
        diff / 3600000;

      let msg = null;

      // 10 min
      if (
        mins >= 10 &&
        !s.ping10Sent
      ) {
        s.ping10Sent = true;

        if (
          s.topic === "company"
        ) {
          msg =
            s.language === "en"
              ? "If your company plan is still active, I can help you choose the right structure."
              : s.language === "ar"
              ? "إذا كانت خطة الشركة ما زالت قائمة يمكنني مساعدتكم في اختيار الهيكل المناسب."
              : "Şirket planınız devam ediyorsa size uygun yapıyı belirlemenize yardımcı olabilirim.";
        }

        else if (
          s.topic === "residency"
        ) {
          msg =
            s.language === "en"
              ? "If your residency plan is still active, I can explain the best option for you."
              : s.language === "ar"
              ? "إذا كانت خطة الإقامة ما زالت قائمة يمكنني توضيح الخيار الأنسب لكم."
              : "Oturum planınız devam ediyorsa size en uygun seçeneği açıklayabilirim.";
        }

        else {
          msg =
            s.language === "en"
              ? "Whenever you're ready, we can continue."
              : s.language === "ar"
              ? "يمكننا المتابعة متى شئتم."
              : "Hazır olduğunuzda devam edebiliriz.";
        }
      }

      // 3 hour
      else if (
        hrs >= 3 &&
        !s.ping3hSent
      ) {
        s.ping3hSent = true;

        msg =
          s.language === "en"
            ? "We can continue whenever you'd like."
            : s.language === "ar"
            ? "يمكننا المتابعة في أي وقت يناسبكم."
            : "Dilediğiniz zaman devam edebiliriz.";
      }

      // 24 hour
      else if (
        hrs >= 24 &&
        !s.ping24hSent
      ) {
        s.ping24hSent = true;

        msg =
          s.language === "en"
            ? "I’ll be happy to assist whenever you're ready."
            : s.language === "ar"
            ? "سأكون سعيداً بمساعدتكم متى كنتم جاهزين."
            : "Hazır olduğunuzda memnuniyetle yardımcı olabilirim.";
      }

      if (msg) {
        await sendWhatsAppMessage(
          id,
          msg
        );
      }
    }

  } catch (error) {
    log(
      "CRON ERROR:",
      error.message
    );
  }
});

// =====================================================
// START SERVER
// =====================================================

server.listen(PORT, () => {
  log(
    `INTELLIGENCE CORE STARTED ON ${PORT}`
  );
});
