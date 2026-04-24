// =====================================================
// RENDER DIAGNOSTIC APP.JS
// MINIMAL TEST VERSION
// ONLY ENV + OPENAI
// =====================================================

const express = require("express");
const axios = require("axios");

const app = express();

const PORT =
  Number(
    process.env.PORT || 10000
  );

const MODEL =
  process.env.OPENAI_MODEL ||
  "gpt-4o-mini";

// =====================================================
// STARTUP LOG
// =====================================================

console.log(
  "=== DIAGNOSTIC START ==="
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
  !!process.env.OPENAI_API_KEY
);

console.log(
  "OPENAI LEN:",
  (
    process.env
      .OPENAI_API_KEY || ""
  ).length
);

console.log(
  "========================"
);

// =====================================================
// ROOT
// =====================================================

app.get(
  "/",
  (
    req,
    res
  ) => {
    res.json({
      ok: true,
      mode:
        "diagnostic"
    });
  }
);

// =====================================================
// SHOW KEY
// =====================================================

app.get(
  "/show-key",
  (
    req,
    res
  ) => {
    const key =
      String(
        process.env
          .OPENAI_API_KEY ||
          ""
      ).trim();

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

// =====================================================
// TEST OPENAI
// =====================================================

app.get(
  "/test-openai",
  async (
    req,
    res
  ) => {
    try {
      const key =
        String(
          process.env
            .OPENAI_API_KEY ||
            ""
        ).trim();

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
        output:
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
// START
// =====================================================

app.listen(
  PORT,
  () => {
    console.log(
      "DIAGNOSTIC LIVE ON",
      PORT
    );
  }
);
