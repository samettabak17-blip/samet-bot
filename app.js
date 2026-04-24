// =====================================================
// SAMCHE COMPANY LLC
// FULL CLEAN REBUILD - PART 1
// FOUNDATION + ENV + SERVER + MEMORY + LANGUAGE ENGINE
// Production Ready Base
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
    console.error(`Missing ENV variable: ${key}`);
    process.exit(1);
  }
}

// =====================================================
// CONSTANTS
// =====================================================

const PORT = process.env.PORT || 10000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "";

const GPT_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

// =====================================================
// EXPRESS SERVER
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

function digitsOnly(value = "") {
  return String(value).replace(/\D/g, "");
}

// =====================================================
// MEMORY STORE
// In-memory stable session system
// =====================================================

const sessions = new Map();

// =====================================================
// SESSION MODEL
// =====================================================

function createSession(userId) {
  return {
    userId,

    createdAt: now(),
    updatedAt: now(),
    lastMessageAt: now(),

    greeted: false,

    language: "tr",

    history: [],

    lastTopic: null,
    lastSubTopic: null,

    sector: null,
    visaNeed: null,
    budget: null,

    leadScore: 0,

    ping10Sent: false,
    ping3hSent: false,
    ping24hSent: false,

    pauseUntil: null,

    alertSentAt: null,

    duplicateLastText: null,
    duplicateLastAt: 0
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

  return s;
}

// =====================================================
// HISTORY ENGINE
// =====================================================

function rememberMessage(
  session,
  role,
  content
) {
  session.history.push({
    role,
    content,
    at: now()
  });

  if (
    session.history.length >
    20
  ) {
    session.history.shift();
  }
}

// =====================================================
// DUPLICATE SHIELD
// =====================================================

function isDuplicate(
  session,
  text
) {
  const clean =
    normalizeText(text);

  const same =
    session.duplicateLastText ===
    clean;

  const recent =
    now() -
      session.duplicateLastAt <
    7000;

  session.duplicateLastText =
    clean;

  session.duplicateLastAt =
    now();

  return same && recent;
}

// =====================================================
// LANGUAGE ENGINE
// Turkish hard lock + EN + AR
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
    /[\u0600-\u06FF]/.test(
      text
    )
  ) {
    return "ar";
  }

  const raw =
    String(text).toLowerCase();

  const t =
    normalizeText(text);

  const trWords = [
    "merhaba",
    "nasil",
    "sirket",
    "kurmak",
    "oturum",
    "vize",
    "ucret",
    "fiyat",
    "yardim",
    "istiyorum",
    "dubai",
    "ne kadar",
    "hangi",
    "sadece",
    "calismak"
  ];

  const enWords = [
    "hello",
    "hi",
    "company",
    "setup",
    "business",
    "visa",
    "residency",
    "cost",
    "price",
    "how",
    "want",
    "need",
    "services",
    "dubai"
  ];

  let tr = 0;
  let en = 0;

  for (const w of trWords) {
    if (t.includes(w)) tr++;
  }

  for (const w of enWords) {
    if (raw.includes(w)) en++;
  }

  // Turkish chars strong bonus
  if (
    /[çğıöşü]/i.test(text)
  ) {
    tr += 4;
  }

  // Turkish sentence patterns
  if (
    t.includes(" istiyorum") ||
    t.includes(" nasil") ||
    t.includes(" olur mu")
  ) {
    tr += 3;
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
// PAUSE MODE
// =====================================================

function isPaused(
  session
) {
  if (
    !session.pauseUntil
  ) {
    return false;
  }

  return (
    now() <
    session.pauseUntil
  );
}

function pauseSession(
  session,
  hours = 6
) {
  session.pauseUntil =
    now() +
    hours *
      60 *
      60 *
      1000;
}

// =====================================================
// ROOT HEALTHCHECK
// =====================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    bot: "SAMCHE FULL CLEAN REBUILD",
    status: "booting",
    sessions:
      sessions.size
  });
});

// =====================================================
// SAMCHE COMPANY LLC
// FULL CLEAN REBUILD - PART 2
// GREETING + INTENT ENGINE + BUSINESS KNOWLEDGE + TEXTS
// APPEND UNDER PART 1
// =====================================================

// =====================================================
// GREETING ENGINE
// =====================================================

