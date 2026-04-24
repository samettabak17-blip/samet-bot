// =====================================================
// FULL STABLE PRO APP.JS
// PART 1
// IMPORTS + ENV + SERVER + HELPERS
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

const server = http.createServer(app);

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
  return String(value).trim().slice(0, 3000);
}

// =====================================================
// HEALTHCHECK
// =====================================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    bot: "FULL STABLE PRO",
    status: "online"
  });
});

// =====================================================
// FULL STABLE PRO APP.JS
// PART 2
// SESSION + LANGUAGE + GREETING
// =====================================================

// =====================================================
// MEMORY
// =====================================================

const sessions = new Map();

function createSession(userId) {
  return {
    userId,

    createdAt: now(),
    updatedAt: now(),
    lastMessageAt: now(),

    greeted: false,
    language: "tr",

    topic: "general",

    history: [],

    ping10Sent: false,
    ping3hSent: false,
    ping24hSent: false
  };
}

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(
      userId,
      createSession(userId)
    );
  }

  const s = sessions.get(userId);

  s.updatedAt = now();
  s.lastMessageAt = now();

  return s;
}

function remember(session, role, text) {
  session.history.push({
    role,
    text,
    at: now()
  });

  if (session.history.length > 10) {
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

  // Arabic letters
  if (
    /[\u0600-\u06FF]/.test(text)
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
    "ucret",
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
    if (clean.includes(w)) tr++;
  }

  for (const w of enWords) {
    if (raw.includes(w)) en++;
  }

  if (/[çğıöşü]/i.test(text)) {
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

I can help with company setup in Dubai, residency options, visas, costs and advisory services. How may I assist you today?`;
  }

  if (lang === "ar") {
    return `مرحباً، أنا هنا لمساعدتكم نيابةً عن SamChe Company LLC.

يمكنني مساعدتكم في تأسيس الشركات في دبي، خيارات الإقامة، التأشيرات، التكاليف والخدمات الاستشارية. كيف يمكنني مساعدتكم اليوم؟`;
  }

  return `Merhaba, SamChe Company LLC adına size yardımcı olmak için buradayım.
Dubai’de şirket kuruluşu, iş planları, oturum seçenekleri, vizeler, maliyetler ve sonrasında sunduğumuz danışmanlık hizmetleriyle ilgili tüm sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?`;
}

// =====================================================
// SAFE FALLBACK
// =====================================================

function fallback(lang = "tr") {
  if (lang === "en") {
    return "Could you clarify your request so I can guide you accurately?";
  }

  if (lang === "ar") {
    return "هل يمكن توضيح طلبكم حتى أتمكن من مساعدتكم بدقة؟";
  }

  return "Size doğru yönlendirme yapabilmem için talebinizi biraz daha netleştirebilir misiniz?";
}

// =====================================================
// FULL STABLE PRO APP.JS
// PART 3
// RULES + GPT + WEBHOOK
// =====================================================

// =====================================================
// RULE ENGINE
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
    t.includes("fiyat") ||
    t.includes("maliyet") ||
    t.includes("ucret") ||
    t.includes("price")
  ) {
    return "price";
  }

  return "general";
}

function residencyReply(lang = "tr", text = "") {
  const t = normalizeText(text);

  if (
    t.includes("sponsorlu")
  ) {
    if (lang === "en") {
      return `Sponsored residency is a practical option to live in Dubai without opening your own company. Approximate packages start from 13,000 AED. Would you like timeline or document details?`;
    }

    if (lang === "ar") {
      return `الإقامة بالرعاية خيار عملي للعيش في دبي دون تأسيس شركة. تبدأ الباقات التقريبية من 13,000 درهم. هل ترغبون بمعرفة المدة أو المستندات؟`;
    }

    return `Sponsorlu oturum, kendi şirketinizi kurmadan Dubai’de yaşamak isteyenler için pratik bir seçenektir. Paketler genel olarak 13.000 AED seviyesinden başlar. Süreç veya evrak detaylarını ister misiniz?`;
  }

  if (lang === "en") {
    return `There are 3 common residency options in Dubai:

• Sponsored residency
• Residency through real estate investment
• Residency by establishing your own company

Which option interests you most?`;
  }

  if (lang === "ar") {
    return `هناك 3 خيارات شائعة للإقامة في دبي:

• إقامة برعاية جهة راعية
• إقامة عبر الاستثمار العقاري
• إقامة من خلال تأسيس شركة

ما الخيار الأقرب لكم؟`;
  }

  return `Dubai’de genel olarak 3 ana oturum seçeneği bulunmaktadır:

• Sponsorlu oturum
• Gayrimenkul yatırımı yoluyla oturum
• Şirket kurarak yatırımcı oturumu

Hangi seçenekle ilgileniyorsunuz?`;
}

function companyReply(lang = "tr") {
  if (lang === "en") {
    return `Dubai company setup is generally structured through Mainland and Free Zone models. The best option depends on your sector and visa needs. Which sector are you planning for?`;
  }

  if (lang === "ar") {
    return `يتم تأسيس الشركات في دبي غالباً عبر البر الرئيسي أو المنطقة الحرة. يعتمد الخيار الأفضل على النشاط وعدد التأشيرات. ما هو نشاطكم؟`;
  }

  return `Dubai’de şirket kuruluşu genellikle Mainland ve Free Zone modelleri üzerinden planlanır. En doğru yapı sektörünüze ve vize ihtiyacınıza göre belirlenir. Hangi sektörde faaliyet göstermek istiyorsunuz?`;
}

// =====================================================
// GPT SUPPORT
// =====================================================

async function askGPT(session, userText) {
  try {
    const lang = session.language;

    const system =
      lang === "en"
        ? "You are a professional Dubai company setup consultant. Reply only in English."
        : lang === "ar"
        ? "أنت مستشار احترافي لتأسيس الشركات في دبي. أجب بالعربية فقط."
        : "Sen profesyonel Dubai şirket kuruluş danışmanısın. Sadece Türkçe cevap ver.";

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
          max_tokens: 400
        },
        {
          headers: {
            Authorization:
              `Bearer ${OPENAI_API_KEY}`,
            "Content-Type":
              "application/json"
          }
        }
      );

    return (
      response.data
        ?.choices?.[0]
        ?.message?.content ||
      fallback(lang)
    );

  } catch (error) {
    log("GPT ERROR:", error.message);
    return fallback(
      session.language
    );
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

  if (!session.greeted) {
    session.greeted = true;
    return greeting(
      session.language
    );
  }

  remember(
    session,
    "user",
    userText
  );

  session.topic =
    detectTopic(
      userText
    );

  if (
    session.topic ===
    "residency"
  ) {
    const msg =
      residencyReply(
        session.language,
        userText
      );

    remember(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  if (
    session.topic ===
    "company"
  ) {
    const msg =
      companyReply(
        session.language
      );

    remember(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  const msg =
    await askGPT(
      session,
      userText
    );

  remember(
    session,
    "assistant",
    msg
  );

  return msg;
}

// =====================================================
// WHATSAPP SEND
// =====================================================

async function sendWhatsAppMessage(to, body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product:
          "whatsapp",
        to,
        type: "text",
        text: {
          preview_url: false,
          body
        }
      },
      {
        headers: {
          Authorization:
            `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type":
            "application/json"
        }
      }
    );
  } catch (error) {
    log("SEND ERROR:", error.message);
  }
}

