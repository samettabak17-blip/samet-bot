// =====================================================
// FINAL RENDER BUILD
// PART 1 / 3
// SETUP + ENV + SERVER + HELPERS
// COPY THIS FIRST INTO app.js
// =====================================================

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const http = require("http");
const cron = require("node-cron");

// =====================================================
// ENV
// =====================================================

const PORT = Number(process.env.PORT || 10000);

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || "";

const WHATSAPP_TOKEN =
  process.env.WHATSAPP_TOKEN || "";

const WHATSAPP_PHONE_ID =
  process.env.WHATSAPP_PHONE_ID || "";

const VERIFY_TOKEN =
  process.env.VERIFY_TOKEN || "";

const MODEL =
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

function safeText(text = "") {
  return String(text)
    .trim()
    .slice(0, 3000);
}

// =====================================================
// MEMORY
// =====================================================

const sessions =
  new Map();

function getSession(userId) {
  if (
    !sessions.has(
      userId
    )
  ) {
    sessions.set(
      userId,
      {
        userId,
        greeted: false,
        lang: "tr",
        topic: "general",
        lastMessageAt:
          now(),
        ping10: false,
        ping3h: false,
        ping24h: false
      }
    );
  }

  const s =
    sessions.get(
      userId
    );

  s.lastMessageAt =
    now();

  return s;
}

// =====================================================
// HEALTHCHECK
// =====================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    bot: "FINAL RENDER BUILD",
    sessions:
      sessions.size
  });
});

// =====================================================
// FINAL RENDER BUILD
// PART 2 / 3
// LANGUAGE + RULES + GPT + MAIN BRAIN
// COPY UNDER PART 1
// =====================================================

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

  if (
    /[çğıöşü]/i.test(text) ||
    /(merhaba|sirket|oturum|vize|fiyat|maliyet|yardim)/.test(t)
  ) {
    return "tr";
  }

  if (
    /(hello|company|visa|residency|price|cost|help|how)/.test(raw)
  ) {
    return "en";
  }

  return previous;
}

// =====================================================
// GREETING
// =====================================================

function greeting(lang) {
  if (lang === "en") {
    return `Hello, I’m here to assist you on behalf of SamChe Company LLC.

I can help with Dubai company setup, residency options, visas, costs and advisory services. How may I assist you today?`;
  }

  if (lang === "ar") {
    return `مرحباً، أنا هنا لمساعدتكم نيابةً عن SamChe Company LLC.

يمكنني مساعدتكم في تأسيس الشركات في دبي، خيارات الإقامة، التأشيرات والتكاليف. كيف يمكنني مساعدتكم اليوم؟`;
  }

  return `Merhaba, SamChe Company LLC adına size yardımcı olmak için buradayım.

Dubai’de şirket kuruluşu, iş planları, oturum seçenekleri, vizeler, maliyetler ve danışmanlık hizmetleriyle ilgili tüm sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?`;
}

// =====================================================
// TOPIC DETECTION
// =====================================================

function detectTopic(text) {
  const t =
    normalizeText(text);

  if (
    /(oturum|ikamet|visa|vize|residency|sponsor|yasamak|calismak)/.test(t)
  ) {
    return "residency";
  }

  if (
    /(sirket|company|kurmak|kurulum|mainland|freezone|license|lisans)/.test(t)
  ) {
    return "company";
  }

  if (
    /(ai|chatbot|bot|otomasyon|yapay zeka)/.test(t)
  ) {
    return "ai";
  }

  return "general";
}

// =====================================================
// RESPONSES
// =====================================================

function residencyReply(lang) {
  if (lang === "en") {
    return `Dubai has 3 common residency options:

• Sponsored residency
• Residency through real-estate investment
• Residency by opening your own company

Which option interests you most?`;
  }

  if (lang === "ar") {
    return `يوجد 3 خيارات شائعة للإقامة في دبي:

• إقامة برعاية
• إقامة عبر العقار
• إقامة عبر تأسيس شركة

أي خيار يهمكم؟`;
  }

  return `Dubai’de 3 yaygın oturum seçeneği vardır:

• Sponsorlu oturum
• Gayrimenkul yoluyla oturum
• Şirket kurarak yatırımcı oturumu

Hangi seçenekle ilgileniyorsunuz?`;
}