function greetingMessage(
  lang = "tr"
) {
  if (lang === "en") {
    return `Hello, I’m here to assist you on behalf of SamChe Company LLC.

I can help answer your questions regarding company formation in Dubai, business plans, residency options, visas, costs, and our advisory services. How may I assist you today?`;
  }

  if (lang === "ar") {
    return `مرحباً، أنا هنا لمساعدتكم نيابةً عن SamChe Company LLC.

يمكنني الإجابة على استفساراتكم المتعلقة بتأسيس الشركات في دبي، خطط الأعمال، خيارات الإقامة، التأشيرات، التكاليف والخدمات الاستشارية. كيف يمكنني مساعدتكم اليوم؟`;
  }

  return `Merhaba, SamChe Company LLC adına size yardımcı olmak için buradayım.

Dubai’de şirket kuruluşu, iş planları, oturum seçenekleri, vizeler, maliyetler ve sonrasında sunduğumuz danışmanlık hizmetleriyle ilgili tüm sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?`;
}

// =====================================================
// LIVE AGENT MESSAGE
// =====================================================

function liveAgentMessage(
  lang = "tr"
) {
  if (lang === "en") {
    return `You may reach our professional advisory team via WhatsApp: +971 52 728 8586. Our live consultants will be happy to assist you.`;
  }

  if (lang === "ar") {
    return `يمكنكم التواصل مع فريقنا الاستشاري عبر واتساب: +971 52 728 8586 وسيسعد مستشارونا بخدمتكم.`;
  }

  return `Profesyonel danışmanlık ekibimize WhatsApp üzerinden ulaşabilirsiniz: +971 52 728 8586. Canlı temsilcilerimiz size memnuniyetle yardımcı olacaktır.`;
}

// =====================================================
// BANK INFO
// =====================================================

function bankInfo() {
  return `Account holder: SamChe Company LLC
Account Type: USD $
Account number: 9726414926
IBAN: AE210860000009726414926
BIC: WIOBAEADXXX

mail: info@samchecompany.com
telefon: +971 50 179 38 80
WhatsApp: +971 52 728 8586`;
}

// =====================================================
// INTENT ENGINE
// =====================================================

function detectIntent(
  text
) {
  const t =
    normalizeText(text);

  // residency first
  const residencyWords = [
    "oturum",
    "residency",
    "visa",
    "vize",
    "calismak istiyorum",
    "dubai de calismak",
    "yasamak istiyorum",
    "tasinmak istiyorum",
    "sponsorlu"
  ];

  for (const w of residencyWords) {
    if (t.includes(w)) {
      return "residency";
    }
  }

  const companyWords = [
    "sirket",
    "company",
    "business",
    "setup",
    "mainland",
    "freezone",
    "free zone",
    "lisans",
    "license"
  ];

  for (const w of companyWords) {
    if (t.includes(w)) {
      return "company";
    }
  }

  const aiWords = [
    "chatbot",
    "ai",
    "yapay zeka",
    "automation",
    "otomasyon",
    "crm"
  ];

  for (const w of aiWords) {
    if (t.includes(w)) {
      return "ai";
    }
  }

  const trustWords = [
    "guven",
    "güven",
    "real mi",
    "gercek mi",
    "safe mi"
  ];

  for (const w of trustWords) {
    if (t.includes(w)) {
      return "trust";
    }
  }

  return "general";
}

// =====================================================
// MEMORY EXTRACTION
// =====================================================

function extractData(
  session,
  text
) {
  const t =
    normalizeText(text);

  // visa number
  const visa =
    t.match(
      /(\d+)\s*(visa|vize)/
    );

  if (visa) {
    session.visaNeed =
      visa[1];
  }

  // budget
  const budget =
    t.match(
      /(\d+)\s*(aed|usd|tl)/
    );

  if (budget) {
    session.budget =
      budget[0];
  }

  // sectors
  const sectors = [
    "emlak",
    "restaurant",
    "restoran",
    "cafe",
    "consulting",
    "danismanlik",
    "trading",
    "ticaret",
    "software",
    "yazilim",
    "beauty",
    "guzellik"
  ];

  for (const s of sectors) {
    if (t.includes(s)) {
      session.sector = s;
      break;
    }
  }
}

// =====================================================
// CLOSING QUESTION ENGINE
// =====================================================

