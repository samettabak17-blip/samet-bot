// =====================================================
// SAMCHE COMPANY BOT
// FINAL WORKING APP.JS
// PART 1 / 3
// STABLE ENV + EXPRESS + MEMORY
// GPT-4O-MINI READY
// =====================================================

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const http = require("http");
const cron = require("node-cron");

// =====================================================
// ENV (FIXED)
// =====================================================

const PORT =
  Number(
    process.env.PORT || 10000
  );

const OPENAI_API_KEY =
  (
    process.env
      .OPENAI_API_KEY ||
    ""
  ).trim();

const WHATSAPP_TOKEN =
  (
    process.env
      .WHATSAPP_TOKEN ||
    ""
  ).trim();

const WHATSAPP_PHONE_ID =
  (
    process.env
      .WHATSAPP_PHONE_ID ||
    ""
  ).trim();

const VERIFY_TOKEN =
  (
    process.env
      .VERIFY_TOKEN ||
    ""
  ).trim();

const MODEL =
  (
    process.env
      .OPENAI_MODEL ||
    "gpt-4o-mini"
  ).trim();

// =====================================================
// STARTUP CHECK
// =====================================================

console.log(
  "=== ENV STATUS ==="
);

console.log(
  "OPENAI KEY:",
  !!OPENAI_API_KEY
);

console.log(
  "WA TOKEN:",
  !!WHATSAPP_TOKEN
);

console.log(
  "PHONE ID:",
  !!WHATSAPP_PHONE_ID
);

console.log(
  "VERIFY:",
  !!VERIFY_TOKEN
);

console.log(
  "MODEL:",
  MODEL
);

console.log(
  "=================="
);

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

function safeText(
  text = ""
) {
  return String(text)
    .trim()
    .slice(0, 3000);
}

function normalizeText(
  text = ""
) {
  return String(text)
    .toLowerCase()
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
        history:
          [],
        lastMessageAt:
          now(),
        ping10:
          false,
        ping3h:
          false,
        ping24h:
          false
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
      text
    }
  );

  if (
    session.history
      .length > 10
  ) {
    session.history.shift();
  }
}

// =====================================================
// HEALTH
// =====================================================

app.get(
  "/",
  (
    req,
    res
  ) => {
    res.json({
      ok: true,
      model:
        MODEL,
      sessions:
        sessions.size
    });
  }
);

app.get(
  "/test-openai",
  async (
    req,
    res
  ) => {
    try {
      const r =
        await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model:
              MODEL,
            messages: [
              {
                role: "user",
                content:
                  "Hello"
              }
            ],
            max_tokens: 30,
            temperature: 0
          },
          {
            headers: {
              Authorization:
                `Bearer ${OPENAI_API_KEY}`,
              "Content-Type":
                "application/json"
            },
            timeout:
              30000
          }
        );

      return res.json({
        ok: true,
        reply:
          r.data
            ?.choices?.[0]
            ?.message
            ?.content
      });

    } catch (
      error
    ) {
      return res
        .status(500)
        .json({
          ok: false,
          error:
            error.response
              ?.data ||
            error.message
        });
    }
  }
);

