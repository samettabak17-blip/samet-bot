// =====================================================
// SAMCHE COMPANY LLC
// V5 ULTRA PROFESSIONAL BOT
// PART A
// CORE FOUNDATION + ENV + MEMORY + LANGUAGE + LOGIC
// =====================================================

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cron = require("node-cron");
const http = require("http");

const app = express();
app.use(express.json({ limit: "10mb" }));

const server = http.createServer(app);

// =====================================================
// REQUIRED ENV
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

const GPT_MODEL = "gpt-5-mini";

// =====================================================
// MEMORY STORE
// =====================================================

const sessions = new Map();

// =====================================================
// HELPERS
// =====================================================

function now() {
  return Date.now();
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function normalizeText(text = "") {
  return text
    .toLowerCase()
    .trim()
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u")
    .replace(/\s+/g, " ");
}

// =====================================================
// SESSION ENGINE
// =====================================================

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      userId,
      createdAt: now(),
      updatedAt: now(),

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

      lastMessageAt: now(),

      lastUserText: null
    });
  }

  const s = sessions.get(userId);
  s.updatedAt = now();

  return s;
}

// =====================================================
// MEMORY HELPERS
// =====================================================

function rememberMessage(session, role, content) {
  session.history.push({
    role,
    content,
    at: now()
  });

  if (session.history.length > 20) {
    session.history.shift();
  }
}

function setTopic(session, topic, sub = null) {
  session.lastTopic = topic;
  session.lastSubTopic = sub;
}

function bumpLead(session, score = 1) {
  session.leadScore += score;
}

// =====================================================
// LANGUAGE ENGINE V5
// =====================================================

function detectLanguage(text, previous = "tr") {
  if (!text) return previous;

  // Arabic chars
  if (/[\u0600-\u06FF]/.test(text)) {
    return "ar";
  }

  const raw = text.toLowerCase();
  const t = normalizeText(text);

  const trWords = [
    "merhaba","nasil","nasilsin","sirket","kurmak",
    "oturum","vize","ucret","fiyat","dubai",
    "calismak","istiyorum","ne kadar","yardim"
  ];

  const enWords = [
    "hello","hi","company","setup","business",
    "residency","visa","cost","price","how",
    "want","would","like","services","dubai"
  ];

  let tr = 0;
  let en = 0;

  for (const w of trWords) {
    if (t.includes(w)) tr++;
  }

  for (const w of enWords) {
    if (raw.includes(w)) en++;
  }

  // Turkish chars bonus
  if (/[çğıöşü]/i.test(text)) tr += 2;

  if (tr >= en + 1) return "tr";
  if (en >= tr + 1) return "en";

  return previous;
}

// =====================================================
// GREETING ENGINE
// =====================================================

function greetingMessage(lang = "tr") {
  if (lang === "en") {
    return `Hello, I’m here to assist you on behalf of SamChe Company LLC.

I can help answer all your questions regarding company formation in Dubai, business plans, residency options, visas, costs, and the advisory services we provide afterward. How may I assist you today?`;
  }

  if (lang === "ar") {
    return `مرحباً، أنا هنا لمساعدتكم نيابةً عن SamChe Company LLC.

يمكنني الإجابة على جميع استفساراتكم المتعلقة بتأسيس الشركات في دبي، خطط الأعمال، خيارات الإقامة، التأشيرات، التكاليف، والخدمات الاستشارية التي نقدمها بعد ذلك. كيف يمكنني مساعدتكم اليوم؟`;
  }

  return `Merhaba, SamChe Company LLC adına size yardımcı olmak için buradayım.

Dubai’de şirket kuruluşu, iş planları, oturum seçenekleri, vizeler, maliyetler ve sonrasında sunduğumuz danışmanlık hizmetleriyle ilgili tüm sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?`;
}

// =====================================================
// INTENT PREP
// =====================================================

function includesAny(text, list = []) {
  return list.some(x => text.includes(x));
}