function closingQuestion(
  topic,
  lang = "tr"
) {
  const q = {
    company: {
      tr: "Hangi sektörde faaliyet göstermeyi planlıyorsunuz?",
      en: "Which sector are you planning to operate in?",
      ar: "ما هو القطاع الذي تخططون للعمل فيه؟"
    },

    residency: {
      tr: "Tek başınıza mı yoksa aile ile mi planlıyorsunuz?",
      en: "Are you planning alone or with family?",
      ar: "هل تخططون بمفردكم أم مع العائلة؟"
    },

    ai: {
      tr: "Bu sistemi WhatsApp için mi yoksa web siteniz için mi düşünüyorsunuz?",
      en: "Are you considering this for WhatsApp or your website?",
      ar: "هل تفكرون بهذا النظام لواتساب أم للموقع؟"
    },

    general: {
      tr: "Hangi konuda bilgi almak istediğinizi paylaşırsanız yardımcı olabilirim.",
      en: "Please let me know which topic you need help with.",
      ar: "يرجى توضيح الموضوع الذي ترغبون بالاستفسار عنه."
    }
  };

  return (
    q[topic]?.[lang] ||
    q.general[lang] ||
    q.general.tr
  );
}

// =====================================================
// COMPANY KNOWLEDGE RESPONSE
// =====================================================

function companyReply(
  session
) {
  const lang =
    session.language;

  if (lang === "en") {
    return `Dubai company formation is commonly structured through Mainland and Free Zone models.

Mainland is often suitable for stronger local operational presence or certain regulated activities. Free Zone is commonly preferred for consultancy, digital services, and flexible startup models.

The best option depends on your sector, visa needs, and long-term plan. ${closingQuestion("company", lang)}`;
  }

  if (lang === "ar") {
    return `يتم تأسيس الشركات في دبي غالباً عبر نموذجين رئيسيين: البر الرئيسي والمناطق الحرة.

البر الرئيسي مناسب لبعض الأنشطة التشغيلية والحضور المحلي الأقوى، بينما المناطق الحرة مناسبة كثيراً للاستشارات والخدمات الرقمية والنماذج المرنة.

يعتمد الخيار الأفضل على القطاع وعدد التأشيرات والخطة طويلة المدى. ${closingQuestion("company", lang)}`;
  }

  return `Dubai’de şirket kuruluşu genellikle Mainland ve Free Zone olmak üzere iki ana yapı üzerinden planlanır.

Mainland; yerel operasyon gücü gereken veya belirli faaliyet türleri için uygun olabilir. Free Zone ise danışmanlık, dijital hizmetler ve esnek başlangıç modellerinde sık tercih edilir.

En doğru yapı; sektörünüz, vize ihtiyacınız ve uzun vadeli hedefinize göre belirlenir. ${closingQuestion("company", lang)}`;
}

// =====================================================
// RESIDENCY KNOWLEDGE RESPONSE
// =====================================================

function residencyReply(
  lang = "tr"
) {
  if (lang === "en") {
    return `There are three common ways to obtain legal residency in Dubai:

1. Real estate investment
2. Sponsored residency solutions
3. Residency through establishing your own company

The right option depends on budget, timing, and long-term plans. Which route interests you the most?`;
  }

  if (lang === "ar") {
    return `هناك ثلاث طرق شائعة للحصول على إقامة قانونية في دبي:

1. الاستثمار العقاري
2. الإقامة عبر الكفالة
3. الإقامة من خلال تأسيس شركة

يعتمد الخيار الأنسب على الميزانية والوقت والخطة المستقبلية. ما الخيار الأقرب لكم؟`;
  }

  return `Dubai’de yasal oturum almak için genel olarak üç ana seçenek bulunmaktadır:

1. Gayrimenkul yatırımı üzerinden
2. Sponsorlu oturum çözümleri
3. Şirket kurarak yatırımcı / partner statüsünde

En uygun seçenek bütçenize, zaman planınıza ve hedefinize göre değişir. Hangi seçenekle ilgileniyorsunuz?`;
}

// =====================================================
// AI KNOWLEDGE RESPONSE
// =====================================================

function aiReply(
  lang = "tr"
) {
  if (lang === "en") {
    return `We provide WhatsApp chatbots, website assistants, lead automation systems, CRM integrations, and custom AI workflows designed to improve speed and conversion. ${closingQuestion("ai", lang)}`;
  }

  if (lang === "ar") {
    return `نقدم روبوتات واتساب، مساعدي المواقع، أتمتة العملاء، تكامل CRM، وحلول ذكاء اصطناعي مخصصة لزيادة السرعة والتحويلات. ${closingQuestion("ai", lang)}`;
  }

  return `WhatsApp chatbotları, web site asistanları, lead otomasyon sistemleri, CRM entegrasyonları ve işletmeye özel yapay zekâ çözümleri sunuyoruz. Amaç hız, verimlilik ve dönüşüm oranlarını artırmaktır. ${closingQuestion("ai", lang)}`;
}

