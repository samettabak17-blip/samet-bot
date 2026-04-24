// =====================================================
// SAMCHE BOT - CLEAN PRODUCTION APP.JS
// PART 1 / 3
// CLEAN ENV + SERVER + MEMORY
// =====================================================

require("dotenv").config({ override: false });

const express = require("express");
const axios = require("axios");
const http = require("http");
const cron = require("node-cron");

// =====================================================
// ENV
// =====================================================

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

const PORT = Number(env("PORT", "10000"));

const OPENAI_API_KEY = env("OPENAI_API_KEY");
const WHATSAPP_TOKEN = env("WHATSAPP_TOKEN");
const WHATSAPP_PHONE_ID = env("WHATSAPP_PHONE_ID");
const VERIFY_TOKEN = env("VERIFY_TOKEN");
const MODEL = env("OPENAI_MODEL", "gpt-4o-mini");

// =====================================================
// STARTUP LOG
// =====================================================

console.log("=== SAMCHE BOT STARTUP ===");
console.log("PORT:", PORT);
console.log("MODEL:", MODEL);
console.log("OPENAI KEY:", !!OPENAI_API_KEY);
console.log("OPENAI LEN:", OPENAI_API_KEY.length);
console.log("WA TOKEN:", !!WHATSAPP_TOKEN);
console.log("PHONE ID:", !!WHATSAPP_PHONE_ID);
console.log("==========================");

// =====================================================
// APP
// =====================================================

const app = express();
app.use(express.json({ limit: "10mb" }));

const server = http.createServer(app);

// =====================================================
// HELPERS
// =====================================================

function now() {
  return Date.now();
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function safeText(text = "") {
  return String(text).trim().slice(0, 3000);
}

function normalizeText(text = "") {
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

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      userId,
      greeted: false,
      lang: "tr",
      history: [],
      lastMessageAt: now(),
      ping10: false,
      ping3h: false,
      ping24h: false
    });
  }

  const s = sessions.get(userId);
  s.lastMessageAt = now();
  return s;
}

function remember(session, role, text) {
  session.history.push({
    role,
    text: String(text).slice(0, 4000)
  });

  if (session.history.length > 10) {
    session.history.shift();
  }
}

// =====================================================
// HEALTH
// =====================================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    sessions: sessions.size
  });
});

app.get("/env-check", (req, res) => {
  res.json({
    keyExists: !!OPENAI_API_KEY,
    keyLength: OPENAI_API_KEY.length,
    keyPrefix: OPENAI_API_KEY
      ? OPENAI_API_KEY.slice(0, 7)
      : null
  });
});

app.get("/test-openai", async (req, res) => {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: MODEL,
        messages: [
          { role: "user", content: "Hello" }
        ],
        temperature: 0,
        max_tokens: 30
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Bearer " + OPENAI_API_KEY
        },
        timeout: 30000
      }
    );

    return res.json({
      ok: true,
      reply:
        response.data?.choices?.[0]
          ?.message?.content || null
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error:
        error.response?.data ||
        error.message
    });
  }
});

// =====================================================
// SAMCHE BOT - CLEAN PRODUCTION APP.JS
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
// TEXTS
// =====================================================

function greeting(
  lang
) {
  if (
    lang === "en"
  ) {
    return `Hello, I’m here to assist you on behalf of SamChe Company LLC.

I can help with Dubai company setup, residency, visas, costs and advisory services. How may I assist you today?`;
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

Be professional, detailed, confident and useful.

Main expertise:
- Dubai company setup
- Mainland vs Free Zone
- Residency options
- Visa procedures
- Approximate costs
- Business growth

Never reply empty.
Ask useful follow-up questions.
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
            "Content-Type":
              "application/json",
            Authorization:
              "Bearer " +
              OPENAI_API_KEY
          },
          timeout:
            45000
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
    prompt = `
Kullanıcı Dubai oturumu hakkında bilgi istiyor.

Uygun olduğunda 3 temel yolu anlat:
1 Sponsorlu oturum
2 Gayrimenkul ile oturum
3 Şirket kurarak yatırımcı oturumu

Sonra kullanıcının sorusunu profesyonel şekilde cevapla.

Mesaj:
${userText}
`;
  }

  if (
    /(sirket|company|freezone|mainland|license|lisans)/.test(
      t
    )
  ) {
    prompt = `
Kullanıcı Dubai şirket kurulumu hakkında soruyor.

Gerekirse Mainland ve Free Zone farkını açıkla.
Maliyet sorulursa yaklaşık aralık ver.
Profesyonel danışman gibi cevapla.

Mesaj:
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
// SAMCHE BOT - CLEAN PRODUCTION APP.JS
// PART 3 / 3
// WEBHOOK + FOLLOWUP + START
// =====================================================

// =====================================================
// SEND WHATSAPP
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
          "Content-Type":
            "application/json",
          Authorization:
            "Bearer " +
            WHATSAPP_TOKEN
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
// START
// =====================================================

server.listen(
  PORT,
  () => {
    log(
      `SAMCHE BOT STARTED ON ${PORT} USING ${MODEL}`
    );
  }
);
