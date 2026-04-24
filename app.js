// =====================================================
// SAMCHE PRO CONSULTANT ENGINE
// FINAL CLEAN APP.JS
// PART 1 / 3
// FOUNDATION + ENV + SERVER + MEMORY + LANGUAGE
// COPY FIRST
// =====================================================

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const http = require("http");
const cron = require("node-cron");

// =====================================================
// CONFIG
// =====================================================

const PORT =
  Number(
    process.env.PORT || 10000
  );

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || "";

const WHATSAPP_TOKEN =
  process.env.WHATSAPP_TOKEN || "";

const WHATSAPP_PHONE_ID =
  process.env.WHATSAPP_PHONE_ID || "";

const VERIFY_TOKEN =
  process.env.VERIFY_TOKEN || "";

const MODEL =
  process.env.OPENAI_MODEL ||
  "gpt-5-mini";

// =====================================================
// APP
// =====================================================

const app =
  express();

app.use(
  express.json({
    limit: "10mb"
  })
);

const server =
  http.createServer(
    app
  );

// =====================================================
// HELPERS
// =====================================================

function now() {
  return Date.now();
}

function log(...args) {
  console.log(
    new Date()
      .toISOString(),
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

function safeText(
  text = ""
) {
  return String(text)
    .trim()
    .slice(0, 3000);
}

// =====================================================
// MEMORY
// =====================================================

const sessions =
  new Map();

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
      {
        userId,

        greeted:
          false,

        lang:
          "tr",

        topic:
          "general",

        lastMessageAt:
          now(),

        ping10:
          false,
        ping3h:
          false,
        ping24h:
          false,

        history:
          []
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

function remember(
  session,
  role,
  text
) {
  session.history.push(
    {
      role,
      text,
      at: now()
    }
  );

  if (
    session.history
      .length > 8
  ) {
    session.history.shift();
  }
}

// =====================================================
// LANGUAGE
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
    String(text)
      .toLowerCase();

  const t =
    normalizeText(
      text
    );

  if (
    /[çğıöşü]/i.test(
      text
    ) ||
    /(merhaba|oturum|sirket|maliyet|fiyat|yardim|dubai)/.test(
      t
    )
  ) {
    return "tr";
  }

  if (
    /(hello|company|visa|residency|cost|price|help|dubai)/.test(
      raw
    )
  ) {
    return "en";
  }

  return previous;
}

// =====================================================
// GREETING
// =====================================================

function greeting(
  lang
) {
  if (
    lang === "en"
  ) {
    return `Hello, I’m here to assist you on behalf of SamChe Company LLC.

I can help with Dubai company setup, residency options, visas, costs and business advisory services. How may I assist you today?`;
  }

  if (
    lang === "ar"
  ) {
    return `مرحباً، أنا هنا لمساعدتكم نيابةً عن SamChe Company LLC.

يمكنني مساعدتكم في تأسيس الشركات في دبي، الإقامة، التأشيرات والتكاليف والخدمات الاستشارية. كيف يمكنني مساعدتكم اليوم؟`;
  }

  return `Merhaba, SamChe Company LLC adına size yardımcı olmak için buradayım.

Dubai’de şirket kuruluşu, iş planları, oturum seçenekleri, vizeler, maliyetler ve danışmanlık hizmetleriyle ilgili tüm sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?`;
}

// =====================================================
// HEALTHCHECK
// =====================================================

app.get(
  "/",
  (
    req,
    res
  ) => {
    res.json({
      ok: true,
      bot: "SAMCHE PRO FINAL",
      sessions:
        sessions.size
    });
  }
);

// =====================================================
// SAMCHE PRO CONSULTANT ENGINE
// FINAL CLEAN APP.JS
// PART 2 / 3
// RULE ENGINE + GPT + MAIN BRAIN
// COPY UNDER PART 1
// =====================================================

// =====================================================
// TOPIC DETECTION
// =====================================================

function detectTopic(
  text = ""
) {
  const t =
    normalizeText(
      text
    );

  if (
    /(oturum|ikamet|visa|vize|residency|sponsor|golden visa|family visa)/.test(
      t
    )
  ) {
    return "residency";
  }

  if (
    /(sirket|company|kurulum|kurmak|mainland|freezone|free zone|license|lisans)/.test(
      t
    )
  ) {
    return "company";
  }

  if (
    /(ai|chatbot|bot|otomasyon|yapay zeka)/.test(
      t
    )
  ) {
    return "ai";
  }

  return "general";
}

// =====================================================
// STATIC REPLIES
// =====================================================

function residencyReply(
  lang
) {
  if (
    lang === "en"
  ) {
    return `Dubai has 3 common residency options:

• Sponsored residency
• Residency through real-estate investment
• Residency by opening your own company

Which option interests you most?`;
  }

  if (
    lang === "ar"
  ) {
    return `يوجد 3 خيارات شائعة للإقامة في دبي:

• إقامة برعاية
• إقامة عبر الاستثمار العقاري
• إقامة عبر تأسيس شركة

أي خيار يهمكم أكثر؟`;
  }

  return `Dubai’de 3 yaygın oturum seçeneği vardır:

• Sponsorlu oturum
• Gayrimenkul yoluyla oturum
• Şirket kurarak yatırımcı oturumu

Hangi seçenekle ilgileniyorsunuz?`;
}

function fallback(
  lang
) {
  if (
    lang === "en"
  ) {
    return `Please share a little more detail so I can guide you accurately.`;
  }

  if (
    lang === "ar"
  ) {
    return `يرجى مشاركة تفاصيل أكثر حتى أتمكن من مساعدتكم بدقة.`;
  }

  return `Size en doğru yönlendirmeyi yapabilmem için talebinizi biraz daha detaylandırabilir misiniz?`;
}

// =====================================================
// SYSTEM PROMPT
// =====================================================

function buildSystemPrompt(
  session
) {
  if (
    session.lang ===
    "en"
  ) {
    return `
You are SamChe Company LLC Senior Dubai Consultant.

Reply only in English.

Rules:
- Give detailed, practical answers.
- Behave like premium consultant.
- Never give empty reply.
- If company setup asked, explain Mainland / Free Zone when relevant.
- Give price ranges when possible.
- Ask smart follow-up questions.
- Be helpful and sales oriented.
`;
  }

  if (
    session.lang ===
    "ar"
  ) {
    return `
أنت مستشار أول لدى SamChe Company LLC.

أجب بالعربية فقط.

القواعد:
- قدم إجابات احترافية ومفصلة.
- لا تقدم ردود فارغة.
- اشرح تأسيس الشركات والإقامة بشكل عملي.
- اطرح أسئلة ذكية.
`;
  }

  return `
Sen SamChe Company LLC kıdemli Dubai danışmanısın.

Sadece Türkçe cevap ver.

Kurallar:
- Ayrıntılı ve profesyonel cevap ver.
- Asla boş cevap verme.
- Şirket kuruluşu sorulursa Mainland / Free Zone farkını uygun yerde açıkla.
- Uygunsa maliyet aralığı ver.
- Akıllı takip soruları sor.
- Premium danışman gibi davran.
- Aynı cümleyi tekrar etme.
`;
}

// =====================================================
// GPT ENGINE
// =====================================================

async function askGPT(
  session,
  userText
) {
  try {
    const messages = [
      {
        role: "system",
        content:
          buildSystemPrompt(
            session
          )
      }
    ];

    for (const h of session.history) {
      messages.push({
        role:
          h.role,
        content:
          h.text
      });
    }

    messages.push({
      role: "user",
      content:
        userText
    });

    const response =
      await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model:
            MODEL,
          messages,
          temperature: 0.4,
          max_tokens: 550
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
        ?.choices?.[0]
        ?.message
        ?.content
        ?.trim();

    if (!text) {
      return fallback(
        session.lang
      );
    }

    return text;

  } catch (error) {
    log(
      "GPT ERROR:",
      error.response
        ?.data ||
        error.message
    );

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

  remember(
    session,
    "user",
    userText
  );

  // FIRST MESSAGE = GREETING ONLY
  if (
    !session.greeted
  ) {
    session.greeted =
      true;

    const msg =
      greeting(
        session.lang
      );

    remember(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // HARD RULE: RESIDENCY
  if (
    session.topic ===
    "residency"
  ) {
    const msg =
      residencyReply(
        session.lang
      );

    remember(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // GPT FOR EVERYTHING ELSE
  let reply =
    await askGPT(
      session,
      userText
    );

  if (!reply) {
    reply =
      fallback(
        session.lang
      );
  }

  remember(
    session,
    "assistant",
    reply
  );

  return reply;
}

// =====================================================
// SAMCHE PRO CONSULTANT ENGINE
// FINAL CLEAN APP.JS
// PART 3 / 3
// WEBHOOK + CRON + STARTUP
// COPY UNDER PART 2
// =====================================================

// =====================================================
// SEND WHATSAPP MESSAGE
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
          preview_url:
            false,

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
        },

        timeout:
          30000
      }
    );
  } catch (error) {
    log(
      "SEND ERROR:",
      error.response
        ?.data ||
        error.message
    );
  }
}

// =====================================================
// VERIFY WEBHOOK
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
// RECEIVE WEBHOOK
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
        !msg
      ) {
        return;
      }

      if (
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

      // reset cron flags
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
        error.response
          ?.data ||
          error.message
      );
    }
  }
);