// =====================================================
// SAMCHE COMPANY LLC
// FULL CLEAN REBUILD - PART 3
// GPT LAYER + WHATSAPP SEND + ALERTS + QUALITY FILTERS
// APPEND UNDER PART 2
// =====================================================

// =====================================================
// WHATSAPP SEND ENGINE
// =====================================================

async function sendWhatsAppMessage(
  to,
  body
) {
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
        },
        timeout: 30000
      }
    );

    log(
      "SENT:",
      to
    );

  } catch (error) {
    log(
      "SEND ERROR:",
      error?.response
        ?.data ||
        error.message
    );
  }
}

// =====================================================
// ADMIN ALERT ENGINE
// =====================================================

async function sendAdminAlert(
  message
) {
  try {
    if (
      !ADMIN_NUMBER
    ) return;

    await sendWhatsAppMessage(
      ADMIN_NUMBER,
      message
    );

  } catch (error) {
    log(
      "ADMIN ALERT ERROR:",
      error.message
    );
  }
}

function shouldAlert(
  session,
  clean
) {
  const hotWords = [
    "odeme",
    "payment",
    "baslayalim",
    "ready",
    "today",
    "teklif",
    "fiyat ver",
    "beni arayin",
    "call me",
    "numara ver",
    "evrak"
  ];

  for (const w of hotWords) {
    if (
      clean.includes(w)
    ) {
      return true;
    }
  }

  if (
    session.leadScore >=
    7
  ) {
    return true;
  }

  return false;
}

async function maybeSendAlert(
  session,
  userText
) {
  const clean =
    normalizeText(
      userText
    );

  if (
    !shouldAlert(
      session,
      clean
    )
  ) {
    return;
  }

  // cooldown 6h
  if (
    session.alertSentAt &&
    now() -
      session.alertSentAt <
      21600000
  ) {
    return;
  }

  session.alertSentAt =
    now();

  const msg =
`🔥 SAMCHE HOT LEAD

User: ${session.userId}
Language: ${session.language}
Topic: ${session.lastTopic || "general"}
Lead Score: ${session.leadScore}

Last Message:
${userText}`;

  await sendAdminAlert(
    msg
  );
}

// =====================================================
// QUALITY FILTERS
// =====================================================

function outputLooksEnglish(
  text = ""
) {
  const t =
    text.toLowerCase();

  const words = [
    "the",
    "your",
    "please",
    "company",
    "assist",
    "regarding"
  ];

  let score = 0;

  for (const w of words) {
    if (
      t.includes(w)
    ) score++;
  }

  return score >= 2;
}

function safeFallback(
  session
) {
  const lang =
    session.language;

  if (lang === "en") {
    return `I understood your request. I can assist with Dubai company setup, residency options, visas, costs, and business growth. Which area would you like to focus on?`;
  }

  if (lang === "ar") {
    return `تم فهم طلبكم. يمكنني مساعدتكم في تأسيس الشركات، الإقامة، التأشيرات، التكاليف وتطوير الأعمال في دبي. ما المجال الذي ترغبون بالتركيز عليه؟`;
  }

  return `Talebinizi anladım. Dubai’de şirket kuruluşu, oturum seçenekleri, vizeler, maliyetler ve iş geliştirme konularında yardımcı olabilirim. Hangi alana odaklanmak istersiniz?`;
}

function enforceLanguage(
  session,
  text
) {
  if (!text) {
    return safeFallback(
      session
    );
  }

  if (
    session.language ===
      "tr" &&
    outputLooksEnglish(
      text
    )
  ) {
    return safeFallback(
      session
    );
  }

  return text;
}

function strengthenReply(
  session,
  text
) {
  let msg =
    text.trim();

  if (
    msg.length < 120
  ) {
    msg +=
      " " +
      closingQuestion(
        session.lastTopic ||
          "general",
        session.language
      );
  }

  return msg;
}

function finalizeReply(
  session,
  text
) {
  let msg =
    enforceLanguage(
      session,
      text
    );

  msg =
    strengthenReply(
      session,
      msg
    );

  return msg;
}

// =====================================================
// GPT ENGINE
// =====================================================