// =====================================================
// FULL STABLE PRO APP.JS
// PART 4
// WEBHOOK + CRON + STARTUP
// =====================================================

// =====================================================
// WEBHOOK VERIFY
// =====================================================

app.get("/webhook", (req, res) => {
  const mode =
    req.query["hub.mode"];

  const token =
    req.query["hub.verify_token"];

  const challenge =
    req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {
    return res
      .status(200)
      .send(challenge);
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
    const text =
      safeText(
        msg.text?.body || ""
      );

    if (!from || !text) return;

    const session =
      getSession(from);

    // reset ping flags
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
// Every minute
// =====================================================

cron.schedule("* * * * *", async () => {
  try {
    const current =
      now();

    for (const [
      id,
      s
    ] of sessions) {
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
          s.topic ===
          "company"
        ) {
          msg =
            s.language ===
            "en"
              ? "If your company plan is still active, I can help you choose the right structure."
              : s.language ===
                "ar"
              ? "إذا كانت خطة الشركة ما زالت قائمة يمكنني مساعدتكم في اختيار الهيكل المناسب."
              : "Şirket planınız devam ediyorsa size uygun yapıyı belirlemenize yardımcı olabilirim.";
        }

        else if (
          s.topic ===
          "residency"
        ) {
          msg =
            s.language ===
            "en"
              ? "If your residency plan is still active, I can explain the best option for you."
              : s.language ===
                "ar"
              ? "إذا كانت خطة الإقامة ما زالت قائمة يمكنني توضيح الخيار الأنسب لكم."
              : "Oturum planınız devam ediyorsa size en uygun seçeneği açıklayabilirim.";
        }

        else {
          msg =
            s.language ===
            "en"
              ? "Whenever you're ready, we can continue."
              : s.language ===
                "ar"
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
          s.language ===
          "en"
            ? "We can continue whenever you'd like."
            : s.language ===
              "ar"
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
          s.language ===
          "en"
            ? "I’ll be happy to assist whenever you're ready."
            : s.language ===
              "ar"
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
    `FULL STABLE PRO STARTED ON ${PORT}`
  );
});