function detectIntent(text) {
  const t = normalizeText(text);

  // company
  if (
    includesAny(t, [
      "sirket",
      "company",
      "business setup",
      "freezone",
      "mainland",
      "lisans"
    ])
  ) {
    return "company";
  }

  // residency
  if (
    includesAny(t, [
      "oturum",
      "residency",
      "visa",
      "vize",
      "calismak istiyorum",
      "dubaiye tasinmak",
      "dubaide yasamak"
    ])
  ) {
    return "residency";
  }

  // ai
  if (
    includesAny(t, [
      "chatbot",
      "ai",
      "yapay zeka",
      "otomasyon",
      "crm"
    ])
  ) {
    return "ai";
  }

  // trust
  if (
    includesAny(t, [
      "guven",
      "gercek mi",
      "dolandir",
      "real?"
    ])
  ) {
    return "trust";
  }

  return "general";
}

// =====================================================
// SAMCHE COMPANY LLC
// V5 ULTRA PROFESSIONAL BOT
// PART B
// RESPONSE ENGINES + GPT BRAIN + COMPANY + RESIDENCY
// APPEND UNDER PART A
// =====================================================

// =====================================================
// CONTACT / BANK LOCKED TEXTS
// =====================================================

function liveAgentMessage(lang = "tr") {
  if (lang === "en") {
    return "To reach our professional advisory team, you may contact us via WhatsApp at +971 52 728 8586. Our live consultants will be happy to assist you.";
  }

  if (lang === "ar") {
    return "للتواصل مع فريق الاستشارات المهنية لدينا، يمكنكم مراسلتنا عبر واتساب على ‎+971 52 728 8586. أو سيقوم مستشارونا المباشرون بمساعدتكم بكل سرور.";
  }

  return "Profesyonel danışmanlık ekibimize ulaşmak için: +971 52 728 8586 WhatsApp hattı üzerinden iletişim sağlayabilirsiniz. Canlı temsilcilerimiz size yardımcı olacaktır.";
}

function bankInfo() {
  return `Account holder: SamChe Company LLC
Account Type: USD $
Account number: 9726414926
IBAN: AE210860000009726414926
BIC: WIOBAEADXXX
Bank address:
Etihad Airways Centre 5th Floor, Abu Dhabi, UAE

mail: info@samchecompany.com
telefon: +971 50 179 38 80 - +971 52 728 8586`;
}

// =====================================================
// QUESTION ENGINE
// =====================================================

function closingQuestion(topic, lang = "tr") {
  const map = {
    company: {
      tr: "Hangi sektörde faaliyet göstermeyi planlıyorsunuz?",
      en: "Which sector are you planning to operate in?",
      ar: "ما هو القطاع الذي تخططون للعمل فيه؟"
    },
    residency: {
      tr: "Tek başınıza mı yoksa aile ile mi planlıyorsunuz?",
      en: "Are you planning alone or with family members?",
      ar: "هل تخططون بمفردكم أم مع العائلة؟"
    },
    ai: {
      tr: "Bu sistemi WhatsApp için mi yoksa web siteniz için mi düşünüyorsunuz?",
      en: "Are you considering this for WhatsApp or for your website?",
      ar: "هل تفكرون بهذا النظام لواتساب أم للموقع الإلكتروني؟"
    },
    trust: {
      tr: "Hangi hizmet için değerlendirme yaptığınızı paylaşırsanız daha net bilgi verebilirim.",
      en: "If you share which service you are evaluating, I can guide you more clearly.",
      ar: "إذا شاركتم معنا الخدمة التي تدرسونها يمكنني توضيح الصورة بشكل أدق."
    },
    general: {
      tr: "Hangi konuda bilgi almak istediğinizi paylaşırsanız yardımcı olabilirim.",
      en: "Please share which topic you need information about so I can assist you.",
      ar: "يرجى توضيح الموضوع الذي ترغبون بالاستفسار عنه حتى أتمكن من مساعدتكم."
    }
  };

  return (map[topic] && map[topic][lang]) || map.general[lang] || map.general.tr;
}

// =====================================================
// RESIDENCY DECISION ENGINE
// =====================================================

