// app.js
// SAMCHE V3 HARD LOCK
// PART A / Core + Safety + Memory + Guard Foundation

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const http = require("http");
const cron = require("node-cron");

// =====================================================
// ENV CHECK
// =====================================================
const REQUIRED_ENV = [
  "PORT",
  "VERIFY_TOKEN",
  "META_TOKEN",
  "PHONE_NUMBER_ID",
  "OPENAI_API_KEY"
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing ENV variable: ${key}`);
    process.exit(1);
  }
}

// =====================================================
// APP
// =====================================================
const app = express();
const server = http.createServer(app);

app.set("trust proxy", true);
app.disable("x-powered-by");

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true }));

// =====================================================
// MEMORY
// =====================================================
const sessions = new Map();
const duplicateCache = new Map();

// =====================================================
// LOGGER
// =====================================================
function log(...args) {
  console.log(
    `[${new Date().toISOString()}]`,
    ...args
  );
}

// =====================================================
// HELPERS
// =====================================================
function now() {
  return Date.now();
}

function clean(text = "") {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimMessage(text = "", max = 3500) {
  const msg = clean(text);

  if (msg.length <= max) return msg;

  return msg.slice(0, max - 3).trim() + "...";
}

// =====================================================
// SESSION ENGINE
// =====================================================
function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      userId,

      lang: "tr",
      name: null,

      history: [],
      lastTopic: null,

      sector: null,
      visaNeed: null,

      leadScore: 0,
      trustScore: 0,
      humanRequestCount: 0,

      createdAt: now(),
      lastSeenAt: now(),
      lastFollowupAt: null
    });
  }

  const s = sessions.get(userId);
  s.lastSeenAt = now();

  return s;
}

function pushHistory(userId, user, bot) {
  const s = getSession(userId);

  s.history.push({
    user,
    bot,
    at: now()
  });

  if (s.history.length > 12) {
    s.history = s.history.slice(-12);
  }
}

function setTopic(userId, topic) {
  const s = getSession(userId);
  s.lastTopic = topic;
}

function addLead(userId, score = 1) {
  const s = getSession(userId);
  s.leadScore += score;
}

// =====================================================
// DUPLICATE SHIELD
// =====================================================
function isDuplicate(userId, text = "") {
  const key =
    userId + ":" + text.toLowerCase().trim();

  const current = now();

  if (duplicateCache.has(key)) {
    const old = duplicateCache.get(key);

    if (current - old < 10000) {
      return true;
    }
  }

  duplicateCache.set(key, current);

  return false;
}

cron.schedule("*/15 * * * *", () => {
  const current = now();

  for (const [key, ts] of duplicateCache) {
    if (current - ts > 900000) {
      duplicateCache.delete(key);
    }
  }
});

// =====================================================
// LANGUAGE ENGINE
// =====================================================
function detectLanguage(text = "", prev = "tr") {
  if (!text) return prev;

  if (/[\u0600-\u06FF]/.test(text)) {
    return "ar";
  }

  const t = text.toLowerCase();

  let tr = 0;
  let en = 0;

  if (/[çğıöşüı]/i.test(text)) tr += 3;

  const trWords = [
    "merhaba","şirket","oturum",
    "vize","nasıl","fiyat","ücret"
  ];

  const enWords = [
    "hello","company","visa",
    "price","cost","business"
  ];

  trWords.forEach(w => {
    if (t.includes(w)) tr++;
  });

  enWords.forEach(w => {
    if (t.includes(w)) en++;
  });

  if (tr > en) return "tr";
  if (en > tr) return "en";

  return prev;
}

// =====================================================
// HARD LOCK OUTPUT FILTER
// Never redirect elsewhere
// =====================================================
function violatesRedirectRule(text = "") {
  const t = text.toLowerCase();

  const blocked = [
    "contact authority",
    "check with authority",
    "ask lawyer",
    "consult lawyer",
    "ask your bank",
    "contact bank",
    "government office",
    "free zone authority",
    "speak with another company",
    "official website",
    "resmi kurum",
    "devlet kurumu",
    "bakanlığa sorun",
    "avukata danışın",
    "bankanızla görüşün",
    "başka firmayla görüşün"
  ];

  return blocked.some(x => t.includes(x));
}

// =====================================================
// SAFETY EVENTS
// =====================================================
process.on("unhandledRejection", err => {
  log("UNHANDLED REJECTION", err);
});

process.on("uncaughtException", err => {
  log("UNCAUGHT EXCEPTION", err);
});

// app.js
// SAMCHE V3 HARD LOCK
// PART B / Business Brain + Consultant Logic + GPT Guard

// =====================================================
// PREMIUM FALLBACKS
// =====================================================
function fallback(lang = "tr") {
  if (lang === "en") {
    return "To assist you accurately, please share a little more detail about your situation so I can guide you properly.";
  }

  if (lang === "ar") {
    return "لأتمكن من مساعدتكم بشكل دقيق، يرجى مشاركة تفاصيل أكثر قليلاً حتى أتمكن من توجيهكم بالشكل الصحيح.";
  }

  return "Size en doğru yönlendirmeyi yapabilmem için mevcut durumunuzu biraz daha detaylandırabilir misiniz?";
}

function contactMessage(lang = "tr") {
  if (lang === "en") {
    return "To proceed directly with our advisory team, please contact us via WhatsApp: +971 52 728 8586";
  }

  if (lang === "ar") {
    return "للبدء مباشرة مع فريقنا الاستشاري، يرجى التواصل عبر واتساب: ‎+971 52 728 8586";
  }

  return "Doğrudan danışmanlık ekibimizle ilerlemek için WhatsApp hattımız: +971 52 728 8586";
}

// =====================================================
// LOCKED RESIDENCY TEXTS
// =====================================================
function sponsoredResidenceText() {
  return `Bu ülkede yaşayabilmeniz ve çalışabilmeniz için size birilerinin sponsor olması gerekiyor ya da şirket açıp kendinize sponsor olmanız gerekiyor.

Şirket kurmadan da dilerseniz biz bu sponsorluk hizmetini sizin için sağlıyoruz. Yani iki yıllık oturumunuz için burada firmalar size sponsor oluyorlar; bu sponsorlukla ülkede yaşayabiliyorsunuz fakat o firmada çalışmıyorsunuz. Firma size sadece oturumunuz için sponsor oluyor.

İşlemleriniz tamamlandıktan sonra sponsor firmanızın sunduğu NOC Belgesi (No Objection Certificate) ile ülkede istediğiniz sektörde resmi olarak çalışma hakkına veya iş kurma hakkına sahip oluyorsunuz.

Dubai iki yıllık oturum ve çalışma izni işlemlerini Türkiye’den başlatıyoruz; ülkeye çalışan vizesi ile giriş yapıyorsunuz.

İki yıllık oturum ücreti toplam 13.000 AED’dir.
1. ödeme 4000 AED
2. ödeme 8000 AED
3. ödeme 1000 AED`;
}

function familyVisaText() {
  return `Aile vizeleri (Family Visa):

• Çocuk: 4.500 AED
• Eş: 6.000 AED
• Süre: 2 yıl

Family Visa çalışma izni içermez.`;
}

// =====================================================
// COMPANY KNOWLEDGE CORE
// =====================================================
function companyConsultantReply(text = "") {
  const t = text.toLowerCase();

  const restaurant = [
    "restaurant","restoran",
    "cafe","kafe"
  ].some(x => t.includes(x));

  const tech = [
    "software","app",
    "website","yazılım"
  ].some(x => t.includes(x));

  const trading = [
    "trading","import",
    "export","ticaret"
  ].some(x => t.includes(x));

  const cost = [
    "fiyat","maliyet",
    "ücret","price","cost"
  ].some(x => t.includes(x));

  if (restaurant) {
    return `Restoran, kafe ve fiziksel operasyon gerektiren faaliyetlerde çoğu durumda Mainland yapı daha avantajlı olabilir.

Sebebi:
• Operasyon esnekliği
• Fiziksel faaliyet uyumu
• Büyüme alanı

Vize sayınızı ve bütçenizi paylaşırsanız size daha net yaklaşık maliyet sunabilirim.`;
  }

  if (tech) {
    return `Yazılım, dijital hizmetler ve online faaliyetlerde çoğu durumda uygun Free Zone seçenekleri değerlendirilebilir.

Avantajlar:
• Daha esnek başlangıç
• Düşük operasyon yükü
• Dijital faaliyet uyumu

Kaç vize düşündüğünüzü paylaşırsanız daha doğru yapı önerebilirim.`;
  }

  if (trading) {
    return `Ticaret faaliyetlerinde en doğru yapı ürün tipi, hedef pazar ve operasyon planına göre değişir.

Bazı senaryolarda Mainland, bazı senaryolarda uygun Free Zone yapıları daha avantajlı olabilir.

Ne satacağınızı paylaşırsanız daha doğru yönlendirebilirim.`;
  }

  if (cost) {
    return `Dubai’de şirket kuruluş maliyetleri genel olarak şu faktörlere göre değişir:

• Faaliyet alanı
• Mainland / Free Zone tercihi
• Vize sayısı
• Ofis çözümü
• Emirlik tercihi

Sektörünüzü ve vize ihtiyacınızı paylaşırsanız size daha net yaklaşık aralık sunabilirim.`;
  }

  return `Dubai’de şirket kuruluş süreci genel olarak şu adımlardan oluşur:

• Şirket yapısı seçimi
• Faaliyet belirleme
• İsim onayı
• Lisans başvurusu
• Ofis çözümü
• Banka hesabı süreci
• Vize hakları

Faaliyet alanınızı paylaşırsanız size en doğru yapıyı önerebilirim.`;
}

// =====================================================
// AI SERVICES
// =====================================================
function aiReply(lang = "tr") {
  if (lang === "en") {
    return `We provide business growth solutions such as:

• WhatsApp AI Chatbots
• Website Chatbots
• Lead Qualification Automation
• Custom AI Applications`;
  }

  if (lang === "ar") {
    return `نقدم حلول نمو الأعمال مثل:

• شات بوت واتساب
• شات بوت للموقع
• أتمتة العملاء المحتملين
• تطبيقات ذكاء اصطناعي مخصصة`;
  }

  return `İşletme büyüme çözümlerimiz:

• WhatsApp AI Chatbot
• Web Site Chatbot
• Lead toplama otomasyonu
• Özel AI uygulamaları`;
}

// =====================================================
// GPT PROMPT HARD LOCK
// =====================================================
function buildSystemPrompt(session) {
  return `
You are the senior premium consultant of SamChe Company LLC.

You represent a UAE business consultancy.

Expertise:
- UAE company setup
- Dubai residency
- Family visa
- Banking expectations
- AI business automation

ABSOLUTE RULES:
- Never return empty output
- Never say "I don't know"
- Never redirect user to authority
- Never redirect user to another company
- Never say ask lawyer / ask bank
- Keep user inside SamChe ecosystem
- Be premium, calm, confident, human

If unsure:
Give practical guidance internally.

Reply in user's language.

Previous topic: ${session.lastTopic || "none"}
Lead score: ${session.leadScore || 0}
`;
}

// =====================================================
// OPENAI WITH OUTPUT GUARD
// =====================================================
async function askGPT(text, session) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content: buildSystemPrompt(session)
          },
          {
            role: "user",
            content: text
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 35000
      }
    );

    let out = clean(
      response.data?.output_text ||
      response.data?.output?.[0]?.content?.[0]?.text ||
      ""
    );

    if (!out) return "";

    if (violatesRedirectRule(out)) {
      return fallback(session.lang);
    }

    return out;

  } catch (error) {
    log("GPT ERROR", error.message);
    return "";
  }
}

async function askGPTSafe(text, session) {
  let reply = await askGPT(text, session);

  if (!reply) {
    reply = await askGPT(text, session);
  }

  if (!reply) {
    reply = fallback(session.lang);
  }

  return reply;
}

// =====================================================
// WHATSAPP SEND
// =====================================================
async function sendMessage(to, body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body: trimMessage(body)
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.META_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    return true;

  } catch (error) {
    log("SEND ERROR", error.message);
    return false;
  }
}

// app.js
// SAMCHE V3 HARD LOCK
// PART C / Router + Webhook + Followup + Start

// =====================================================
// INTENT HELPERS
// =====================================================
function hasIntent(t, arr) {
  return arr.some(x => t.includes(x));
}

function asksCompany(t) {
  return hasIntent(t, [
    "şirket","company","business setup",
    "license","lisans","mainland","freezone"
  ]);
}

function asksSponsored(t) {
  return hasIntent(t, [
    "sponsorlu",
    "çalışma izni",
    "oturum almak istiyorum",
    "dubaide çalışmak istiyorum",
    "dubai’de çalışmak istiyorum"
  ]);
}

function asksFamily(t) {
  return hasIntent(t, [
    "aile vizesi",
    "family visa",
    "eşim",
    "çocuğum"
  ]);
}

function asksAI(t) {
  return hasIntent(t, [
    "chatbot",
    "ai",
    "automation",
    "yapay zeka",
    "otomasyon"
  ]);
}

function asksBank(t) {
  return hasIntent(t, [
    "iban",
    "hesap bilgisi",
    "payment details",
    "bank details"
  ]);
}

function wantsHuman(t) {
  return hasIntent(t, [
    "canlı temsilci",
    "yetkili",
    "live agent",
    "human support"
  ]);
}

function readyToProceed(t) {
  return hasIntent(t, [
    "başlayalım",
    "hazırım",
    "ödeme yapacağım",
    "evrak göndereceğim",
    "ready"
  ]);
}

// =====================================================
// MAIN ROUTER
// =====================================================
async function processUserMessage(from, text) {
  const session = getSession(from);

  session.lang = detectLanguage(
    text,
    session.lang
  );

  const t = text.toLowerCase().trim();

  if (!t) {
    return fallback(session.lang);
  }

  if (isDuplicate(from, t)) {
    return null;
  }

  // Ready lead
  if (readyToProceed(t)) {
    addLead(from, 5);
    return contactMessage(session.lang);
  }

  // Human request
  if (wantsHuman(t)) {
    session.humanRequestCount++;

    if (session.humanRequestCount >= 2) {
      addLead(from, 4);
      return contactMessage(session.lang);
    }

    return fallback(session.lang);
  }

  // Bank
  if (asksBank(t)) {
    addLead(from, 5);
    return bankDetails();
  }

  // Residency
  if (asksSponsored(t)) {
    setTopic(from, "residence");
    addLead(from, 3);
    return sponsoredResidenceText();
  }

  if (asksFamily(t)) {
    setTopic(from, "residence");
    addLead(from, 2);
    return familyVisaText();
  }

  // AI
  if (asksAI(t)) {
    setTopic(from, "ai");
    addLead(from, 2);
    return aiReply(session.lang);
  }

  // Company
  if (asksCompany(t)) {
    setTopic(from, "company");
    addLead(from, 2);

    const reply =
      companyConsultantReply(text);

    pushHistory(
      from,
      text,
      reply
    );

    return reply;
  }

  // General GPT
  const reply =
    await askGPTSafe(
      text,
      session
    );

  pushHistory(
    from,
    text,
    reply
  );

  return reply;
}

// =====================================================
// VERIFY WEBHOOK
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
    token ===
      process.env.VERIFY_TOKEN
  ) {
    return res
      .status(200)
      .send(challenge);
  }

  return res.sendStatus(403);
});

// =====================================================
// RECEIVE WEBHOOK
// =====================================================
app.post("/webhook", async (req, res) => {
  try {
    res.sendStatus(200);

    const msg =
      req.body?.entry?.[0]
        ?.changes?.[0]
        ?.value?.messages?.[0];

    if (!msg) return;

    const from = msg.from;
    const type = msg.type;

    if (!from) return;

    if (type === "text") {
      const text =
        msg.text?.body || "";

      if (!text.trim()) return;

      log(
        "TEXT IN",
        from,
        text
      );

      const reply =
        await processUserMessage(
          from,
          text
        );

      if (!reply) return;

      await sendMessage(
        from,
        reply
      );

      return;
    }

    await sendMessage(
      from,
      fallback(
        getSession(from).lang
      )
    );

  } catch (error) {
    log(
      "WEBHOOK ERROR",
      error.message
    );
  }
});

// =====================================================
// ROOT
// =====================================================
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    bot: "SAMCHE V3 HARD LOCK",
    status: "online",
    model: "gpt-5-mini",
    sessions: sessions.size,
    uptime_seconds:
      Math.floor(
        process.uptime()
      )
  });
});

// =====================================================
// FOLLOWUP
// =====================================================
cron.schedule("0 * * * *", async () => {
  try {
    const current = now();

    for (const [id, s] of sessions) {
      const mins =
        (current -
          s.lastSeenAt) /
        60000;

      if (mins < 1440) continue;

      if (
        s.lastFollowupAt &&
        (current -
          s.lastFollowupAt) /
          3600000 <
          48
      ) {
        continue;
      }

      let msg =
        "Önceki görüşmemize devam etmek isterseniz yardımcı olmaya hazırım.";

      if (
        s.lastTopic ===
        "company"
      ) {
        msg =
          "Şirket planınız devam ediyorsa faaliyet alanınıza göre en doğru yapıyı paylaşabilirim.";
      }

      if (
        s.lastTopic ===
        "residence"
      ) {
        msg =
          "Oturum planınız devam ediyorsa mevcut durumunuza göre en uygun süreci açıklayabilirim.";
      }

      if (
        s.lastTopic ===
        "ai"
      ) {
        msg =
          "Yapay zekâ çözümleri hâlâ gündeminizdeyse işletmenize uygun sistemi paylaşabilirim.";
      }

      await sendMessage(
        id,
        msg
      );

      s.lastFollowupAt =
        current;
    }

  } catch (error) {
    log(
      "FOLLOWUP ERROR",
      error.message
    );
  }
});

// =====================================================
// START
// =====================================================
server.listen(
  process.env.PORT,
  () => {
    log(
      "SAMCHE V3 HARD LOCK STARTED"
    );
  }
);



