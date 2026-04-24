// =====================================================
// SAMCHE COMPANY PRO CONSULTANT BOT
// FINAL APP.JS
// PART 1 / 3
// GPT-4.1-MINI + RESPONSES API
// FOUNDATION + ENV + SERVER + MEMORY
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
  "gpt-4.1-mini";

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
      bot: "SAMCHE GPT4.1 MINI",
      sessions:
        sessions.size
    });
  }
);

// =====================================================
// SAMCHE COMPANY PRO CONSULTANT BOT
// FINAL APP.JS
// PART 2 / 3
// LANGUAGE + RULES + GPT BRAIN
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
    /(merhaba|oturum|sirket|vize|maliyet|fiyat|yardim|dubai)/.test(
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
// TOPIC ENGINE
// =====================================================

function detectTopic(
  text = ""
) {
  const t =
    normalizeText(
      text
    );

  if (
    /(oturum|ikamet|visa|vize|residency|golden visa|family visa|sponsor)/.test(
      t
    )
  ) {
    return "residency";
  }

  if (
    /(sirket|company|kurmak|kurulum|mainland|freezone|license|lisans)/.test(
      t
    )
  ) {
    return "company";
  }

  if (
    /(ai|chatbot|bot|otomasyon|yapay zeka|whatsapp bot)/.test(
      t
    )
  ) {
    return "ai";
  }

  return "general";
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

I can help with Dubai company setup, residency options, visas, costs and advisory services. How may I assist you today?`;
  }

  if (
    lang === "ar"
  ) {
    return `مرحباً، أنا هنا لمساعدتكم نيابةً عن SamChe Company LLC.

يمكنني مساعدتكم في تأسيس الشركات في دبي، الإقامة، التأشيرات والتكاليف. كيف يمكنني مساعدتكم اليوم؟`;
  }

  return `Merhaba, SamChe Company LLC adına size yardımcı olmak için buradayım.

Dubai’de şirket kuruluşu, iş planları, oturum seçenekleri, vizeler, maliyetler ve danışmanlık hizmetleriyle ilgili tüm sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?`;
}

// =====================================================
// HARD RULE REPLIES
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

function companyReply(
  lang
) {
  if (
    lang === "en"
  ) {
    return `Dubai company setup is generally done through Mainland or Free Zone structures.

Cost depends on activity type, visa needs and office requirements.

Which sector are you planning for?`;
  }

  if (
    lang === "ar"
  ) {
    return `يتم تأسيس الشركات في دبي غالباً عبر البر الرئيسي أو المنطقة الحرة.

التكلفة تعتمد على النشاط وعدد التأشيرات ونوع المكتب.

ما النشاط المطلوب؟`;
  }

  return `Dubai’de şirket kurulumu genellikle Mainland veya Free Zone yapıları üzerinden yapılır.

Maliyet faaliyet alanı, vize ihtiyacı ve ofis gereksinimine göre değişir.

Hangi sektörde faaliyet göstermek istiyorsunuz?`;
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

Be professional, detailed and practical.
Give business-level answers.
Ask smart follow-up questions.
Never give empty replies.
`;
  }

  if (
    session.lang ===
    "ar"
  ) {
    return `
أنت مستشار أول لدى SamChe Company LLC.

أجب بالعربية فقط.

قدم إجابات احترافية وعملية ومفصلة.
لا تقدم ردود فارغة.
`;
  }

  return `
Sen SamChe Company LLC kıdemli Dubai danışmanısın.

Sadece Türkçe cevap ver.

Profesyonel, detaylı ve güven veren cevaplar ver.
Boş cevap verme.
Akıllı takip soruları sor.
Premium danışman gibi davran.
`;
}

// =====================================================
// GPT RESPONSES API
// =====================================================

// =====================================================
// DIAGNOSTIC VERSION
// askGPT FUNCTION REPLACEMENT
// PUT THIS OVER YOUR CURRENT askGPT()
// =====================================================