async function askGPT(
  session,
  userText
) {
  const lang =
    session.language;

  const systemTR = `
Sen SamChe Company LLC'nin resmi premium danışmanısın.

Kurallar:
- Türkçe kullanıcıya sadece Türkçe cevap ver.
- Kısa cevap verme.
- Profesyonel, güven veren ve detaylı konuş.
- Dubai şirket kuruluşu, oturum, vize, maliyet, AI çözümleri konularında uzman gibi konuş.
- Başka kuruma yönlendirme yapma.
- Her cevabın sonunda yönlendirici soru sor.
`;

  const systemEN = `
You are the official premium consultant of SamChe Company LLC.

Rules:
- Reply only in English.
- Be detailed, strategic and professional.
- Expert in Dubai company setup, residency, visas, costs and AI services.
- Never redirect users elsewhere.
- End replies with a guiding question.
`;

  const systemAR = `
أنت المستشار الرسمي لشركة SamChe Company LLC.

القواعد:
- الرد بالعربية فقط.
- كن احترافياً وواضحاً ومفصلاً.
- خبير في تأسيس الشركات والإقامة والتأشيرات في دبي.
- اختم كل رد بسؤال مناسب.
`;

  const systemPrompt =
    lang === "en"
      ? systemEN
      : lang === "ar"
      ? systemAR
      : systemTR;

  const messages = [
    {
      role: "system",
      content:
        systemPrompt
    }
  ];

  for (const h of session.history.slice(-8)) {
    messages.push({
      role: h.role,
      content:
        h.content
    });
  }

  messages.push({
    role: "user",
    content:
      userText
  });

  try {
    const response =
      await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model:
            GPT_MODEL,
          messages,
          temperature: 0.45,
          max_tokens: 700
        },
        {
          headers: {
            Authorization:
              `Bearer ${OPENAI_API_KEY}`,
            "Content-Type":
              "application/json"
          },
          timeout: 45000
        }
      );

    const text =
      response.data
        .choices[0]
        .message.content
        .trim();

    return finalizeReply(
      session,
      text
    );

  } catch (error) {
    log(
      "GPT ERROR:",
      error.message
    );

    return safeFallback(
      session
    );
  }
}

// =====================================================
// SAMCHE COMPANY LLC
// FULL CLEAN REBUILD - PART 4
// MAIN BRAIN (buildReply) + SMART ROUTING
// APPEND UNDER PART 3
// =====================================================