function companyReply(lang) {
  if (lang === "en") {
    return `Dubai company setup is generally Mainland or Free Zone.

Cost depends on activity type, visa need and office type.

Which sector are you planning for?`;
  }

  if (lang === "ar") {
    return `يكون تأسيس الشركة في دبي غالباً عبر البر الرئيسي أو المنطقة الحرة.

التكلفة تعتمد على النشاط وعدد التأشيرات ونوع المكتب.

ما النشاط المطلوب؟`;
  }

  return `Dubai’de şirket kurulumu genellikle Mainland veya Free Zone olarak planlanır.

Maliyet faaliyet alanı, vize ihtiyacı ve ofis tipine göre değişir.

Hangi sektörde faaliyet göstermek istiyorsunuz?`;
}

function aiReply(lang) {
  if (lang === "en") {
    return `We provide AI chatbots, WhatsApp automation and lead generation systems.

Is your need for WhatsApp or website?`;
  }

  if (lang === "ar") {
    return `نقدم روبوتات ذكاء اصطناعي وأتمتة واتساب وأنظمة توليد عملاء.

هل احتياجكم لواتساب أم للموقع؟`;
  }

  return `İşletmelere özel AI chatbot, WhatsApp otomasyonu ve lead generation sistemleri sunuyoruz.

İhtiyacınız WhatsApp için mi web sitesi için mi?`;
}

function fallback(lang) {
  if (lang === "en") {
    return `Please share a little more detail so I can guide you accurately.`;
  }

  if (lang === "ar") {
    return `يرجى مشاركة تفاصيل أكثر حتى أتمكن من مساعدتكم بدقة.`;
  }

  return `Size en doğru yönlendirmeyi yapabilmem için talebinizi biraz daha detaylandırabilir misiniz?`;
}

// =====================================================
// GPT SUPPORT
// =====================================================

async function askGPT(
  session,
  text
) {
  try {
    const system =
      session.lang === "en"
        ? "Reply only in English as a Dubai business consultant."
        : session.lang === "ar"
        ? "أجب بالعربية فقط كمستشار أعمال في دبي."
        : "Sadece Türkçe cevap ver. Dubai iş danışmanı gibi davran.";

    const response =
      await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                system
            },
            {
              role: "user",
              content:
                text
            }
          ],
          temperature: 0.3,
          max_tokens: 300
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
        ?.message?.content
        ?.trim() ||
      fallback(
        session.lang
      )
    );

  } catch (error) {
    return fallback(
      session.lang
    );
  }
}

// =====================================================
// MAIN BRAIN
// =====================================================

async function buildReply(
  session,
  userText
) {
  session.lang =
    detectLanguage(
      userText,
      session.lang
    );

  session.topic =
    detectTopic(
      userText
    );

  let reply = "";

  if (
    session.topic ===
    "residency"
  ) {
    reply =
      residencyReply(
        session.lang
      );
  }

  else if (
    session.topic ===
    "company"
  ) {
    reply =
      companyReply(
        session.lang
      );
  }

  else if (
    session.topic ===
    "ai"
  ) {
    reply =
      aiReply(
        session.lang
      );
  }

  else {
    reply =
      await askGPT(
        session,
        userText
      );
  }

  if (!reply) {
    reply =
      fallback(
        session.lang
      );
  }

  if (
    !session.greeted
  ) {
    session.greeted = true;

    reply =
      greeting(
        session.lang
      ) +
      "\n\n" +
      reply;
  }

  return reply;
}

// =====================================================
// FINAL RENDER BUILD
// PART 3 / 3
// WEBHOOK + CRON + STARTUP
// COPY UNDER PART 2
// =====================================================

// =====================================================
// SEND MESSAGE
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
          body: String(
            body
          ).slice(
            0,
            4096
          )
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
    log(
      "SEND ERROR:",
      error.message
    );
  }
}

// =====================================================
// VERIFY
// =====================================================

