// =====================================================
// SAMCHE MASTER RULE APP.JS
// PART A
// FOUNDATION + ENV + SERVER + MEMORY + LANGUAGE ENGINE
// =====================================================

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const http = require("http");
const cron = require("node-cron");

// =====================================================
// ENV VALIDATION
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

const PORT = process.env.PORT || 10000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const GPT_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

const ADMIN_NUMBER =
  process.env.ADMIN_NUMBER || "";

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

function normalizeText(
  text = ""
) {
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

function digitsOnly(
  value = ""
) {
  return String(value)
    .replace(/\D/g, "");
}

// =====================================================
// SESSION MEMORY
// =====================================================

const sessions =
  new Map();

function createSession(
  userId
) {
  return {
    userId,

    createdAt: now(),
    updatedAt: now(),
    lastMessageAt: now(),

    greeted: false,

    language: "tr",

    topic: "general",
    subTopic: null,

    lastIntent: null,

    sector: null,
    visaNeed: null,
    budget: null,

    residencyChoice:
      null,

    history: [],

    liveRequestCount: 0,

    ping10Sent: false,
    ping3hSent: false,
    ping24hSent: false,

    duplicateText:
      null,
    duplicateAt: 0
  };
}

function getSession(
  userId
) {
  if (
    !sessions.has(
      userId
    )
  ) {
    sessions.set(
      userId,
      createSession(
        userId
      )
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
      .length > 15
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
    normalizeText(
      text
    );

  const same =
    clean ===
    session.duplicateText;

  const recent =
    now() -
      session.duplicateAt <
    5000;

  session.duplicateText =
    clean;

  session.duplicateAt =
    now();

  return same && recent;
}

// =====================================================
// LANGUAGE ENGINE
// Strong detection
// =====================================================

function detectLanguage(
  text,
  previous = "tr"
) {
  if (!text) {
    return previous;
  }

  // Arabic
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

  let tr = 0;
  let en = 0;

  const trWords = [
    "merhaba",
    "nasil",
    "sirket",
    "oturum",
    "vize",
    "ucret",
    "fiyat",
    "istiyorum",
    "dubai",
    "yardim"
  ];

  const enWords = [
    "hello",
    "hi",
    "company",
    "visa",
    "residency",
    "price",
    "cost",
    "want",
    "help",
    "dubai"
  ];

  for (const w of trWords) {
    if (t.includes(w)) tr++;
  }

  for (const w of enWords) {
    if (raw.includes(w)) en++;
  }

  if (
    /[çğıöşü]/i.test(text)
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

function greeting(
  lang = "tr"
) {
  if (lang === "en") {
    return `Hello, I’m here to assist you on behalf of SamChe Company LLC.

I can help with company formation in Dubai, business plans, residency options, visas, costs and advisory services. How may I assist you today?`;
  }

  if (lang === "ar") {
    return `مرحباً، أنا هنا لمساعدتكم نيابةً عن SamChe Company LLC.

يمكنني مساعدتكم في تأسيس الشركات في دبي، خيارات الإقامة، التأشيرات، التكاليف والخدمات الاستشارية. كيف يمكنني مساعدتكم اليوم؟`;
  }

  return `Merhaba, SamChe Company LLC adına size yardımcı olmak için buradayım.
Dubai’de şirket kuruluşu, iş planları, oturum seçenekleri, vizeler, maliyetler ve sonrasında sunduğumuz danışmanlık hizmetleriyle ilgili tüm sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?`;
}

// =====================================================
// PREMIUM FALLBACK
// =====================================================

function fallback(
  lang = "tr"
) {
  if (lang === "en") {
    return `To provide you with the most accurate guidance, could you clarify your request a little further?`;
  }

  if (lang === "ar") {
    return `لأتمكن من تقديم الإرشاد الأنسب لكم، هل يمكن توضيح طلبكم بشكل أدق؟`;
  }

  return `Size en doğru bilgiyi sunabilmem için konuyu biraz daha netleştirebilir misiniz?`;
}

// =====================================================
// HEALTHCHECK
// =====================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    bot: "SAMCHE MASTER RULE",
    sessions:
      sessions.size
  });
});

// =====================================================
// SAMCHE MASTER RULE APP.JS
// PART B
// RULE ENGINE
// RESIDENCY + COMPANY + TRUST + HUMAN + PAYMENT
// =====================================================

// =====================================================
// INTENT DETECTION
// =====================================================

function detectIntent(text) {
  const t = normalizeText(text);

  // AI priority
  if (
    t.includes("ai") ||
    t.includes("chatbot") ||
    t.includes("yapay zeka") ||
    t.includes("otomasyon")
  ) {
    return "ai";
  }

  if (
    t.includes("oturum") ||
    t.includes("residency") ||
    t.includes("visa") ||
    t.includes("vize") ||
    t.includes("sponsorlu")
  ) {
    return "residency";
  }

  if (
    t.includes("sirket") ||
    t.includes("company") ||
    t.includes("mainland") ||
    t.includes("freezone") ||
    t.includes("free zone")
  ) {
    return "company";
  }

  if (
    t.includes("guven") ||
    t.includes("güven") ||
    t.includes("real mi") ||
    t.includes("dolandir")
  ) {
    return "trust";
  }

  if (
    t.includes("odeme") ||
    t.includes("payment") ||
    t.includes("evrak")
  ) {
    return "payment";
  }

  if (
    t.includes("canli") ||
    t.includes("temsilci") ||
    t.includes("human") ||
    t.includes("yetkili")
  ) {
    return "human";
  }

  return "general";
}

// =====================================================
// RESIDENCY RULES
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

function sponsoredFlow(lang = "tr") {

  if (lang === "en") {
    return `Sponsored residency is a practical option for living in Dubai without opening your own company.

A sponsoring company supports your 2-year residency process. Approximate total package starts from 13,000 AED.

Would you like timeline or required documents?`;
  }

  if (lang === "ar") {
    return `الإقامة بالرعاية خيار عملي للعيش في دبي دون تأسيس شركة.

تقوم شركة راعية بدعم إجراءات إقامة لمدة سنتين. تبدأ التكلفة التقريبية من 13,000 درهم.

هل ترغبون بمعرفة المدة أو المستندات؟`;
  }

  return `Sponsorlu oturum, kendi şirketinizi kurmadan Dubai’de yasal şekilde yaşamak isteyenler için tercih edilen çözümlerden biridir.

Sponsor firma 2 yıllık oturum sürecini destekler. Toplam süreç maliyeti genel olarak 13.000 AED seviyesinden başlamaktadır.

İsterseniz süre veya gerekli evrak listesini de paylaşabilirim.`;
}

function familyVisa(lang = "tr") {

  if (lang === "en") {
    return `Family visa options may be added after your residency becomes active.

• Child visa: from 4,500 AED
• Spouse visa: from 6,000 AED

Would you like spouse or child details?`;
  }

  if (lang === "ar") {
    return `يمكن إضافة تأشيرات عائلية بعد تفعيل الإقامة.

• تأشيرة الطفل تبدأ من 4,500 درهم
• تأشيرة الزوج/الزوجة تبدأ من 6,000 درهم

هل ترغبون بتفاصيل أكثر؟`;
  }

  return `Aile vizesi seçenekleri oturum aktif olduktan sonra eklenebilir.

• Çocuk vizesi: 4.500 AED’den başlayan seviyeler
• Eş vizesi: 6.000 AED’den başlayan seviyeler

Eş veya çocuk için hangisiyle ilgileniyorsunuz?`;
}

// =====================================================
// COMPANY RULES
// =====================================================

function companyMain(lang = "tr") {

  if (lang === "en") {
    return `Dubai company setup is generally structured through two main models:

• Mainland Company
• Free Zone Company

The correct structure depends on your sector and visa needs. Which sector are you planning to operate in?`;
  }

  if (lang === "ar") {
    return `يتم تأسيس الشركات في دبي غالباً عبر نموذجين رئيسيين:

• شركة البر الرئيسي
• شركة المنطقة الحرة

يعتمد الخيار المناسب على القطاع وعدد التأشيرات. ما هو نشاطكم؟`;
  }

  return `Dubai’de şirket kuruluşu genel olarak iki ana model üzerinden planlanır:

• Mainland Company
• Free Zone Company

En doğru yapı sektörünüze ve vize ihtiyacınıza göre belirlenir. Hangi sektörde faaliyet göstermek istiyorsunuz?`;
}

function companyCost(lang = "tr") {
  if (lang === "en") {
    return `Company setup costs vary based on sector, number of visas, and selected jurisdiction. If you share your activity and visa need, I can explain realistic ranges.`;
  }

  if (lang === "ar") {
    return `تكلفة تأسيس الشركة تختلف حسب النشاط وعدد التأشيرات والمنطقة المختارة. إذا ذكرتم النشاط وعدد التأشيرات يمكنني توضيح النطاق التقريبي.`;
  }

  return `Şirket kurulum maliyeti; sektör, vize adedi ve seçilecek bölgeye göre değişmektedir. Faaliyet alanınızı ve kaç vize gerektiğini paylaşırsanız daha gerçekçi aralık verebilirim.`;
}

// =====================================================
// TRUST RULES
// =====================================================

function trustReply(lang = "tr") {

  if (lang === "en") {
    return `SamChe Company LLC operates with a professional and transparent service approach. Processes are handled clearly, legally, and with structured communication. Which service are you evaluating currently?`;
  }

  if (lang === "ar") {
    return `تعمل SamChe Company LLC بمنهج مهني وشفاف، مع وضوح في الإجراءات والتواصل. ما الخدمة التي تقومون بتقييمها حالياً؟`;
  }

  return `SamChe Company LLC profesyonel ve şeffaf hizmet anlayışıyla çalışmaktadır. Süreçler açık iletişim ve düzenli planlama ile yürütülür. Şu anda hangi hizmeti değerlendiriyorsunuz?`;
}

// =====================================================
// HUMAN RULES
// =====================================================

function humanReply(lang = "tr") {

  if (lang === "en") {
    return `Before directing you to a live consultant, I’d like to clarify a few important details so the process progresses correctly. Are you asking about company setup, residency, or another topic?`;
  }

  if (lang === "ar") {
    return `قبل توجيهكم إلى مستشار مباشر، أود توضيح بعض التفاصيل المهمة حتى يسير الأمر بالشكل الصحيح. هل استفساركم عن تأسيس شركة أم إقامة أم موضوع آخر؟`;
  }

  return `Canlı temsilciye yönlendirmeden önce, sürecin sizin için doğru ilerlemesi adına birkaç önemli detayı netleştirmem gerekiyor. Şirket kuruluşu, oturum veya farklı bir konu hakkında mı bilgi almak istiyorsunuz?`;
}

// =====================================================
// PAYMENT RULES
// =====================================================

function paymentReply(lang = "tr") {

  const bank = `
Account holder: SamChe Company LLC
Account Type: USD $
Account number: 9726414926
IBAN: AE210860000009726414926
BIC: WIOBAEADXXX`;

  if (lang === "en") {
    return `Thank you. Since you are ready to proceed, I’m sharing our payment details below:

${bank}`;
  }

  if (lang === "ar") {
    return `شكراً لكم. بما أنكم جاهزون للبدء، أشارك معكم بيانات الدفع أدناه:

${bank}`;
  }

  return `Teşekkür ederim. Sürece başlamaya hazır olduğunuz için ödeme bilgilerini aşağıda paylaşıyorum:

${bank}`;

  // =====================================================
// SAMCHE MASTER RULE APP.JS
// PART C
// MAIN BRAIN + GPT + WEBHOOK + FOLLOW-UP + STARTUP
// =====================================================

// =====================================================
// GPT SUPPORT LAYER
// Used only when no hard rule matches
// =====================================================

function systemPrompt(lang = "tr") {
  if (lang === "en") {
    return `
You are SamChe Company LLC's premium consultant.

Rules:
- Reply only in English.
- Professional and confident tone.
- Expert in Dubai company setup and residency.
- Never redirect users elsewhere.
- Give useful, clear answers.
- End naturally with a short question.
`;
  }

  if (lang === "ar") {
    return `
أنت المستشار الرسمي لشركة SamChe Company LLC.

القواعد:
- الرد بالعربية فقط.
- نبرة احترافية وواضحة.
- خبير في تأسيس الشركات والإقامة في دبي.
- لا تقم بتوجيه المستخدم إلى جهات أخرى.
`;
  }

  return `
Sen SamChe Company LLC'nin premium danışmanısın.

Kurallar:
- Türkçe yazana sadece Türkçe cevap ver.
- Profesyonel ve güven veren konuş.
- Dubai şirket kuruluşu ve oturum konularında uzman gibi davran.
- Kullanıcıyı başka yere yönlendirme.
- Açıklayıcı cevap ver.
- Sonunda kısa doğal soru sor.
`;
}

async function askGPT(session, userText) {
  try {
    const messages = [
      {
        role: "system",
        content: systemPrompt(session.language)
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

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: GPT_MODEL,
        messages,
        temperature: 0.45,
        max_tokens: 500
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 45000
      }
    );

    const text =
      response.data?.choices?.[0]?.message?.content?.trim();

    return text || fallback(session.language);

  } catch (error) {
    log("GPT ERROR:", error.message);
    return fallback(session.language);
  }
}

// =====================================================
// MAIN BRAIN
// =====================================================

async function buildReply(session, userText) {

  session.language = detectLanguage(
    userText,
    session.language
  );

  const clean = normalizeText(userText);

  if (isDuplicate(session, clean)) {
    return null;
  }

  // First greeting
  if (!session.greeted) {
    session.greeted = true;

    const msg = greeting(session.language);

    remember(session, "assistant", msg);

    return msg;
  }

  remember(session, "user", userText);

  const intent = detectIntent(clean);

  session.lastIntent = intent;
  session.topic = intent;

  // ---------------------------------------------
  // HARD RULES
  // ---------------------------------------------

  if (intent === "residency") {

    if (
      clean.includes("sponsorlu") ||
      clean.includes("sponsor")
    ) {
      const msg = sponsoredFlow(session.language);
      remember(session, "assistant", msg);
      return msg;
    }

    if (
      clean.includes("aile") ||
      clean.includes("family") ||
      clean.includes("es") ||
      clean.includes("cocuk")
    ) {
      const msg = familyVisa(session.language);
      remember(session, "assistant", msg);
      return msg;
    }

    const msg = residencyMain(session.language);
    remember(session, "assistant", msg);
    return msg;
  }

  if (intent === "company") {

    if (
      clean.includes("fiyat") ||
      clean.includes("maliyet") ||
      clean.includes("ucret")
    ) {
      const msg = companyCost(session.language);
      remember(session, "assistant", msg);
      return msg;
    }

    const msg = companyMain(session.language);
    remember(session, "assistant", msg);
    return msg;
  }

  if (intent === "trust") {
    const msg = trustReply(session.language);
    remember(session, "assistant", msg);
    return msg;
  }

  if (intent === "human") {
    session.liveRequestCount += 1;

    const msg = humanReply(session.language);
    remember(session, "assistant", msg);
    return msg;
  }

  if (intent === "payment") {
    const msg = paymentReply(session.language);
    remember(session, "assistant", msg);
    return msg;
  }

  // ---------------------------------------------
  // GPT SUPPORT
  // ---------------------------------------------

  const msg = await askGPT(session, userText);

  remember(session, "assistant", msg);

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
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          preview_url: false,
          body
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
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
    const text = msg.text?.body || "";

    const session = getSession(from);

    session.ping10Sent = false;
    session.ping3hSent = false;
    session.ping24hSent = false;

    const reply = await buildReply(session, text);

    if (!reply) return;

    await sendWhatsAppMessage(from, reply);

  } catch (error) {
    log("WEBHOOK ERROR:", error.message);
  }
});

