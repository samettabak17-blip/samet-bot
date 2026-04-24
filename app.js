// =====================================================
// SAMCHE BOT - FIXED STARTUP BLOCK
// REPLACE ONLY TOP OF APP.JS
// NO DOTENV / RENDER SAFE
// =====================================================

// REMOVE THIS LINE IF EXISTS:
// require("dotenv").config();

const express = require("express");
const axios = require("axios");
const http = require("http");
const cron = require("node-cron");

// =====================================================
// SAFE ENV
// =====================================================

function env(
  name,
  fallback = ""
) {
  return String(
    process.env[name] ??
      fallback
  ).trim();
}

// IMPORTANT:
// read live env every time

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

const PORT = Number(
  env("PORT", "10000")
);

const MODEL =
  env(
    "OPENAI_MODEL",
    "gpt-4o-mini"
  );

// =====================================================
// STARTUP LOG
// =====================================================

console.log(
  "=== SAMCHE START ==="
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
  "WA TOKEN:",
  !!getWAToken()
);

console.log(
  "PHONE ID:",
  !!getPhoneId()
);

console.log(
  "===================="
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
// HEALTH ROUTES
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
        MODEL
    });
  }
);

app.get(
  "/show-key",
  (
    req,
    res
  ) => {
    const key =
      getOpenAIKey();

    res.json({
      exists:
        !!key,
      len:
        key.length,
      first10:
        key
          ? key.slice(
              0,
              10
            )
          : null,
      last6:
        key
          ? key.slice(
              -6
            )
          : null
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
              Authorization:
                "Bearer " +
                key,
              "Content-Type":
                "application/json"
            },
            timeout:
              30000
          }
        );

      res.json({
        ok: true,
        data:
          response.data
      });

    } catch (
      error
    ) {
      res
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
// SAMCHE BOT - FINAL FIX
// PART 2
// GPT + WHATSAPP + WEBHOOK + START
// =====================================================

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
        greeted:
          false
      }
    );
  }

  return sessions.get(
    userId
  );
}

// =====================================================
// OPENAI ASK
// =====================================================

async function askGPT(
  message
) {
  try {
    const key =
      getOpenAIKey();

    const response =
      await axios.post(
        "https://api.openai.com/v1/responses",
        {
          model:
            MODEL,

          input: `
You are SamChe Company LLC professional Dubai consultant.

Reply professionally in user's language.

User:
${message}
`
        },
        {
          headers: {
            Authorization:
              "Bearer " +
              key,
            "Content-Type":
              "application/json"
          },
          timeout:
            45000
        }
      );

    return (
      response.data
        ?.output?.[0]
        ?.content?.[0]
        ?.text ||
      ""
    ).trim();

  } catch (
    error
  ) {
    console.log(
      "GPT ERROR:",
      error.response
        ?.data ||
        error.message
    );

    return "";
  }
}

// =====================================================
// WHATSAPP SEND
// =====================================================

async function sendWhatsApp(
  to,
  body
) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${getPhoneId()}/messages`,
      {
        messaging_product:
          "whatsapp",

        to,

        type:
          "text",

        text: {
          body
        }
      },
      {
        headers: {
          Authorization:
            "Bearer " +
            getWAToken(),
          "Content-Type":
            "application/json"
        }
      }
    );

  } catch (
    error
  ) {
    console.log(
      "WA ERROR:",
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
        !msg ||
        msg.type !==
          "text"
      ) {
        return;
      }

      const from =
        msg.from;

      const text =
        String(
          msg.text
            ?.body ||
            ""
        ).trim();

      if (!text) {
        return;
      }

      const session =
        getSession(
          from
        );

      let reply =
        "";

      if (
        !session.greeted
      ) {
        session.greeted =
          true;

        reply =
          "Merhaba, SamChe Company LLC’ye hoş geldiniz. Dubai şirket kurulumu, oturum ve vizeler konusunda size nasıl yardımcı olabilirim?";
      } else {
        reply =
          await askGPT(
            text
          );
      }

      if (
        !reply
      ) {
        reply =
          "Size yardımcı olabilmem için talebinizi biraz daha detaylandırabilir misiniz?";
      }

      await sendWhatsApp(
        from,
        reply
      );

    } catch (
      error
    ) {
      console.log(
        "WEBHOOK ERROR:",
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
    console.log(
      `BOT LIVE ON ${PORT}`
    );
  }
);