function residencyIntro(lang = "tr") {
  if (lang === "en") {
    return `There are several common ways to obtain legal residency in Dubai:

1. Residency through real estate investment
2. Sponsored residency solutions
3. Residency through establishing your own company

The most suitable route depends on your budget, timeline, and long-term plan. Which option interests you the most?`;
  }

  if (lang === "ar") {
    return `توجد عدة طرق شائعة للحصول على إقامة قانونية في دبي:

1. الإقامة عبر الاستثمار العقاري
2. حلول الإقامة عن طريق الكفالة
3. الإقامة من خلال تأسيس شركتكم الخاصة

يعتمد الخيار الأنسب على الميزانية والمدة والخطة المستقبلية. ما الخيار الأقرب لاهتمامكم؟`;
  }

  return `Dubai’de yasal oturum elde etmek için genel olarak üç ana seçenek bulunmaktadır:

1. Gayrimenkul yatırımı üzerinden oturum
2. Sponsorlu oturum çözümleri
3. Şirket kurarak yatırımcı / partner statüsünde oturum

En doğru seçenek bütçenize, zaman planınıza ve hedefinize göre değişir. Hangi seçenekle ilgilendiğinizi paylaşabilir misiniz?`;
}

// =====================================================
// COMPANY ENGINE
// =====================================================

function companyReply(session) {
  const lang = session.language;

  if (lang === "en") {
    return `Company formation in Dubai is generally structured through two main models: Mainland and Free Zone.

Mainland structures are often preferred for businesses requiring stronger onshore presence, physical operations, or certain regulated activities. Free Zone structures are commonly preferred for consultancy, digital, international trade, and flexible startup models.

The right option depends on your sector, visa needs, and operational plan. ${closingQuestion("company", lang)}`;
  }

  if (lang === "ar") {
    return `يتم تأسيس الشركات في دبي عادة عبر نموذجين رئيسيين: البر الرئيسي (Mainland) والمناطق الحرة (Free Zone).

غالباً ما يكون البر الرئيسي مناسباً للأنشطة التي تحتاج حضوراً محلياً أقوى أو عمليات تشغيلية فعلية. أما المناطق الحرة فتُفضّل عادةً للاستشارات والأعمال الرقمية والتجارة الدولية والنماذج المرنة.

يعتمد الخيار الأنسب على القطاع وعدد التأشيرات وخطة التشغيل. ${closingQuestion("company", lang)}`;
  }

  return `Dubai’de şirket kuruluşu genel olarak iki ana yapı üzerinden planlanır: Mainland ve Free Zone.

Mainland yapılar; fiziksel operasyon, yerel pazar hedefi veya belirli faaliyet türleri için daha uygun olabilir. Free Zone yapılar ise danışmanlık, dijital hizmetler, uluslararası ticaret ve esnek başlangıç modellerinde sık tercih edilir.

Doğru model; sektörünüz, vize ihtiyacınız ve operasyon planınıza göre belirlenir. ${closingQuestion("company", lang)}`;
}

// =====================================================
// TRUST ENGINE
// =====================================================

function trustReply(lang = "tr") {
  if (lang === "en") {
    return `SamChe Company LLC operates with a professional and transparent service approach. Our processes are managed within legal frameworks, with clear communication and structured planning at every stage. The right way to evaluate any provider is clarity, consistency, and professionalism. ${closingQuestion("trust", lang)}`;
  }

  if (lang === "ar") {
    return `تعمل SamChe Company LLC بمنهج مهني وشفاف. تتم إدارة الإجراءات ضمن الأطر القانونية مع وضوح في التواصل وتنظيم في كل مرحلة. أفضل طريقة لتقييم أي جهة هي الشفافية والاتساق والاحترافية. ${closingQuestion("trust", lang)}`;
  }

  return `SamChe Company LLC süreçlerini profesyonel ve şeffaf şekilde yöneten kurumsal bir yapıyla hizmet vermektedir. Her aşamada net bilgilendirme, planlama ve yasal çerçevede ilerleme esas alınır. Herhangi bir hizmet sağlayıcıyı değerlendirirken en önemli unsurlar şeffaflık, tutarlılık ve profesyonelliktir. ${closingQuestion("trust", lang)}`;
}

// =====================================================
// AI ENGINE
// =====================================================