async function buildReply(
  session,
  userText
) {
  // =================================================
  // PREP
  // =================================================

  const clean =
    normalizeText(
      userText
    );

  session.language =
    detectLanguage(
      userText,
      session.language
    );

  session.lastMessageAt =
    now();

  session.updatedAt =
    now();

  extractData(
    session,
    clean
  );

  // =================================================
  // PAUSED SESSION
  // =================================================

  if (
    isPaused(
      session
    )
  ) {
    return null;
  }

  // =================================================
  // DUPLICATE SHIELD
  // =================================================

  if (
    isDuplicate(
      session,
      clean
    )
  ) {
    return null;
  }

  // =================================================
  // FIRST GREETING
  // =================================================

  if (
    !session.greeted
  ) {
    session.greeted =
      true;

    const greet =
      greetingMessage(
        session.language
      );

    rememberMessage(
      session,
      "assistant",
      greet
    );

    return greet;
  }

  // =================================================
  // SAVE USER MESSAGE
  // =================================================

  rememberMessage(
    session,
    "user",
    userText
  );

  // =================================================
  // HUMAN REQUEST
  // =================================================

  if (
    clean.includes(
      "canli temsilci"
    ) ||
    clean.includes(
      "human"
    ) ||
    clean.includes(
      "manager"
    ) ||
    clean.includes(
      "yetkili"
    ) ||
    clean.includes(
      "beni arayin"
    )
  ) {
    pauseSession(
      session,
      6
    );

    const msg =
      liveAgentMessage(
        session.language
      );

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // =================================================
  // PAYMENT READY
  // =================================================

  if (
    clean.includes(
      "odeme"
    ) ||
    clean.includes(
      "payment"
    ) ||
    clean.includes(
      "baslayalim"
    ) ||
    clean.includes(
      "ready"
    ) ||
    clean.includes(
      "evrak"
    )
  ) {
    session.leadScore +=
      5;

    await maybeSendAlert(
      session,
      userText
    );

    const msg =
      session.language ===
      "en"
        ? `Thank you. Since you are ready to proceed, I’m sharing our payment details below.\n\n${bankInfo()}`
        : session.language ===
          "ar"
        ? `شكراً لكم. بما أنكم جاهزون للبدء، أشارك معكم تفاصيل الدفع أدناه.\n\n${bankInfo()}`
        : `Teşekkür ederim. Sürece başlamaya hazır olduğunuz için ödeme bilgilerini aşağıda paylaşıyorum.\n\n${bankInfo()}`;

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // =================================================
  // INTENT DETECT
  // =================================================

  const intent =
    detectIntent(
      clean
    );

  session.lastTopic =
    intent;

  // =================================================
  // RESIDENCY
  // =================================================

  if (
    intent ===
    "residency"
  ) {
    session.leadScore +=
      3;

    await maybeSendAlert(
      session,
      userText
    );

    const msg =
      residencyReply(
        session.language
      );

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // =================================================
  // COMPANY
  // =================================================

  if (
    intent ===
    "company"
  ) {
    session.leadScore +=
      3;

    await maybeSendAlert(
      session,
      userText
    );

    const msg =
      companyReply(
        session
      );

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // =================================================
  // AI
  // =================================================

  if (
    intent ===
    "ai"
  ) {
    session.leadScore +=
      2;

    await maybeSendAlert(
      session,
      userText
    );

    const msg =
      aiReply(
        session.language
      );

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // =================================================
  // TRUST
  // =================================================

  if (
    intent ===
    "trust"
  ) {
    const msg =
      session.language ===
      "en"
        ? `SamChe Company LLC operates with a professional and transparent approach. Clear communication, planning and structured processes are core principles. Which service are you evaluating at the moment?`
        : session.language ===
          "ar"
        ? `تعمل SamChe Company LLC بمنهج مهني وشفاف، مع وضوح في التواصل والتنظيم. ما الخدمة التي تقومون بتقييمها حالياً؟`
        : `SamChe Company LLC profesyonel ve şeffaf hizmet anlayışıyla çalışmaktadır. Net iletişim, planlama ve düzenli süreç yönetimi temel prensiplerimizdir. Şu anda hangi hizmeti değerlendiriyorsunuz?`;

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // =================================================
  // SPECIAL COMMON QUESTIONS
  // =================================================

  if (
    session.language ===
    "tr"
  ) {
    if (
      clean.includes(
        "dubai nasil"
      ) ||
      clean.includes(
        "dubai iyi mi"
      )
    ) {
      const msg =
        `Dubai; güvenli yaşam yapısı, güçlü ekonomi, modern şehir düzeni ve uluslararası iş ortamı ile öne çıkan bir merkezdir. Vergi avantajları ve hızlı süreçler nedeniyle girişimciler tarafından sık tercih edilir. Dubai’yi yaşam, yatırım veya şirket kuruluşu açısından mı değerlendiriyorsunuz?`;

      rememberMessage(
        session,
        "assistant",
        msg
      );

      return msg;
    }

    if (
      clean.includes(
        "fiyat"
      ) ||
      clean.includes(
        "maliyet"
      ) ||
      clean.includes(
        "ucret"
      ) ||
      clean.includes(
        "ne kadar"
      )
    ) {
      const msg =
        `Maliyet konusu; faaliyet alanı, seçilecek yapı, vize ihtiyacı ve hedefe göre değişmektedir. Bu nedenle ihtiyacınıza göre net tablo çıkarmak daha doğru olur. Şirket kuruluşu, oturum veya yapay zekâ hizmetlerinden hangisi için fiyat öğrenmek istiyorsunuz?`;

      rememberMessage(
        session,
        "assistant",
        msg
      );

      return msg;
    }
  }

  // =================================================
  // GPT FALLBACK
  // =================================================

  const msg =
    await askGPT(
      session,
      userText
    );

  rememberMessage(
    session,
    "assistant",
    msg
  );

  return msg;
}

// =====================================================
// SAMCHE COMPANY LLC
// FULL CLEAN REBUILD - PART 5
// WEBHOOK + ADMIN COMMANDS + CRON + STARTUP
// APPEND UNDER PART 4
// =====================================================

// =====================================================
// ADMIN COMMANDS
// Send from ADMIN_NUMBER:
//
// pause 905xxxxxxxxx
// resume 905xxxxxxxxx
// status 905xxxxxxxxx
// =====================================================

function isAdmin(from) {
  if (!ADMIN_NUMBER) {
    return false;
  }

  return (
    digitsOnly(from) ===
    digitsOnly(
      ADMIN_NUMBER
    )
  );
}

function parseAdminCommand(
  text
) {
  const clean =
    normalizeText(
      text
    );

  const parts =
    clean.split(" ");

  const cmd =
    parts[0];

  const target =
    digitsOnly(
      parts[1] || ""
    );

  if (
    ["pause", "resume", "status"]
      .includes(cmd) &&
    target
  ) {
    return {
      cmd,
      target
    };
  }

  return null;
}

async function runAdminCommand(
  from,
  command
) {
  const target =
    command.target;

  const session =
    getSession(
      target
    );

  // pause
  if (
    command.cmd ===
    "pause"
  ) {
    pauseSession(
      session,
      24
    );

    await sendWhatsAppMessage(
      from,
      `✅ Bot paused for ${target} (24h)`
    );

    return;
  }

  // resume
  if (
    command.cmd ===
    "resume"
  ) {
    session.pauseUntil =
      null;

    await sendWhatsAppMessage(
      from,
      `✅ Bot resumed for ${target}`
    );

    return;
  }

  // status
  if (
    command.cmd ===
    "status"
  ) {
    const paused =
      isPaused(
        session
      )
        ? "PAUSED"
        : "ACTIVE";

    await sendWhatsAppMessage(
      from,
      `📊 ${target}

Status: ${paused}
Language: ${session.language}
Topic: ${session.lastTopic || "general"}
Lead Score: ${session.leadScore}
Sector: ${session.sector || "-"}
Visa Need: ${session.visaNeed || "-"}`
    );
  }
}

// =====================================================
// WEBHOOK VERIFY
// =====================================================

app.get("/webhook", (req, res) => {
  const mode =
    req.query["hub.mode"];

  const token =
    req.query[
      "hub.verify_token"
    ];

  const challenge =
    req.query[
      "hub.challenge"
    ];

  if (
    mode ===
      "subscribe" &&
    token ===
      VERIFY_TOKEN
  ) {
    return res
      .status(200)
      .send(challenge);
  }

  return res.sendStatus(
    403
  );
});

// =====================================================
// WEBHOOK RECEIVE
// =====================================================

app.post(
  "/webhook",
  async (req, res) => {
    try {
      res.sendStatus(
        200
      );

      const value =
        req.body?.entry?.[0]
          ?.changes?.[0]
          ?.value;

      const msg =
        value?.messages?.[0];

      if (!msg) return;

      if (
        msg.type !==
        "text"
      ) {
        return;
      }

      const from =
        msg.from;

      const text =
        msg.text?.body ||
        "";

      if (
        !from ||
        !text
      ) {
        return;
      }

      log(
        "TEXT IN:",
        from,
        text
      );

      // ---------------------------------------------
      // ADMIN COMMAND
      // ---------------------------------------------
      if (
        isAdmin(from)
      ) {
        const cmd =
          parseAdminCommand(
            text
          );

        if (cmd) {
          await runAdminCommand(
            from,
            cmd
          );

          return;
        }
      }

      // ---------------------------------------------
      // USER FLOW
      // ---------------------------------------------
      const session =
        getSession(
          from
        );

      const reply =
        await buildReply(
          session,
          text
        );

      if (!reply) {
        return;
      }

      const finalMsg =
        finalizeReply(
          session,
          reply
        );

      await sendWhatsAppMessage(
        from,
        finalMsg
      );

    } catch (error) {
      log(
        "WEBHOOK ERROR:",
        error.message
      );
    }
  }
);

// =====================================================
// SMART FOLLOW-UP CRON
// 10 min / 3h / 24h
// =====================================================

cron.schedule(
  "* * * * *",
  async () => {
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

        let msg =
          null;

        // 10 min
        if (
          mins >= 10 &&
          !s.ping10Sent
        ) {
          s.ping10Sent =
            true;

          if (
            s.lastTopic ===
            "company"
          ) {
            msg =
              s.language ===
              "en"
                ? "If you share your sector and visa needs, I can guide you toward the most suitable Dubai company structure."
                : "Sektörünüzü ve vize ihtiyacınızı paylaşırsanız size en uygun Dubai şirket yapısı konusunda yönlendirme sunabilirim.";
          }

          else if (
            s.lastTopic ===
            "residency"
          ) {
            msg =
              s.language ===
              "en"
                ? "If your Dubai residency plan is still active, I can clarify the most suitable route for you."
                : "Dubai oturum planınız devam ediyorsa size en uygun seçeneği netleştirebilirim.";
          }

          else {
            msg =
              s.language ===
              "en"
                ? "If your plans are still active, feel free to continue anytime."
                : "Planınız devam ediyorsa dilediğiniz zaman devam edebiliriz.";
          }
        }

        // 3h
        else if (
          hrs >= 3 &&
          !s.ping3hSent
        ) {
          s.ping3hSent =
            true;

          msg =
            s.language ===
            "en"
              ? "Choosing the right structure early can save time and cost later. We can continue whenever you'd like."
              : "Başlangıçta doğru yapı seçimi ileride zaman ve maliyet avantajı sağlayabilir. Dilerseniz devam edebiliriz.";
        }

        // 24h
        else if (
          hrs >= 24 &&
          !s.ping24hSent
        ) {
          s.ping24hSent =
            true;

          msg =
            s.language ===
            "en"
              ? "Whenever you're ready regarding your Dubai plans, I’ll be happy to assist."
              : "Dubai planınızla ilgili hazır olduğunuzda memnuniyetle yardımcı olabilirim.";
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
  }
);

// =====================================================
// SESSION CLEANUP
// Daily 03:00
// =====================================================

cron.schedule(
  "0 3 * * *",
  () => {
    try {
      const limit =
        now() -
        30 *
          24 *
          60 *
          60 *
          1000;

      for (const [
        id,
        s
      ] of sessions) {
        if (
          s.updatedAt <
          limit
        ) {
          sessions.delete(
            id
          );
        }
      }

      log(
        "SESSION CLEANUP DONE"
      );

    } catch (error) {
      log(
        "CLEANUP ERROR:",
        error.message
      );
    }
  }
);

// =====================================================
// ROOT STATUS
// =====================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    bot: "SAMCHE FULL CLEAN PRO",
    status: "online",
    sessions:
      sessions.size,
    alerts:
      ADMIN_NUMBER
        ? "active"
        : "off"
  });
});

// =====================================================
// START SERVER
// =====================================================

server.listen(
  PORT,
  () => {
    log(
      `SAMCHE BOT STARTED ON PORT ${PORT}`
    );
  }
);

// =====================================================
// SAMCHE COMPANY LLC
// FULL CLEAN REBUILD - PART 6
// FINAL QA PATCHES + OPTIONAL IMPROVEMENTS
// APPEND UNDER PART 5
// =====================================================

// =====================================================
// IMPORTANT NOTE
// PART 5 already starts the server.
// This PART 6 adds optional production helpers only.
// No second server.listen used.
// =====================================================

// =====================================================
// UNHANDLED ERROR SAFETY
// Prevent silent crashes
// =====================================================

process.on(
  "unhandledRejection",
  (reason) => {
    log(
      "UNHANDLED REJECTION:",
      reason
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    log(
      "UNCAUGHT EXCEPTION:",
      error.message
    );
  }
);

// =====================================================
// KEEP ALIVE LOG
// Helpful for Render monitoring
// =====================================================

cron.schedule(
  "*/15 * * * *",
  () => {
    log(
      "HEARTBEAT:",
      `sessions=${sessions.size}`
    );
  }
);

// =====================================================
// LEAD REPORT TO ADMIN (Daily)
// 09:00 server time
// =====================================================

cron.schedule(
  "0 9 * * *",
  async () => {
    try {
      if (
        !ADMIN_NUMBER
      ) return;

      let hot = 0;
      let warm = 0;
      let cold = 0;

      for (const [
        _id,
        s
      ] of sessions) {
        if (
          s.leadScore >= 8
        ) hot++;
        else if (
          s.leadScore >= 4
        ) warm++;
        else cold++;
      }

      const msg =
`📊 Daily Lead Summary

Hot Leads: ${hot}
Warm Leads: ${warm}
Cold Leads: ${cold}
Total Sessions: ${sessions.size}`;

      await sendAdminAlert(
        msg
      );

    } catch (error) {
      log(
        "REPORT ERROR:",
        error.message
      );
    }
  }
);

// =====================================================
// OPTIONAL SMART RESET OF PINGS
// If user writes again later, follow-ups can restart
// Add this helper if needed in buildReply()
// =====================================================

function resetPingFlags(
  session
) {
  session.ping10Sent =
    false;
  session.ping3hSent =
    false;
  session.ping24hSent =
    false;
}

// =====================================================
// OPTIONAL NOTE:
// In buildReply(), after user message received,
// call:
//
// resetPingFlags(session);
//
// so every new conversation cycle gets new follow-ups.
// =====================================================

// =====================================================
// FINAL DEPLOY CHECKLIST
// =====================================================

// Required ENV:
//
// OPENAI_API_KEY
// WHATSAPP_TOKEN
// WHATSAPP_PHONE_ID
// VERIFY_TOKEN
//
// Optional ENV:
//
// ADMIN_NUMBER
// OPENAI_MODEL

// package.json deps:
//
// express
// axios
// node-cron
// dotenv

// =====================================================
// FINAL RESULT
// =====================================================
//
// ✅ Professional consultant bot
// ✅ WhatsApp live ready
// ✅ Multi-language
// ✅ Company / Residency / AI expertise
// ✅ Admin alerts
// ✅ Follow-up system
// ✅ Lead scoring
// ✅ Memory
// ✅ Error protection
// =====================================================
