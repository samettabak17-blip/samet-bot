// app.js – WhatsApp + Gemini 2.0 Flash (FINAL – CRON, NİYET SKORU, PROFİL, KONU TESPİTİ)

const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const dotenv = require("dotenv");
const cron = require("node-cron");

dotenv.config();

const app = express();
app.use(bodyParser.json());

// -------------------------------
//  SESSION MEMORY
// -------------------------------
const sessions = {};

// -------------------------------
//  WHATSAPP SEND (4096 LIMIT SAFE)
// -------------------------------
async function sendMessage(to, body) {
  try {
    if (!body || typeof body !== "string") return;

    const chunks = [];
    for (let i = 0; i < body.length; i += 4000) {
      chunks.push(body.substring(i, i + 4000));
    }

    for (const chunk of chunks) {
      await axios.post(
        "https://graph.facebook.com/v20.0/" +
          process.env.WHATSAPP_PHONE_ID +
          "/messages",
        {
          messaging_product: "whatsapp",
          to: to,
          text: { body: chunk },
        },
        {
          headers: {
            Authorization: "Bearer " + process.env.WHATSAPP_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch (err) {
    console.error(
      "WhatsApp send error:",
      err.response && err.response.data ? err.response.data : err.message
    );
  }
}

// -------------------------------
//  CORPORATE FALLBACK
// -------------------------------
function corporateFallback(lang) {
  if (lang === "tr") {
    return (
      "Sorunuzu tam olarak anlayamadım ancak size yardımcı olmak isterim. " +
      "Dubai’de şirket kuruluşu, serbest bölge seçimi, vizeler, maliyetler, iş modeli, pazar stratejisi veya yapay zekâ çözümleri hakkında daha net bir soru sorabilirsiniz.\n\n" +
      "Canlı temsilci: +971 52 728 8586"
    );
  }
  if (lang === "en") {
    return (
      "I couldn’t fully understand your question, but I’d be glad to assist. " +
      "You may ask more specifically about Dubai company setup, free zones, visas, costs, business models, or AI solutions.\n\n" +
      "Live consultant: +971 52 728 8586"
    );
  }
  return (
    "لم أفهم سؤالك تمامًا، لكن يسعدني مساعدتك. " +
    "يمكنك طرح سؤال أكثر تحديدًا حول تأسيس الشركات في دبي، المناطق الحرة، التأشيرات، التكاليف أو حلول الذكاء الاصطناعي.\n\n" +
    "المستشار المباشر: ‎+971 52 728 8586"
  );
}

// -------------------------------
//  GEMINI TEXT (GEMINI 2.0 FLASH)
// -------------------------------
async function callGemini(prompt) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
    process.env.GEMINI_API_KEY;

  try {
    const response = await axios.post(
      url,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const data = response.data;
    const reply =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text
        ? data.candidates[0].content.parts[0].text
        : "";
    return reply.trim() || null;
  } catch (err) {
    console.error(
      "Gemini API error:",
      err.response && err.response.data ? err.response.data : err.message
    );
    return null;
  }
}

// -------------------------------
//  STATIC TEXTS
// -------------------------------
const introAfterLang = {
  tr:
    "Merhaba, ben SamChe Company LLC'nin yapay zekâ danışmanıyım.\n" +
    "BAE şirket kuruluşu, vizeler, oturum, yaşam maliyetleri, iş planları, iş stratejileri, yapay zekâ çözümleri ve webchat AI chatbot hizmetleri hakkında sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?\n\n",
  en:
    "Hello, I am the AI consultant of SamChe Company LLC.\n" +
    "I can answer your questions about UAE company formation, residency, visas, cost of living, business plans, business strategies, AI solutions, and webchat AI chatbot services. How can I assist you?\n\n",
  ar:
    "مرحبًا، أنا المساعد الذكي لشركة SamChe Company LLC.\n" +
    "أستطيع مساعدتك في تأسيس الشركات في الإمارات، الإقامة، التأشيرات، تكاليف المعيشة، خطط الأعمال، الاستراتيجيات، حلول الذكاء الاصطناعي وخدمة روبوت الدردشة الذكي (Webchat AI Chatbot). كيف يمكنني مساعدتك؟\n\n",
};

const contactText = {
  tr: "Canlı temsilci: +971 52 728 8586",
  en: "Live consultant: +971 52 728 8586",
  ar: "مستشار مباشر: ‎+971 52 728 8586",
};

// -------------------------------
//  TOPIC DETECTION & INTENT SCORE
// -------------------------------
function detectTopic(text) {
  const t = text.toLowerCase();

  if (
    t.indexOf("şirket") !== -1 ||
    t.indexOf("company") !== -1 ||
    t.indexOf("business setup") !== -1 ||
    t.indexOf("company setup") !== -1
  )
    return "company";

  if (
    t.indexOf("oturum") !== -1 ||
    t.indexOf("residency") !== -1 ||
    t.indexOf("visa") !== -1 ||
    t.indexOf("ikamet") !== -1
  )
    return "residency";

  if (
    t.indexOf("ai") !== -1 ||
    t.indexOf("bot") !== -1 ||
    t.indexOf("chatbot") !== -1 ||
    t.indexOf("webchat") !== -1
  )
    return "ai";

  if (
    t.indexOf("maliyet") !== -1 ||
    t.indexOf("cost") !== -1 ||
    t.indexOf("price") !== -1 ||
    t.indexOf("ücret") !== -1 ||
    t.indexOf("bütçe") !== -1 ||
    t.indexOf("budget") !== -1
  )
    return "cost";

  return "other";
}

function calculateIntentScore(text, currentScore) {
  const t = text.toLowerCase();
  let score = currentScore || 0;

  if (
    t.indexOf("şirket kurmak istiyorum") !== -1 ||
    t.indexOf("company setup") !== -1 ||
    t.indexOf("i want to open a company") !== -1
  )
    score += 30;

  if (
    t.indexOf("oturum almak istiyorum") !== -1 ||
    t.indexOf("residency") !== -1 ||
    t.indexOf("visa application") !== -1
  )
    score += 25;

  if (
    t.indexOf("bütçe") !== -1 ||
    t.indexOf("budget") !== -1 ||
    t.indexOf("fiyat") !== -1 ||
    t.indexOf("price") !== -1
  )
    score += 15;

  if (
    t.indexOf("ne kadar sürer") !== -1 ||
    t.indexOf("timeline") !== -1 ||
    t.indexOf("kaç günde") !== -1
  )
    score += 10;

  if (
    t.indexOf("merak ettim") !== -1 ||
    t.indexOf("sadece soruyorum") !== -1 ||
    t.indexOf("just curious") !== -1
  )
    score -= 10;

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return score;
}

// -------------------------------
//  WEBHOOK VERIFY
// -------------------------------
app.get("/webhook", function (req, res) {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

// -------------------------------
//  WEBHOOK MESSAGE HANDLER
// -------------------------------
app.post("/webhook", async function (req, res) {
  try {
    const entry = req.body.entry && req.body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const value = change && change.value;
    const message = value && value.messages && value.messages[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;

    // FIRST MESSAGE
    if (!sessions[from]) {
      sessions[from] = {
        lang: null,
        history: [],
        lastMessageTime: Date.now(),
        followUpStage: 0,
        intentScore: 0,
        topics: [],
        profile: {
          name: null,
          country: null,
          budget: null,
          interest: null,
        },
      };

      await sendMessage(
        from,
        "Welcome to SamChe Company LLC.\n" +
          "SamChe Company LLC'ye hoş geldiniz.\n" +
          "مرحبًا بكم.\n\n" +
          "Please select your language:\n" +
          "1️⃣ English\n" +
          "2️⃣ Türkçe\n" +
          "3️⃣ العربية\n\n" +
          "Lütfen dil seçiminizi yapınız:\n" +
          "1️⃣ İngilizce\n" +
          "2️⃣ Türkçe\n" +
          "3️⃣ Arapça"
      );

      return res.sendStatus(200);
    }

    const session = sessions[from];

    // LANGUAGE SELECTION
    if (!session.lang) {
      const textRaw = message.text && message.text.body ? message.text.body : "";
      if (textRaw === "1") session.lang = "en";
      else if (textRaw === "2") session.lang = "tr";
      else if (textRaw === "3") session.lang = "ar";
      else {
        await sendMessage(from, "Please choose 1, 2 or 3.");
        return res.sendStatus(200);
      }

      await sendMessage(from, introAfterLang[session.lang]);
      return res.sendStatus(200);
    }

    const lang = session.lang;

    // ---------------------------
    //  TEXT ONLY
    // ---------------------------
    const text = message.text && message.text.body ? message.text.body : "";
    const lower = text.toLowerCase();

    // CONTACT
    if (
      lower.indexOf("contact") !== -1 ||
      lower.indexOf("iletişim") !== -1 ||
      lower.indexOf("whatsapp") !== -1 ||
      lower.indexOf("call") !== -1 ||
      lower.indexOf("telefon") !== -1
    ) {
      await sendMessage(from, contactText[lang]);
      return res.sendStatus(200);
    }

    // AI CHATBOT PRICE / PLAN REDIRECT
    if (
      lower.indexOf("ai bot") !== -1 ||
      lower.indexOf("chatbot") !== -1 ||
      lower.indexOf("bot fiyat") !== -1 ||
      lower.indexOf("ai fiyat") !== -1 ||
      lower.indexOf("chatbot fiyat") !== -1 ||
      lower.indexOf("webchat") !== -1 ||
      lower.indexOf("ai plan") !== -1 ||
      lower.indexOf("bot plan") !== -1
    ) {
      await sendMessage(
        from,
        "AI chatbot fiyat ve planları için şu sayfayı ziyaret edebilirsiniz:\nhttps://aichatbot.samchecompany.com"
      );
      return res.sendStatus(200);
    }

    // MEMORY UPDATE
    session.history.push({ role: "user", text: text });
    if (session.history.length > 10) session.history.shift();
    session.lastMessageTime = Date.now();
    session.followUpStage = 0;

    // TOPIC & INTENT
    const topic = detectTopic(text);
    if (!session.topics) session.topics = [];
    if (topic !== "other" && session.topics.indexOf(topic) === -1) {
      session.topics.push(topic);
    }
    session.intentScore = calculateIntentScore(text, session.intentScore);

    const historyText = session.history
      .map(function (m) {
        return "User: " + m.text;
      })
      .join("\n");

    // PROMPT
    let prompt;
    if (lang === "tr") {
      prompt =
        "SamChe Company LLC’nin kurumsal yapay zekâ danışmanısın. Profesyonel, stratejik, analitik ve yol gösterici cevaplar ver." +
        "Kullanıcı iletişim bilgileri istendiğinde ya da canlı bir temsilci ile doğrudan sohbet etmek istediğinde, iletişim bilgilerini doğrudan verme." +
        "Önce kullanıcının niyetini öğren. Kullanıcı bilgi aldıktan sonra ciddi niyet gösterirse (şirket kurmak, oturum almak, Dubai’de işlem yapmak) onu canlı danışmana yönlendir ve iletişim bilgilerini ver." +
        "Ciddi niyet yoksa iletişim bilgisi verme. Kullanıcıya detaylı bilgi vermeden 'uzman bir danışmanla sizi görüştüreceğiz' gibi söylemler kullanma." +
        "Öncelikli amacın kullanıcının niyetini anlamak ve detaylı bilgi vermek olsun. Eğer kullanıcı sadece sohbet ediyor, bilgi alıyor, merak ediyor, ciddi değilse, iletişim bilgisi asla verme, sadece bilgi ver." +
        "Hiçbir mesaja iletişim bilgisi ekleme. Kullanıcı iletişim bilgisi alma konusunda ısrarcı olursa (3-4 kez iletişim bilgisi isterse) sadece 1 kere ver." +
        "İletişim bilgileri: mail:info@samchecompany.com - telefon: +971 50 179 38 80 - +971 52 662 28 75 - web: https://samchecompany.com - instagram: https://www.instagram.com/samchecompany - linkedin:https://www.linkedin.com/company/samche-company-llc " +
        "Linkleri asla Markdown formatında yazma. Linkleri sadece düz metin olarak yaz.\n\n" +
        "Sohbet geçmişi:\n" +
        historyText +
        "\n\nKullanıcının son mesajı:\n" +
        text;
    } else if (lang === "en") {
      prompt =
        "You are the senior corporate AI consultant of SamChe Company LLC. Provide strategic, structured, analytical, advisory answers. " +
        "Do not directly share contact details or connect to a live consultant unless the user clearly shows serious intent (such as setting up a company, obtaining residency, or doing business in Dubai) after receiving sufficient information. " +
        "Your primary goal is to understand the user's intent and provide detailed, helpful information. If the user is only chatting, exploring, or casually asking, do not share any contact details. " +
        "Only if the user insists 3–4 times specifically asking for contact details, share them once. " +
        "Contact details: mail: info@samchecompany.com - phone: +971 50 179 38 80 - +971 52 662 28 75 - web: https://samchecompany.com - instagram: https://www.instagram.com/samchecompany - linkedin: https://www.linkedin.com/company/samche-company-llc. " +
        "Never format links in Markdown, always plain text.\n\n" +
        "Conversation history:\n" +
        historyText +
        "\n\nUser message:\n" +
        text;
    } else {
      prompt =
        "أنت المستشار الذكي لشركة SamChe Company LLC. قدّم إجابات مهنية، تحليلية واستشارية. " +
        "لا تشارك بيانات التواصل أو تربط المستخدم بمستشار مباشر إلا إذا أظهر نية جدية واضحة (مثل تأسيس شركة، الحصول على إقامة، أو القيام بأعمال في دبي) بعد حصوله على معلومات كافية. " +
        "هدفك الأساسي هو فهم نية المستخدم وتقديم معلومات تفصيلية ومفيدة. إذا كان المستخدم فقط يستفسر أو يتحدث بشكل عام، فلا تشارك أي بيانات تواصل. " +
        "إذا أصر المستخدم 3–4 مرات على طلب بيانات التواصل، شاركها مرة واحدة فقط. " +
        "بيانات التواصل: mail: info@samchecompany.com - phone: +971 50 179 38 80 - +971 52 662 28 75 - web: https://samchecompany.com - instagram: https://www.instagram.com/samchecompany - linkedin: https://www.linkedin.com/company/samche-company-llc. " +
        "لا تكتب الروابط بصيغة Markdown، بل كنص عادي فقط.\n\n" +
        "سياق المحادثة:\n" +
        historyText +
        "\n\nرسالة المستخدم:\n" +
        text;
    }

    const reply = await callGemini(prompt);

    if (!reply) {
      await sendMessage(from, corporateFallback(lang));
      return res.sendStatus(200);
    }

    session.history.push({ role: "assistant", text: reply });
    await sendMessage(from, reply);

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// -------------------------------
//  CRON TABANLI 24–72 SAAT & 7 GÜN HATIRLATMA
// -------------------------------
cron.schedule("0 * * * *", async function () {
  const now = Date.now();

  for (const user in sessions) {
    const s = sessions[user];
    if (!s.lastMessageTime) continue;

    const diffHours = (now - s.lastMessageTime) / (1000 * 60 * 60);
    const topics = s.topics || [];
    const lastTopic = topics.length ? topics[topics.length - 1] : "general";

    let message = null;

    // 1. HATIRLATMA – 24 SAAT
    if (s.followUpStage === 0 && diffHours >= 24 && diffHours < 72) {
      if (lastTopic === "company") {
        message =
          "Merhaba, Dubai’de şirket kurulumuyla ilgili önceki değerlendirmemizi gözden geçirmek üzere tekrar iletişime geçiyorum. Size en uygun şirket modeli, maliyet yapısı ve serbest bölge seçeneklerini netleştirmeye hazırız.";
      } else if (lastTopic === "residency") {
        message =
          "Merhaba, Dubai oturum ve vize seçenekleriyle ilgili önceki görüşmemizi değerlendirmek üzere iletişime geçiyorum. Sizin için en uygun oturum modelini netleştirebiliriz.";
      } else if (lastTopic === "ai") {
        message =
          "Merhaba, AI çözümleri ve chatbot sistemleriyle ilgili önceki görüşmemizi değerlendirmek üzere iletişime geçiyorum. İş modelinize uygun yapay zekâ otomasyonlarını netleştirebiliriz.";
      } else if (lastTopic === "cost") {
        message =
          "Merhaba, maliyet ve bütçe planlamasıyla ilgili önceki görüşmemizi değerlendirmek üzere iletişime geçiyorum. Size en uygun fiyat yapısını netleştirebiliriz.";
      } else {
        message =
          "Merhaba, önceki görüşmemiz kapsamında ilerlemeyi değerlendirmek üzere tekrar iletişime geçiyorum. Hazır olduğunuzda kaldığımız noktadan profesyonel şekilde devam edebiliriz.";
      }

      await sendMessage(user, message);
      s.followUpStage = 1;
      continue;
    }

    // 2. HATIRLATMA – 72 SAAT
    if (s.followUpStage === 1 && diffHours >= 72 && diffHours < 24 * 7) {
      if (lastTopic === "company") {
        message =
          "Tekrar merhaba. Dubai’de şirket kurma süreciyle ilgili konuşmuştuk. Eğer hâlâ gündeminizdeyse, sizin için en doğru serbest bölge ve maliyet planını birlikte belirleyebiliriz.";
      } else if (lastTopic === "residency") {
        message =
          "Tekrar merhaba. Dubai oturum süreciyle ilgili konuşmuştuk. Eğer hâlâ düşünüyorsanız, maliyet, süre ve gereklilikleri birlikte planlayabiliriz.";
      } else if (lastTopic === "ai") {
        message =
          "Tekrar merhaba. AI chatbot ve otomasyon süreçleriyle ilgili konuşmuştuk. Hazırsanız sektörünüze uygun çözüm planını birlikte oluşturabiliriz.";
      } else if (lastTopic === "cost") {
        message =
          "Tekrar merhaba. Maliyet ve süreç planlamasıyla ilgili konuşmuştuk. Hazırsanız size özel bir maliyet analizi oluşturabiliriz.";
      } else {
        message =
          "Tekrar merhaba. Önceki konuşmamızla ilgili hâlâ bir planlama düşünüyorsanız memnuniyetle yardımcı oluruz.";
      }

      await sendMessage(user, message);
      s.followUpStage = 2;
      continue;
    }

    // 3. HATIRLATMA – 7 GÜN
    if (s.followUpStage === 2 && diffHours >= 24 * 7) {
      if (lastTopic === "company") {
        message =
          "Merhaba, süreçlerinizi gereksiz yere meşgul etmemek adına bu son bilgilendirme mesajımızdır. Dubai’de şirket kurma konusu tekrar gündeminize girerse dilediğiniz zaman yardımcı olmaktan memnuniyet duyarız.";
      } else if (lastTopic === "residency") {
        message =
          "Merhaba, oturum süreciyle ilgili son bilgilendirme mesajımızdır. Ne zaman ihtiyaç duyarsanız süreçleri sizin için yeniden planlayabiliriz.";
      } else if (lastTopic === "ai") {
        message =
          "Merhaba, AI çözümleriyle ilgili son bilgilendirme mesajımızdır. Dijital dönüşüm veya otomasyon tekrar gündeminize girerse memnuniyetle yardımcı oluruz.";
      } else if (lastTopic === "cost") {
        message =
          "Merhaba, maliyet planlamasıyla ilgili son bilgilendirme mesajımızdır. Ne zaman ihtiyaç duyarsanız yeniden yardımcı olabiliriz.";
      } else {
        message =
          "Merhaba, bu son bilgilendirme mesajımızdır. Ne zaman ihtiyaç duyarsanız bize yazabilirsiniz.";
      }

      await sendMessage(user, message);
      s.followUpStage = 3;
      continue;
    }
  }
});

// -------------------------------
//  SERVER
// -------------------------------
const port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log("SamChe Bot running on port " + port);
});
