import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

// -------------------------------
//  GEMINI AI CLIENT
// -------------------------------
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// -------------------------------
//  WHATSAPP WEBHOOK (VERIFY)
// -------------------------------
app.get("/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    console.log("WhatsApp Webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// -------------------------------
//  WHATSAPP WEBHOOK (MESSAGE)
// -------------------------------
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body;

    // Gemini cevabı
    const result = await model.generateContent(text);
    const reply = result.response.text();

    // WhatsApp API ile cevap gönder
    await axios.post(
      `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("WhatsApp Error:", err);
    res.sendStatus(500);
  }
});

// -------------------------------
//  INSTAGRAM WEBHOOK (VERIFY)
// -------------------------------
app.get("/instagram-webhook", (req, res) => {
  const verifyToken = process.env.IG_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    console.log("Instagram Webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// -------------------------------
//  INSTAGRAM WEBHOOK (MESSAGE)
// -------------------------------
app.post("/instagram-webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging) return res.sendStatus(200);

    const senderId = messaging.sender.id;
    const text = messaging.message?.text;

    // Gemini cevabı
    const result = await model.generateContent(text);
    const reply = result.response.text();

    // Instagram DM API ile cevap gönder
    await axios.post(
      `https://graph.facebook.com/v20.0/me/messages`,
      {
        recipient: { id: senderId },
        message: { text: reply },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.IG_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("Instagram Error:", err);
    res.sendStatus(500);
  }
});

// -------------------------------
//  SERVER START (RENDER FIXED)
// -------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port " + port);
});