async function askGPT(
  session,
  userText
) {
  try {
    const systemPrompt =
      buildSystemPrompt(
        session
      );

    const messages = [
      {
        role: "system",
        content:
          systemPrompt
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

    console.log(
      "========== GPT REQUEST =========="
    );

    console.log(
      "MODEL:",
      MODEL
    );

    console.log(
      "MESSAGES:",
      JSON.stringify(
        messages,
        null,
        2
      )
    );

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

    console.log(
      "========== GPT RESPONSE =========="
    );

    console.log(
      JSON.stringify(
        response.data,
        null,
        2
      )
    );

    const text =
      response.data
        ?.choices?.[0]
        ?.message
        ?.content
        ?.trim();

    if (!text) {
      console.log(
        "GPT EMPTY TEXT"
      );
      return "";
    }

    console.log(
      "GPT FINAL TEXT:",
      text
    );

    return text;

  } catch (error) {
    console.log(
      "========== GPT ERROR =========="
    );

    console.log(
      "STATUS:",
      error.response
        ?.status
    );

    console.log(
      "DATA:",
      JSON.stringify(
        error.response
          ?.data,
        null,
        2
      )
    );

    console.log(
      "MESSAGE:",
      error.message
    );

    console.log(
      "================================"
    );

    return "";
  }
}

// =====================================================
// MAIN BRAIN
// =====================================================

// =====================================================
// GPT-FIRST FINAL CORE
// buildReply() REPLACEMENT
// CHATGPT ALWAYS PRIORITY
// USE THIS OVER CURRENT buildReply()
// =====================================================

async function buildReply(
  session,
  userText
) {
  // ---------------------------------
  // detect language / topic
  // ---------------------------------

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

  // ---------------------------------
  // first message greeting only
  // ---------------------------------

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

  // ---------------------------------
  // SPECIAL CONTEXT INJECTION
  // (rules go into GPT prompt,
  // not static replies)
  // ---------------------------------

  let enrichedText =
    userText;

  // residency generic ask
  if (
    session.topic ===
      "residency" &&
    userText.length <
      40
  ) {
    if (
      session.lang ===
      "en"
    ) {
      enrichedText =
        `User asks about Dubai residency.

Explain first these 3 common options:
1) Sponsored residency
2) Real-estate residency
3) Residency by opening a company

Then answer user request.

User message: ${userText}`;
    }

    else if (
      session.lang ===
      "ar"
    ) {
      enrichedText =
        `المستخدم يسأل عن الإقامة في دبي.

اشرح أولاً 3 خيارات شائعة:
1) إقامة برعاية
2) إقامة عبر العقار
3) إقامة عبر تأسيس شركة

ثم أجب على سؤاله.

رسالة المستخدم: ${userText}`;
    }

    else {
      enrichedText =
        `Kullanıcı Dubai oturumu hakkında soruyor.

Önce şu 3 yaygın seçeneği açıkla:
1) Sponsorlu oturum
2) Gayrimenkul ile oturum
3) Şirket kurarak yatırımcı oturumu

Ardından kullanıcının sorusunu cevapla.

Kullanıcı mesajı: ${userText}`;
    }
  }

  // company generic ask
  else if (
    session.topic ===
      "company" &&
    userText.length <
      45
  ) {
    if (
      session.lang ===
      "en"
    ) {
      enrichedText =
        `User asks about Dubai company setup.

Explain briefly Mainland vs Free Zone and ask smart follow-up question.

User message: ${userText}`;
    }

    else if (
      session.lang ===
      "ar"
    ) {
      enrichedText =
        `المستخدم يسأل عن تأسيس شركة في دبي.

اشرح باختصار الفرق بين البر الرئيسي والمنطقة الحرة ثم اطرح سؤال متابعة ذكي.

رسالة المستخدم: ${userText}`;
    }

    else {
      enrichedText =
        `Kullanıcı Dubai'de şirket kurulumu soruyor.

Kısaca Mainland ve Free Zone farkını açıkla, sonra akıllı takip sorusu sor.

Kullanıcı mesajı: ${userText}`;
    }
  }

  // ---------------------------------
  // GPT ALWAYS FIRST
  // ---------------------------------

  let reply =
    await askGPT(
      session,
      enrichedText
    );

  // ---------------------------------
  // fallback only if GPT fails
  // ---------------------------------

  if (
    !reply ||
    reply.trim()
      .length < 3
  ) {
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
// SAMCHE COMPANY PRO CONSULTANT BOT
// FINAL APP.JS
// PART 3 / 3
// WHATSAPP WEBHOOK + CRON + STARTUP
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
// RECEIVE MESSAGE
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

      // reset followups
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

        // 10 min
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

        // 3 hour
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

        // 24 hour
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
      `SAMCHE GPT-4.1 MINI STARTED ON ${PORT}`
    );
  }
);
