// =====================================================
// SAMCHE BOT - SINGLE CLEAN APP.JS
// FINAL PRODUCTION VERSION
// PART 1 / 3
// =====================================================

require("dotenv").config({ override: false });

const express = require("express");
const axios = require("axios");
const http = require("http");
const cron = require("node-cron");

// =====================================================
// ENV (ONLY ONCE)
// =====================================================

function env(name, fallback = "") {
  return String(
    process.env[name] || fallback
  ).trim();
}

const PORT = Number(
  env("PORT", "10000")
);

const MODEL =
  env(
    "OPENAI_MODEL",
    "gpt-4o-mini"
  );

// IMPORTANT:
// direct getter every time
function getOpenAIKey() {
  return env(
    "OPENAI_API_KEY"
  );
}

function getWAToken() {
  return env(
    "WHATSAPP_TOKEN"
  );
}

function getPhoneId() {
  return env(
    "WHATSAPP_PHONE_ID"
  );
}

function getVerifyToken() {
  return env(
    "VERIFY_TOKEN"
  );
}

// =====================================================
// STARTUP LOG
// =====================================================

console.log(
  "=== SAMCHE BOT STARTUP ==="
);

console.log(
  "PORT:",
  PORT
);

console.log(
  "MODEL:",
  MODEL
);

console.log(
  "OPENAI EXISTS:",
  !!getOpenAIKey()
);

console.log(
  "OPENAI LEN:",
  getOpenAIKey()
    .length
);

console.log(
  "=========================="
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
// SAMCHE BOT - SINGLE CLEAN APP.JS
// PART 2 / 3
// HEALTH + OPENAI + BRAIN
// =====================================================

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

app.get("/show-key", (req, res) => {
  const key = getOpenAIKey();

  res.json({
    exists: !!key,
    len: key.length,
    first10: key
      ? key.slice(0, 10)
      : null,
    last6: key
      ? key.slice(-6)
      : null
  });
});

app.get(
  "/test-openai",
  async (req, res) => {
    try {
      const key =
        getOpenAIKey();

      const response =
        await axios.post(
          "https://api.openai.com/v1/responses",
          {
            model:
              MODEL,
            input:
              "Hello"
          },
          {
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                "Bearer " +
                key
            },
            timeout:
              30000
          }
        );

      return res.json({
        ok: true,
        data:
          response.data
      });

    } catch (error) {
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

  const t =
    normalizeText(
      text
    );

  if (
    /[çğıöşü]/i.test(
      text
    ) ||
    /(merhaba|sirket|oturum|vize|maliyet)/.test(
      t
    )
  ) {
    return "tr";
  }

  if (
    /(hello|company|visa|cost|dubai)/.test(
      t
    )
  ) {
    return "en";
  }

  return previous;
}

// =====================================================
// GPT
// =====================================================

async function askGPT(
  session,
  userText
) {
  try {
    const key =
      getOpenAIKey();

    const prompt = `
You are SamChe Company LLC premium Dubai consultant.

Reply in ${
      session.lang ===
      "en"
        ? "English"
        : session.lang ===
          "ar"
        ? "Arabic"
        : "Turkish"
    }.

User message:
${userText}
`;

    const response =
      await axios.post(
        "https://api.openai.com/v1/responses",
        {
          model:
            MODEL,
          input:
            prompt
        },
        {
          headers: {
            "Content-Type":
              "application/json",
            Authorization:
              "Bearer " +
              key
          },
          timeout:
            45000
        }
      );

    const text =
      response.data
        ?.output?.[0]
        ?.content?.[0]
        ?.text
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
// MAIN REPLY
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

    const greet =
      session.lang ===
      "en"
        ? "Hello, welcome to SamChe Company LLC. How may I assist you regarding Dubai company setup, residency or visas?"
        : session.lang ===
          "ar"
        ? "مرحباً بكم في SamChe Company LLC. كيف يمكنني مساعدتكم بخصوص تأسيس شركة أو إقامة في دبي؟"
        : "Merhaba, SamChe Company LLC’ye hoş geldiniz. Dubai şirket kurulumu, oturum veya vizeler konusunda size nasıl yardımcı olabilirim?";

    remember(
      session,
      "assistant",
      greet
    );

    return greet;
  }

  let reply =
    await askGPT(
      session,
      userText
    );

  if (
    !reply ||
    reply.length <
      3
  ) {
    reply =
      session.lang ===
      "en"
        ? "Please share more detail so I can guide you accurately."
        : session.lang ===
          "ar"
        ? "يرجى مشاركة مزيد من التفاصيل حتى أتمكن من مساعدتكم بدقة."
        : "Size doğru yönlendirme yapabilmem için biraz daha detay paylaşabilir misiniz?";
  }

  remember(
    session,
    "assistant",
    reply
  );

  return reply;
}

// =====================================================
// SAMCHE BOT - SINGLE CLEAN APP.JS
// PART 3 / 3
// WHATSAPP + WEBHOOK + CRON + START
// =====================================================

// =====================================================
// SEND WHATSAPP
// =====================================================

async function sendWhatsAppMessage(
  to,
  body
) {
  try {
    const token =
      getWAToken();

    const phoneId =
      getPhoneId();

    await axios.post(
      `https://graph.facebook.com/v20.0/${phoneId}/messages`,
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
            token
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
  (req, res) => {
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
        getVerifyToken()
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
  async (req, res) => {
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

    } catch (error) {
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
            "Merhaba, yardımcı olabileceğim başka bir konu varsa memnuniyetle destek olurum.";
        }

        else if (
          mins >=
            180 &&
          !s.ping3h
        ) {
          s.ping3h =
            true;
          msg =
            "Dilerseniz işlemlerinizi birlikte planlayabiliriz.";
        }

        else if (
          mins >=
            1440 &&
          !s.ping24h
        ) {
          s.ping24h =
            true;
          msg =
            "Hazır olduğunuzda tekrar yazabilirsiniz.";
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