// =====================================================
// FOLLOW-UP PINGS
// =====================================================

cron.schedule("* * * * *", async () => {
  try {
    const current = now();

    for (const [id, s] of sessions) {

      const diff = current - s.lastMessageAt;
      const mins = diff / 60000;
      const hrs = diff / 3600000;

      let msg = null;

      if (mins >= 10 && !s.ping10Sent) {
        s.ping10Sent = true;

        if (s.topic === "company") {
          msg = s.language === "en"
            ? "If your company plan is still active, I can help you choose the right structure."
            : "Şirket planınız devam ediyorsa size uygun yapıyı belirlemenize yardımcı olabilirim.";
        }

        else if (s.topic === "residency") {
          msg = s.language === "en"
            ? "If your residency plan is still active, I can explain the best route for you."
            : "Oturum planınız devam ediyorsa size en uygun seçeneği açıklayabilirim.";
        }

        else {
          msg = s.language === "en"
            ? "Whenever you're ready, we can continue."
            : "Hazır olduğunuzda devam edebiliriz.";
        }
      }

      else if (hrs >= 3 && !s.ping3hSent) {
        s.ping3hSent = true;

        msg = s.language === "en"
          ? "We can continue whenever you'd like."
          : "Dilediğiniz zaman devam edebiliriz.";
      }

      else if (hrs >= 24 && !s.ping24hSent) {
        s.ping24hSent = true;

        msg = s.language === "en"
          ? "I’ll be happy to assist whenever you're ready."
          : "Hazır olduğunuzda memnuniyetle yardımcı olabilirim.";
      }

      if (msg) {
        await sendWhatsAppMessage(id, msg);
      }
    }

  } catch (error) {
    log("CRON ERROR:", error.message);
  }
});

// =====================================================
// START
// =====================================================

server.listen(PORT, () => {
  log(`SAMCHE MASTER RULE STARTED ON ${PORT}`);
});

  
}