// =====================================================
// SAMCHE COMPANY BOT
// FINAL WORKING APP.JS
// PART 2 / 3
// LANGUAGE + GPT + BRAIN
// =====================================================

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
    /(merhaba|sirket|oturum|vize|maliyet|yardim|dubai)/.test(
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

I can help with Dubai company setup, residency, visas, costs and business advisory services. How may I assist you today?`;
  }

  if (
    lang === "ar"
  ) {
    return `مرحباً، أنا هنا لمساعدتكم نيابةً عن SamChe Company LLC.

يمكنني مساعدتكم في تأسيس الشركات في دبي، الإقامة، التأشيرات والتكاليف. كيف يمكنني مساعدتكم اليوم؟`;
  }

  return `Merhaba, SamChe Company LLC adına size yardımcı olmak için buradayım.

Dubai’de şirket kuruluşu, oturum seçenekleri, vizeler, maliyetler ve danışmanlık hizmetleriyle ilgili tüm sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?`;
}

// =====================================================
// FALLBACK
// =====================================================

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
  lang
) {
  if (
    lang === "en"
  ) {
    return `
You are SamChe Company LLC senior Dubai consultant.

Reply only in English.

Be premium, practical, confident and clear.

You help with:
- Dubai company setup
- Mainland vs Free Zone
- Residency options
- Visa processes
- Costs
- Business expansion

Always give useful answers.
Never reply empty.
Ask smart follow-up questions.
`;
  }

  if (
    lang === "ar"
  ) {
    return `
أنت مستشار أول لدى SamChe Company LLC.

أجب بالعربية فقط.

كن احترافياً وواضحاً ومفيداً.
لا تقدم ردود فارغة.
`;
  }

  return `
Sen SamChe Company LLC kıdemli Dubai danışmanısın.

Sadece Türkçe cevap ver.

Premium danışman gibi davran.
Net, güven veren ve detaylı cevaplar ver.

Uzmanlık alanların:
- Dubai şirket kurulumu
- Mainland ve Free Zone farkları
- Oturum seçenekleri
- Vize süreçleri
- Yaklaşık maliyetler
- İş büyütme

Her zaman faydalı cevap ver.
Boş cevap verme.
Akıllı takip soruları sor.
`;
}

// =====================================================
// GPT CALL
// =====================================================

async function askGPT(
  session,
  userText
) {
  try {
    const messages =
      [
        {
          role: "system",
          content:
            buildSystemPrompt(
              session.lang
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
        ?.choices?.[0]
        ?.message
        ?.content
        ?.trim();

    return text || "";

  } catch (error) {
    log(
      "GPT ERROR:",
      error.response
        ?.data ||
        error.message
    );

    return "";
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

  remember(
    session,
    "user",
    userText
  );

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

  let prompt =
    userText;

  const t =
    normalizeText(
      userText
    );

  if (
    /(oturum|residency|visa|vize)/.test(
      t
    )
  ) {
    prompt =
      `
Kullanıcı Dubai oturumu soruyor.

3 ana yöntemi uygun olduğunda açıkla:
1 Sponsorlu oturum
2 Gayrimenkul ile oturum
3 Şirket kurarak yatırımcı oturumu

Ardından kullanıcının sorusunu profesyonel şekilde cevapla.

Kullanıcı mesajı:
${userText}
`;
  }

  if (
    /(sirket|company|freezone|mainland|license|lisans)/.test(
      t
    )
  ) {
    prompt =
      `
Kullanıcı Dubai şirket kurulumu soruyor.

Gerekirse Mainland ve Free Zone farkını anlat.
Maliyet sorulursa yaklaşık aralık ver.
Profesyonel danışman gibi cevapla.

Kullanıcı mesajı:
${userText}
`;
  }

  let reply =
    await askGPT(
      session,
      prompt
    );

  if (
    !reply ||
    reply.length <
      3
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
// SAMCHE COMPANY BOT
// FINAL WORKING APP.JS
// PART 3 / 3
// WEBHOOK + FOLLOWUP + START
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
// WEBHOOK VERIFY
// =====================================================

app.get(
  "/webhook",
  (
    req,
    res
  ) => {
    const mode =
      req.query[
        "hub.mode"
      ];

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
// WEBHOOK RECEIVE
// =====================================================

app.post(
  "/webhook",
  async (
    req,
    res
  ) => {
    res.sendStatus(
      200
    );

    try {
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
// FOLLOW-UP CRON
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

        if (
          mins >=
            10 &&
          !s.ping10
        ) {
          s.ping10 =
            true;

          msg =
            s.lang ===
            "en"
              ? "If your Dubai plan is still active, I’d be happy to assist further."
              : s.lang ===
                "ar"
              ? "إذا كانت خطتكم في دبي ما زالت قائمة فسأكون سعيداً بمساعدتكم."
              : "Dubai planınız devam ediyorsa memnuniyetle yardımcı olabilirim.";
        }

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
              ? "يمكننا المتابعة في أي وقت يناسبكم."
              : "Dilediğiniz zaman devam edebiliriz.";
        }

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
              ? "Whenever you're ready, I’ll be happy to assist."
              : s.lang ===
                "ar"
              ? "متى كنتم جاهزين سأكون سعيداً بمساعدتكم."
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
// START SERVER
// =====================================================

server.listen(
  PORT,
  () => {
    log(
      `SAMCHE BOT STARTED ON PORT ${PORT} USING ${MODEL}`
    );
  }
);