// =====================================================
// CRON FOLLOW UPS
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

        // 10 MIN
        if (
          mins >=
            10 &&
          !s.ping10
        ) {
          s.ping10 =
            true;

          if (
            s.lang ===
            "en"
          ) {
            msg =
              "If your Dubai plan is still active, I’d be happy to assist further.";
          }

          else if (
            s.lang ===
            "ar"
          ) {
            msg =
              "إذا كانت خطتكم في دبي ما زالت قائمة فسأكون سعيداً بمساعدتكم.";
          }

          else {
            msg =
              "Dubai planınız devam ediyorsa memnuniyetle yardımcı olabilirim.";
          }
        }

        // 3 HOUR
        else if (
          mins >=
            180 &&
          !s.ping3h
        ) {
          s.ping3h =
            true;

          if (
            s.lang ===
            "en"
          ) {
            msg =
              "We can continue whenever you'd like.";
          }

          else if (
            s.lang ===
            "ar"
          ) {
            msg =
              "يمكننا المتابعة في أي وقت يناسبكم.";
          }

          else {
            msg =
              "Dilediğiniz zaman devam edebiliriz.";
          }
        }

        // 24 HOUR
        else if (
          mins >=
            1440 &&
          !s.ping24h
        ) {
          s.ping24h =
            true;

          if (
            s.lang ===
            "en"
          ) {
            msg =
              "Whenever you're ready, I’ll be happy to assist.";
          }

          else if (
            s.lang ===
            "ar"
          ) {
            msg =
              "متى كنتم جاهزين سأكون سعيداً بمساعدتكم.";
          }

          else {
            msg =
              "Hazır olduğunuzda memnuniyetle yardımcı olabilirim.";
          }
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
// START SERVER
// =====================================================

server.listen(
  PORT,
  () => {
    log(
      `SAMCHE PRO FINAL STARTED ON ${PORT}`
    );
  }
);