app.get(
  "/webhook",
  (
    req,
    res
  ) => {
    const token =
      req.query[
        "hub.verify_token"
      ];

    const challenge =
      req.query[
        "hub.challenge"
      ];

    if (
      token ===
      VERIFY_TOKEN
    ) {
      return res
        .status(200)
        .send(
          challenge
        );
    }

    return res.sendStatus(
      403
    );
  }
);

// =====================================================
// RECEIVE
// =====================================================

app.post(
  "/webhook",
  async (
    req,
    res
  ) => {
    try {
      res.sendStatus(
        200
      );

      const msg =
        req.body
          ?.entry?.[0]
          ?.changes?.[0]
          ?.value
          ?.messages?.[0];

      if (
        !msg ||
        msg.type !==
          "text"
      ) {
        return;
      }

      const from =
        msg.from;

      const text =
        safeText(
          msg.text
            ?.body ||
            ""
        );

      if (
        !from ||
        !text
      ) {
        return;
      }

      const session =
        getSession(
          from
        );

      session.ping10 =
        false;
      session.ping3h =
        false;
      session.ping24h =
        false;

      const reply =
        await buildReply(
          session,
          text
        );

      await sendWhatsAppMessage(
        from,
        reply
      );

    } catch (
      error
    ) {
      log(
        "WEBHOOK ERROR:",
        error.message
      );
    }
  }
);

// =====================================================
// CRON FOLLOWUP
// =====================================================

cron.schedule(
  "* * * * *",
  async () => {
    try {
      for (const [
        id,
        s
      ] of sessions) {
        const mins =
          (
            now() -
            s.lastMessageAt
          ) /
          60000;

        let msg =
          "";

        // 10 min
        if (
          mins >=
            10 &&
          !s.ping10
        ) {
          s.ping10 =
            true;

          if (
            s.topic ===
            "company"
          ) {
            msg =
              s.lang ===
              "en"
                ? "If your company plan is still active, I can help further."
                : s.lang ===
                  "ar"
                ? "إذا كانت خطة الشركة ما زالت قائمة يمكنني مساعدتكم."
                : "Şirket planınız devam ediyorsa yardımcı olabilirim.";
          }

          else if (
            s.topic ===
            "residency"
          ) {
            msg =
              s.lang ===
              "en"
                ? "If your residency plan is still active, I can help further."
                : s.lang ===
                  "ar"
                ? "إذا كانت خطة الإقامة ما زالت قائمة يمكنني مساعدتكم."
                : "Oturum planınız devam ediyorsa yardımcı olabilirim.";
          }

          else {
            msg =
              s.lang ===
              "en"
                ? "Whenever you're ready, we can continue."
                : s.lang ===
                  "ar"
                ? "يمكننا المتابعة متى شئتم."
                : "Hazır olduğunuzda devam edebiliriz.";
          }
        }

        // 3 hour
        else if (
          mins >=
            180 &&
          !s.ping3h
        ) {
          s.ping3h =
            true;

          msg =
            s.lang ===
            "en"
              ? "We can continue whenever you'd like."
              : s.lang ===
                "ar"
              ? "يمكننا المتابعة في أي وقت."
              : "Dilediğiniz zaman devam edebiliriz.";
        }

        // 24 hour
        else if (
          mins >=
            1440 &&
          !s.ping24h
        ) {
          s.ping24h =
            true;

          msg =
            s.lang ===
            "en"
              ? "I’ll be happy to assist whenever you're ready."
              : s.lang ===
                "ar"
              ? "سأكون سعيداً بمساعدتكم متى شئتم."
              : "Hazır olduğunuzda memnuniyetle yardımcı olabilirim.";
        }

        if (
          msg
        ) {
          await sendWhatsAppMessage(
            id,
            msg
          );
        }
      }

    } catch (
      error
    ) {
      log(
        "CRON ERROR:",
        error.message
      );
    }
  }
);

// =====================================================
// START
// =====================================================

server.listen(
  PORT,
  () => {
    log(
      `FINAL RENDER BUILD STARTED ON ${PORT}`
    );
  }
);