function aiReply(lang = "tr") {
  if (lang === "en") {
    return `We provide AI-powered systems such as WhatsApp chatbots, website assistants, lead qualification automation, CRM integrations, and custom business workflows designed to improve speed and conversion. ${closingQuestion("ai", lang)}`;
  }

  if (lang === "ar") {
    return `نقدم أنظمة مدعومة بالذكاء الاصطناعي مثل روبوتات واتساب، مساعدي المواقع، أتمتة تأهيل العملاء، تكامل CRM، وحلول مخصصة لتحسين السرعة والتحويلات. ${closingQuestion("ai", lang)}`;
  }

  return `WhatsApp chatbotları, web site asistanları, lead toplama otomasyonları, CRM entegrasyonları ve işletmeye özel yapay zekâ çözümleri sunuyoruz. Amaç; hız, verimlilik ve dönüşüm oranlarını artırmaktır. ${closingQuestion("ai", lang)}`;
}

// =====================================================
// GPT CORE
// =====================================================

async function askGPT(session, userText) {
  const systemPrompt = `
You are the official premium AI consultant of SamChe Company LLC.

Rules:
- Be professional, strategic, warm and intelligent.
- Never redirect user to another company, lawyer, authority or institution.
- Give detailed and satisfying answers.
- Match user's language.
- Never be short unless user explicitly asks.
- End answers with a relevant guiding question.
- Focus on Dubai company setup, residency, business growth, AI automation.
`;

  const messages = [
    { role: "system", content: systemPrompt }
  ];

  for (const item of session.history.slice(-8)) {
    messages.push({
      role: item.role,
      content: item.content
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
      temperature: 0.55
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 45000
    }
  );

  return response.data.choices[0].message.content.trim();
}

// =====================================================
// SAMCHE COMPANY LLC
// V5 ULTRA PROFESSIONAL BOT
// PART C
// ROUTER + WHATSAPP + FOLLOWUP + START
// APPEND UNDER PART B
// =====================================================

// =====================================================
// WHATSAPP SEND ENGINE
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
        },
        timeout: 30000
      }
    );

    log("SENT:", to);

  } catch (error) {
    log(
      "SEND ERROR:",
      error?.response?.data || error.message
    );
  }
}

// =====================================================
// DUPLICATE SHIELD
// =====================================================

function isDuplicate(session, text) {
  const t = normalizeText(text);

  if (
    session.lastUserText &&
    session.lastUserText === t &&
    now() - session.lastMessageAt < 8000
  ) {
    return true;
  }

  session.lastUserText = t;
  return false;
}

// =====================================================
// MAIN RESPONSE ROUTER
// =====================================================

