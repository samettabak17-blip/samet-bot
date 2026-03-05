import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const app = express();
app.use(bodyParser.json());

// -------------------------------
//  BASIT SESSION / HAFIZA
// -------------------------------
const sessions = {};
// sessions[from] = { lang: "tr", history: [] }

// -------------------------------
//  WHATSAPP MESAJ GÖNDERME
// -------------------------------
async function sendMessage(to, body) {
  await axios.post(
    `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// -------------------------------
//  SABİT HİZMET TANIMLARI
// -------------------------------
const servicesText = {
  en:
    "SamChe Company LLC Services:\n" +
    "1. Private AI Systems & Automation\n" +
    "2. Digital Growth & Content Strategy\n" +
    "3. Branding & Social Media Development\n" +
    "4. Audience Growth & Performance Optimization\n" +
    "5. UAE Business Setup & Market Entry Guidance\n" +
    "6. Free Zone Selection & Compliance Clarity\n" +
    "7. Launch Planning & Long‑term Strategic Direction",
  tr:
    "SamChe Company LLC Hizmetleri:\n" +
    "1. Özel Yapay Zeka Sistemleri & Otomasyon\n" +
    "2. Dijital Büyüme & İçerik Stratejisi\n" +
    "3. Marka Yönetimi & Sosyal Medya Geliştirme\n" +
    "4. Kitle Büyümesi & Performans Optimizasyonu\n" +
    "5. BAE Şirket Kurulumu & Pazar Giriş Danışmanlığı\n" +
    "6. Serbest Bölge Seçimi & Uyum (Compliance) Netliği\n" +
    "7. Lansman Planlama & Uzun Vadeli Stratejik Yön",
  ar:
    "خدمات SamChe Company LLC:\n" +
    "1. أنظمة ذكاء اصطناعي خاصة وأتمتة\n" +
    "2. استراتيجية النمو الرقمي والمحتوى\n" +
    "3. بناء العلامة التجارية وتطوير وسائل التواصل الاجتماعي\n" +
    "4. نمو الجمهور وتحسين الأداء\n" +
    "5. تأسيس الأعمال في الإمارات ودخول السوق\n" +
    "6. اختيار المناطق الحرة وتوضيح المتطلبات التنظيمية\n" +
    "7. تخطيط الإطلاق والتوجيه الاستراتيجي طويل الأمد",
};

const introText = {
  en:
    "Hello, I am the official assistant of SamChe Company LLC.\n" +
    "How may I assist you today?\n\n" +
    "Here are the main areas I can help you with:\n\n" +
    servicesText.en,
  tr:
    "Merhaba, ben SamChe Company LLC'nin resmi asistanıyım.\n" +
    "Size bugün nasıl yardımcı olabilirim?\n\n" +
    "Aşağıdaki ana alanlarda size destek verebilirim:\n\n" +
    servicesText.tr,
  ar:
    "مرحبًا، أنا المساعد الرسمي لشركة SamChe Company LLC.\n" +
    "كيف يمكنني مساعدتك اليوم؟\n\n" +
    "يمكنني مساعدتك في المجالات الرئيسية التالية:\n\n" +
    servicesText.ar,
};

const contactText = {
  en:
    "SamChe Company LLC Contact Details:\n" +
    "- Phone: +971 52 728 8586\n" +
    "- Email: info@samchecompany.com",
  tr:
    "SamChe Company LLC İletişim Bilgileri:\n" +
    "- Telefon: +971 52 728 8586\n" +
    "- E‑posta: info@samchecompany.com",
  ar:
    "بيانات الاتصال بشركة SamChe Company LLC:\n" +
    "- الهاتف: ‎+971 52 728 8586\n" +
    "- البريد الإلكتروني: info@samchecompany.com",
};

// -------------------------------
//  WEBHOOK DOĞRULAMA
// -------------------------------
app.get("/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// -------------------------------
//  WEBHOOK MESAJ
// -------------------------------
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    let text = message.text?.body || "";

    // İlk kez yazan kullanıcı için session oluştur
    if (!sessions[from]) {
      sessions[from] = { lang: null, history: [] };

      await sendMessage(
        from,
        "Welcome to SamChe Company LLC.\n" +
          "SamChe Company LLC'ye hoş geldiniz.\n" +
          "مرحبًا بكم في شركة SamChe Company LLC.\n\n" +
          "Please select your preferred language:\n" +
          "Lütfen tercih ettiğiniz dili seçiniz:\n" +
          "الرجاء اختيار لغتك المفضلة:\n\n" +
          "1️⃣ English\n" +
          "2️⃣ Türkçe\n" +
          "3️⃣ العربية"
      );

      return res.sendStatus(200);
    }

    const session = sessions[from];

    // Dil henüz seçilmemişse
    if (!session.lang) {
      if (text === "1") session.lang = "en";
      else if (text === "2") session.lang = "tr";
      else if (text === "3") session.lang = "ar";
      else {
        await sendMessage(from, "Please choose 1, 2 or 3.");
        return res.sendStatus(200);
      }

      await sendMessage(from, introText[session.lang]);
      return res.sendStatus(200);
    }

    const lang = session.lang;

    // Basit iletişim / canlı görüşme isteği yakalama
    const lower = text.toLowerCase();
    if (
      lower.includes("iletişim") ||
      lower.includes("contact") ||
      lower.includes("reach") ||
      lower.includes("görüşme") ||
      lower.includes("live") ||
      lower.includes("call")
    ) {
      await sendMessage(from, contactText[lang]);
      return res.sendStatus(200);
    }

    // Hafızaya ekle
    session.history.push({ role: "user", text });

    // Hafızayı sınırlı tut (ör: son 10 mesaj)
    if (session.history.length > 10) {
      session.history = session.history.slice(-10);
    }

    // Hafızayı prompt'a gömeceğiz
    const historyText = session.history
      .map((m) => `User: ${m.text}`)
      .join("\n");

    // SamChe Company LLC açıklamasını sabit veriyoruz
    const samcheProfile = `
SamChe Company LLC is a UAE‑based consultancy focused on Private AI systems, digital growth strategy, and business setup clarity for entrepreneurs and small businesses. 
We help clients build structure, confidence, and long‑term momentum across both their online presence and their company formation journey.

Our digital advisory work includes AI‑powered content strategy, branding, social media development, audience growth, and performance optimization—ensuring every action is measurable, practical, and aligned with real‑world execution.

On the business setup side, we guide clients through UAE market entry, free zone selection, compliance clarity, and launch planning, removing uncertainty and enabling informed decision‑making.

By combining AI innovation, digital strategy, and UAE regulatory insight, SamChe empowers founders and businesses to grow with simplicity, confidence, and strategic direction.
    `;

    // Dile göre kurumsal prompt
    const prompts = {
      en: `
You are the official, private assistant of SamChe Company LLC.
You must:
- Answer ONLY based on the company profile and service scope below.
- Never invent services, locations, prices, or contact details.
- Never mention any external model, source, or provider.
- Respond in clear, formal English.
- If the user asks something outside SamChe's scope, politely say it is outside the company's services.

Company profile:
${samcheProfile}

Conversation context:
${historyText}

Latest user message:
${text}
      `,
      tr: `
Sen SamChe Company LLC'nin resmi ve özel asistanısın.
Şunlara dikkat et:
- Sadece aşağıdaki şirket profili ve hizmet kapsamına göre cevap ver.
- Yeni hizmet, lokasyon, fiyat veya iletişim bilgisi UYDURMA.
- Herhangi bir model, kaynak veya sağlayıcı ismi KESİNLİKLE anma.
- Net, resmi ve kurumsal bir Türkçe ile cevap ver.
- Kullanıcının sorusu SamChe'nin hizmet kapsamı dışındaysa, bunun şirket hizmet alanı dışında olduğunu kibarca belirt.

Şirket profili:
${samcheProfile}

Sohbet bağlamı:
${historyText}

Kullanıcının son mesajı:
${text}
      `,
      ar: `
أنت المساعد الرسمي والخاص لشركة SamChe Company LLC.
يجب عليك:
- الإجابة فقط بناءً على ملف الشركة ونطاق الخدمات أدناه.
- عدم اختراع خدمات أو مواقع أو أسعار أو بيانات اتصال جديدة.
- عدم ذكر أي نموذج أو مصدر أو مزود خارجي.
- الرد بلغة عربية رسمية وواضحة.
- إذا كان سؤال المستخدم خارج نطاق خدمات SamChe، فاذكر ذلك بلطف.

ملف الشركة:
${samcheProfile}

سياق المحادثة:
${historyText}

رسالة المستخدم الأخيرة:
${text}
      `,
    };

    const result = await model.generateContent(prompts[lang]);
    const reply = result.response.text();

    // Cevabı da hafızaya ekle (özet olarak)
    session.history.push({ role: "assistant", text: reply });

    await sendMessage(from, reply);

    res.sendStatus(200);
  } catch (err) {
    console.error("WhatsApp Error:", err);
    res.sendStatus(500);
  }
});

// -------------------------------
//  SERVER
// -------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("SamChe Bot running on port " + port);
});