async function buildReply(session, userText) {
  const lang = detectLanguage(
    userText,
    session.language
  );

  session.language = lang;
  session.lastMessageAt = now();

  const clean = normalizeText(userText);

  // first greeting
  if (!session.greeted) {
    session.greeted = true;

    rememberMessage(
      session,
      "assistant",
      greetingMessage(lang)
    );

    return greetingMessage(lang);
  }

  // duplicate
  if (isDuplicate(session, clean)) {
    return null;
  }

  rememberMessage(
    session,
    "user",
    userText
  );

  // direct payment intent
  if (
    clean.includes("odeme yapacagim") ||
    clean.includes("payment now") ||
    clean.includes("evrak gonderecegim") ||
    clean.includes("baslayalim")
  ) {
    bumpLead(session, 5);

    const msg =
      lang === "en"
        ? `Thank you. Since you are ready to proceed, I’m sharing our payment details below.\n\n${bankInfo()}`
        : lang === "ar"
        ? `شكراً لكم. بما أنكم جاهزون للبدء، أشارك معكم تفاصيل الدفع أدناه.\n\n${bankInfo()}`
        : `Teşekkür ederim. Sürece başlamaya hazır olduğunuz için ödeme bilgilerini aşağıda paylaşıyorum.\n\n${bankInfo()}`;

    rememberMessage(session, "assistant", msg);
    return msg;
  }

  // live agent repeated insist
  if (
    clean.includes("canli temsilci") ||
    clean.includes("human") ||
    clean.includes("live agent") ||
    clean.includes("temsilci")
  ) {
    session.agentRequests =
      (session.agentRequests || 0) + 1;

    if (session.agentRequests >= 3) {
      const msg = liveAgentMessage(lang);
      rememberMessage(session, "assistant", msg);
      return msg;
    }
  }

  // detect intent
  const intent = detectIntent(clean);

  // -------------------------------------------------
  // COMPANY
  // -------------------------------------------------
  if (intent === "company") {
    setTopic(session, "company");
    bumpLead(session, 2);

    const msg = companyReply(session);

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // -------------------------------------------------
  // RESIDENCY
  // -------------------------------------------------
  if (intent === "residency") {
    setTopic(session, "residency");
    bumpLead(session, 2);

    const msg = residencyIntro(lang);

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // -------------------------------------------------
  // AI
  // -------------------------------------------------
  if (intent === "ai") {
    setTopic(session, "ai");
    bumpLead(session, 2);

    const msg = aiReply(lang);

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // -------------------------------------------------
  // TRUST
  // -------------------------------------------------
  if (intent === "trust") {
    setTopic(session, "trust");

    const msg = trustReply(lang);

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // -------------------------------------------------
  // GPT SMART FALLBACK
  // -------------------------------------------------
  setTopic(session, "general");

  try {
    const msg = await askGPT(
      session,
      userText
    );

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;

  } catch (error) {
    log("GPT ERROR:", error.message);

    const fallback =
      lang === "en"
        ? `I understood your message. Please share a little more detail so I can guide you accurately. ${closingQuestion("general", lang)}`
        : lang === "ar"
        ? `تم فهم رسالتكم. يرجى توضيح بعض التفاصيل الإضافية حتى أتمكن من توجيهكم بدقة. ${closingQuestion("general", lang)}`
        : `Mesajınızı anladım. Sizi en doğru şekilde yönlendirebilmem için biraz daha detay paylaşabilirsiniz. ${closingQuestion("general", lang)}`;

    rememberMessage(
      session,
      "assistant",
      fallback
    );

    return fallback;
  }
}

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

    const value =
      req.body?.entry?.[0]
        ?.changes?.[0]
        ?.value;

    const msg =
      value?.messages?.[0];

    if (!msg) return;

    if (msg.type !== "text") return;

    const from = msg.from;
    const text =
      msg.text?.body || "";

    if (!from || !text) return;

    log("TEXT IN:", from, text);

    const session =
      getSession(from);

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
// ROOT
// =====================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    bot: "SAMCHE V5 ULTRA PROFESSIONAL",
    status: "online",
    sessions: sessions.size
  });
});

// =====================================================
// SMART PING ENGINE
// 10 MIN / 3 HOUR / 24 HOUR
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
          s.lastTopic ===
          "company"
        ) {
          msg =
            s.language === "en"
              ? "If you share the sector you are considering, I can guide you more precisely regarding the most suitable company structure."
              : "Düşündüğünüz sektörü paylaşırsanız size en uygun şirket yapısı konusunda daha net yönlendirme sunabilirim.";
        }

        else if (
          s.lastTopic ===
          "residency"
        ) {
          msg =
            s.language === "en"
              ? "If your Dubai residency plan is still active, I can help clarify the most suitable route based on budget and timeline."
              : "Dubai oturum planınız devam ediyorsa bütçe ve hedefinize göre en uygun seçeneği netleştirebilirim.";
        }

        else {
          msg =
            s.language === "en"
              ? "If your plan is still active, feel free to continue whenever you are ready."
              : "Planınız devam ediyorsa dilediğiniz zaman devam edebiliriz.";
        }
      }

      // 3h
      else if (
        hrs >= 3 &&
        !s.ping3hSent
      ) {
        s.ping3hSent = true;

        msg =
          s.language === "en"
            ? "The right structure at the beginning can save both time and cost later. If you'd like, we can continue from where we left off."
            : "Başlangıçta doğru yapı seçimi ileride hem zaman hem maliyet avantajı sağlar. Dilerseniz kaldığımız yerden devam edebiliriz.";
      }

      // 24h
      else if (
        hrs >= 24 &&
        !s.ping24hSent
      ) {
        s.ping24hSent = true;

        msg =
          s.language === "en"
            ? "If your Dubai plans are still on your agenda, I’ll be happy to assist whenever you’re ready."
            : "Dubai planınız hâlâ gündeminizdeyse hazır olduğunuzda memnuniyetle yardımcı olabilirim.";
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
      "PING ERROR:",
      error.message
    );
  }
});

// =====================================================
// START
// =====================================================

server.listen(PORT, () => {
  log(
    `SAMCHE V5 ULTRA PROFESSIONAL STARTED ON PORT ${PORT}`
  );
});
