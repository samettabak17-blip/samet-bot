// app.js – WhatsApp + Gemini 2.0 Flash (full, updated)

import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

// -------------------------------
//  SESSION MEMORY
// -------------------------------
const sessions = {};

// -------------------------------
//  TOPIC DETECTION (KONU ALGILAMA)
// -------------------------------
function detectTopic(text) {
  const t = text.toLowerCase();

  if (
    t.includes("company") ||
    t.includes("şirket") ||
    t.includes("kurmak") ||
    t.includes("business setup")
  )
    return "company_setup";

  if (
    t.includes("residency") ||
    t.includes("oturum") ||
    t.includes("visa") ||
    t.includes("vize")
  )
    return "residency";

  if (t.includes("license") || t.includes("trade license"))
    return "license";

  return null;
}

// sadece sponsorlukla oturum isteyenleri yakala
function isSponsorOnlyResidency(text) {
  const t = text.toLowerCase();
  const residencyWords =
    t.includes("oturum") || t.includes("residency") || t.includes("visa") || t.includes("vize");
  const companyWords =
    t.includes("şirket") ||
    t.includes("company") ||
    t.includes("kurmak") ||
    t.includes("business setup") ||
    t.includes("firma açmak");

  return residencyWords && !companyWords;
}

// -------------------------------
//  FOLLOW-UP MESSAGE (KONUYA GÖRE)
// -------------------------------
function getFollowUpMessage(topic, stage) {
  let base;
  switch (topic) {
    case "company_setup":
      base = "Merhaba, şirket kurma süreciyle ilgili konuşmamız yarım kalmıştı. Hazırsanız devam edebiliriz.";
      break;
    case "residency":
      base = "Merhaba, oturum ve residency süreciyle ilgili konuşmamız yarım kalmıştı. İsterseniz devam edebiliriz.";
      break;
    case "license":
      base = "Merhaba, trade license süreciyle ilgili konuşmamız yarım kalmıştı. Hazırsanız devam edebiliriz.";
      break;
    default:
      base = "Merhaba, konuşmamız yarım kalmıştı. Hazırsanız devam edebiliriz.";
  }

  if (stage === 1) return base + " (1. hatırlatma)";
  if (stage === 2) return base + " (2. hatırlatma)";
  if (stage === 3) return base + " (son hatırlatma)";
  return base;
}

// -------------------------------
//  SPONSORLU OTURUM MESAJI
// -------------------------------
const sponsorResidencyText =
  "Bu ülkede yaşayabilmeniz ve çalışabilmeniz için size birilerinin sponsor olması gerekiyor ya da şirket açıp kendinize sponsor olmanız gerekiyor. " +
  "Şirket kurmadan da dilerseniz biz bu sponsorlugu sizin için sağlıyoruz yani iki yıllık oturumunuz için burada firmalar size sponsor oluyorlar, " +
  "bu sponsorlukla burada yaşayabiliyorsunuz fakat o firmada çalışmıyorsunuz, firma size sadece oturumunuz için sponsor oluyor. " +
  "İşlemleriniz tamamlandıktan sonra sponsor firmanızın size sunduğu NOC Belgesi ile (No Objection Certificate) ülkede istediğiniz sektörde resmi olarak çalışma hakkına " +
  "ya da iş kurma hakkına sahip oluyorsunuz. Bu belge sponsorunuzun ekstra bir işte çalışmanıza itirazı olmadığını gösteren belgedir. " +
  "Dubai iki yıllık oturum ve çalışma izni için işlemleri Türkiye’den başlatıyoruz, ülkeye çalışan vizesi ile giriş yapıyorsunuz.\n\n" +
  "İki yıllık oturum ücreti toplam 13.000 AED (3,500$)\n" +
  "1. ödeme 4000 AED (iş teklifi ve kontrat için). Devlet onaylı evrak 10 gün içinde ulaşır, ardından 2. ödeme alınır.\n" +
  "2. ödeme 8000 AED (employment visa). E-visa maksimum 30 gün içinde ulaşır.\n" +
  "3. ödeme 1000 AED (ID kart ve damgalama) ülkeye giriş sonrası ödenir. Süre 30 gün.";

// -------------------------------
//  BANKA BİLGİLERİ (USD HESABI)
// -------------------------------
const companyBankInfoUSD =
  "Ödemelerinizi aşağıdaki USD şirket hesabına EFT/Havale ile yapabilirsiniz:\n\n" +
  "Account holder: SamChe Company LLC\n" +
  "Account number: 9726414926\n" +
  "IBAN: AE210860000009726414926\n" +
  "BIC: WIOBAEADXXX\n" +
  "Bank address:\nEtihad Airways Centre 5th Floor, Abu Dhabi, UAE.";

// -------------------------------
//  WHATSAPP SEND (4096 LIMIT SAFE)
// -------------------------------
async function sendMessage(to, body) {
  try {
    const chunks = [];
    for (let i = 0; i < body.length; i += 4000) {
      chunks.push(body.substring(i, i + 4000));
    }

    for (const chunk of chunks) {
      await axios.post(
        `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to,
          text: { body: chunk },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch (err) {
    console.error("WhatsApp send error:", err.response?.data || err.message);
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
//  GEMINI 2.0 FLASH CALL
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

    const reply =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return reply.trim() || null;
  } catch (err) {
    console.error("Gemini API error:", err.response?.data || err.message);
    return null;
  }
}

// -------------------------------
//  STATIC TEXTS
// -------------------------------
const servicesList = {
  tr:
    "SamChe Company LLC olarak sunduğumuz hizmetler:\n" +
    "1. Şirketlere Özel Yapay Zekâ Sistemleri\n" +
    "2. Dijital Büyüme & İçerik Stratejisi\n" +
    "3. Marka Yönetimi & Sosyal Medya\n" +
    "4. Kitle Büyümesi & Performans Optimizasyonu\n" +
    "5. BAE Şirket Kurulumu & Pazar Girişi\n" +
    "6. Serbest Bölge Seçimi & Uyum (Compliance)\n" +
    "7. Webchat AI Chatbot Çözümleri",
  en:
    "SamChe Company LLC provides:\n" +
    "1. Private AI Systems\n" +
    "2. Digital Growth & Content Strategy\n" +
    "3. Branding & Social Media\n" +
    "4. Audience Growth & Performance Optimization\n" +
    "5. UAE Business Setup & Market Entry\n" +
    "6. Free Zone Selection & Compliance\n" +
    "7. Webchat AI Chatbot Solutions",
  ar:
    "تقدم SamChe Company LLC:\n" +
    "1. أنظمة ذكاء اصطناعي خاصة\n" +
    "2. استراتيجية النمو الرقمي والمحتوى\n" +
    "3. إدارة العلامة التجارية ووسائل التواصل\n" +
    "4. نمو الجمهور وتحسين الأداء\n" +
    "5. تأسيس الأعمال في الإمارات\n" +
    "6. اختيار المناطق الحرة والامتثال\n" +
    "7. حلول روبوت الدردشة الذكي (Webchat AI Chatbot)",
};

const introAfterLang = {
  tr:
    "Merhaba, ben SamChe Company LLC'nin yapay zekâ danışmanıyım.\n" +
    "BAE şirket kuruluşu, vizeler, yaşam maliyetleri, iş planları, iş stratejileri, yapay zekâ çözümleri ve webchat AI chatbot hizmetleri hakkında sorularınızı yanıtlayabilirim. Size nasıl yardımcı olabilirim?\n\n" +
    servicesList.tr,
  en:
    "Hello, I am the AI consultant of SamChe Company LLC.\n" +
    "I can answer your questions about UAE company formation, visas, cost of living, business plans, business strategies, AI solutions, and webchat AI chatbot services. How can I assist you?\n\n" +
    servicesList.en,
  ar:
    "مرحبًا، أنا المساعد الذكي لشركة SamChe Company LLC.\n" +
    "أستطيع مساعدتك في تأسيس الشركات في الإمارات، التأشيرات، تكاليف المعيشة، خطط الأعمال، الاستراتيجيات، حلول الذكاء الاصطناعي وخدمة روبوت الدردشة الذكي (Webchat AI Chatbot). كيف يمكنني مساعدتك؟\n\n" +
    servicesList.ar,
};

const contactText = {
  tr: "Canlı temsilci: +971 52 728 8586",
  en: "Live consultant: +971 52 728 8586",
  ar: "مستشار مباشر: ‎+971 52 728 8586",
};

// -------------------------------
//  WEBHOOK VERIFY
// -------------------------------
app.get("/webhook", (req, res) => {
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
app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body || "";
    const lower = text.toLowerCase();

    // FIRST MESSAGE
    if (!sessions[from]) {
      sessions[from] = {
        lang: null,
        history: [],
        followUp: false,
        stopFollowUp: false,
        topic: null,
        lastMessageTime: Date.now(),
        followStartTime: null,
        followStage: 0,
        payment: null, // { type: 'residency' | 'other', stage: 'askCurrency' | 'done', currency: 'usd'|'tl' }
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
      if (text === "1") session.lang = "en";
      else if (text === "2") session.lang = "tr";
      else if (text === "3") session.lang = "ar";
      else {
        await sendMessage(from, "Please choose 1, 2 or 3.");
        return res.sendStatus(200);
      }

      await sendMessage(from, introAfterLang[session.lang]);
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    const lang = session.lang;

    // STOP FOLLOW-UP COMMANDS
    if (
      lower.includes("istemiyorum") ||
      lower.includes("rahatsız etmeyin") ||
      lower.includes("stop") ||
      lower.includes("no reminder")
    ) {
      session.stopFollowUp = true;
      session.followUp = false;

      await sendMessage(from, "Tamamdır, sizi bir daha rahatsız etmeyeceğim.");
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // ONLINE / KREDİ KARTI ÖDEME İSTEĞİ
    if (
      lower.includes("kredi kart") ||
      lower.includes("online ödeme") ||
      lower.includes("kartla ödeme") ||
      lower.includes("credit card") ||
      lower.includes("pay online")
    ) {
      await sendMessage(
        from,
        "Kredi kartı veya online ödeme için lütfen canlı temsilci ile iletişime geçin: +971 50 179 38 80"
      );
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // SADECE SPONSORLU OTURUM İSTEĞİ
    if (isSponsorOnlyResidency(lower)) {
      await sendMessage(from, sponsorResidencyText);
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // EVRAKLAR NELER SORUSU
    if (
      lower.includes("evrak") ||
      lower.includes("belge") ||
      lower.includes("hangi evrak") ||
      lower.includes("ne lazım") ||
      lower.includes("ne gerekli")
    ) {
      await sendMessage(
        from,
        "İki yıllık oturum için en az 3 yıllık geçerli pasaportunuz ve biyometrik fotoğrafınızı PDF olarak göndermeniz yeterlidir."
      );
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // AI CHATBOT / WEBCHAT BOT FİYAT SORULARI
    if (
      lower.includes("webchat") ||
      lower.includes("chatbot") ||
      lower.includes("ai chatbot") ||
      (lower.includes("bot") && lower.includes("fiyat"))
    ) {
      await sendMessage(
        from,
        "Webchat AI chatbot çözümleri, paketler ve fiyatlar için lütfen şu sayfayı ziyaret edin:\nhttps://aichatbot.samchecompany.com"
      );
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // ÖDEME NEREYE / HESAP / ÜCRET GÖNDERME SORULARI
    if (
      lower.includes("ücreti nereye") ||
      lower.includes("nereye göndereceğim") ||
      lower.includes("nereye gonderecem") ||
      lower.includes("ödeme nereye") ||
      lower.includes("hesap numarası") ||
      lower.includes("banka bilgisi") ||
      lower.includes("banka bilgilerini") ||
      lower.includes("ödeme yapmak istiyorum")
    ) {
      // Eğer residency ile ilgili ise özel akış
      if (detectTopic(text) === "residency" || isSponsorOnlyResidency(lower)) {
        session.payment = { type: "residency", stage: "askCurrency", currency: null };
        await sendMessage(
          from,
          "İki yıllık oturum için ödemenizi hangi para birimiyle yapmak istersiniz? USD olarak mı yoksa TL olarak mı ödemek istersiniz?"
        );
        session.lastMessageTime = Date.now();
        return res.sendStatus(200);
      } else {
        // Diğer hizmetler için genel banka bilgisi
        await sendMessage(
          from,
          "Ödemelerinizi aşağıdaki USD şirket hesabına EFT/Havale ile yapabilirsiniz:\n\n" +
            companyBankInfoUSD +
            "\n\nÖdeme dekontunuzu ve ilgili evraklarınızı info@samchecompany.com adresine iletebilirsiniz."
        );
        session.lastMessageTime = Date.now();
        return res.sendStatus(200);
      }
    }

    // RESIDENCY ÖDEMESİ İÇİN PARA BİRİMİ CEVABI
    if (session.payment && session.payment.type === "residency" && session.payment.stage === "askCurrency") {
      if (lower.includes("usd") || lower.includes("dolar") || lower.includes("dollar")) {
        session.payment.currency = "usd";
        session.payment.stage = "done";

        await sendMessage(
          from,
          "İki yıllık oturum için ödemenizi USD olarak yapabilirsiniz. Şirket banka bilgilerimiz:\n\n" +
            companyBankInfoUSD +
            "\n\nLütfen ödeme dekontunuzu ve pasaport + biyometrik fotoğrafınızı PDF olarak info@samchecompany.com adresine gönderin."
        );
        session.lastMessageTime = Date.now();
        return res.sendStatus(200);
      }

      if (lower.includes("tl") || lower.includes("türk lirası") || lower.includes("turkish lira")) {
        session.payment.currency = "tl";
        session.payment.stage = "done";

        await sendMessage(
          from,
          "İki yıllık oturum için TL ile ödeme yapmak isterseniz, lütfen evraklarınızı ve ödeme talebinizi doğrudan canlı temsilcimize iletin: +971 50 179 38 80"
        );
        session.lastMessageTime = Date.now();
        return res.sendStatus(200);
      }

      await sendMessage(
        from,
        "Ödemeyi hangi para birimiyle yapmak istediğinizi anlayamadım. Lütfen 'USD' veya 'TL' olarak belirtin."
      );
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // TOPIC DETECTION & FOLLOW-UP START
    const topic = detectTopic(text);
    if (topic && !session.stopFollowUp) {
      if (!session.followUp) {
        session.followUp = true;
        session.topic = topic;
        session.followStartTime = Date.now();
        session.followStage = 0;
      }
      session.lastMessageTime = Date.now();
    }

    // CONTACT
    if (
      lower.includes("contact") ||
      lower.includes("iletişim") ||
      lower.includes("whatsapp") ||
      lower.includes("call") ||
      lower.includes("telefon")
    ) {
      await sendMessage(from, contactText[lang]);
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    // MEMORY
    session.history.push({ role: "user", text });
    if (session.history.length > 10) session.history.shift();

    const historyText = session.history
      .map((m) => `User: ${m.text}`)
      .join("\n");

    // PROMPT
    const prompt =
      lang === "tr"
        ? `SamChe Company LLC’nin kurumsal yapay zekâ danışmanısın. Profesyonel, stratejik, analitik ve yol gösterici cevaplar ver. Kullanıcı iletişim bilgileri istendiğinde ya da canlı bir temsilci ile doğrudan sohbet etmek istediğinde, iletişim bilgilerini doğrudan verme. Önce kullanıcının niyetini öğren. Kullanıcı ciddi niyet gösterirse (şirket kurmak, oturum almak, Dubai’de işlem yapmak) onu canlı danışmana yönlendir ve iletişim bilgilerini ver. Ciddi niyet yoksa iletişim bilgisi verme. Eğer kullanıcı sadece sohbet ediyor, bilgi alıyor, merak ediyor, ciddi değilse, iletişim bilgisi verme, sadece bilgi ver. Hiçbir mesaja iletişim bilgisi ekleme. Kullanıcı iletişim bilgisi alma konusunda ısrarcı olursa (3-4 kez iletişim bilgisi isterse) sadece 1 kere ver. İletişim bilgileri: mail: info@samchecompany.com - telefon: +971 50 179 38 80 - +971 52 662 28 75 - web: https://samchecompany.com - instagram: https://www.instagram.com/samchecompany - linkedin: https://www.linkedin.com/company/samche-company-llc. SamChe Company LLC webchat AI chatbot hizmeti de sunmaktadır. Kullanıcı webchat bot, chatbot veya AI chatbot fiyatı, paketleri veya demo isterse onu https://aichatbot.samchecompany.com adresine yönlendir. Linkleri asla Markdown formatında yazma. Linkleri sadece düz metin olarak yaz. Sohbet geçmişi:\n${historyText}\n\nKullanıcının son mesajı:\n${text}`
        : lang === "en"
        ? `You are the senior corporate AI consultant of SamChe Company LLC. Provide strategic, structured, analytical, advisory answers. SamChe Company LLC also provides webchat AI chatbot solutions. If the user asks about webchat bot, chatbot or AI chatbot pricing, packages or demo, direct them to https://aichatbot.samchecompany.com. Conversation history:\n${historyText}\n\nUser message:\n${text}`
        : `أنت المستشار الذكي لشركة SamChe Company LLC. قدم إجابات تحليلية واستراتيجية وواضحة. تقدم SamChe Company LLC أيضًا حلول Webchat AI Chatbot. إذا سأل المستخدم عن أسعار أو باقات أو تجربة روبوت الدردشة، فقم بتوجيهه إلى https://aichatbot.samchecompany.com. سياق المحادثة:\n${historyText}\n\nرسالة المستخدم:\n${text}`;

    const reply = await callGemini(prompt);

    if (!reply) {
      await sendMessage(from, corporateFallback(lang));
      session.lastMessageTime = Date.now();
      return res.sendStatus(200);
    }

    session.history.push({ role: "assistant", text: reply });

    await sendMessage(from, reply);
    session.lastMessageTime = Date.now();

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// -------------------------------
//  SERVER
// -------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("SamChe Bot running on port " + port));

// -------------------------------
//  DAILY / 3-DAY / 7-DAY FOLLOW-UP REMINDERS
// -------------------------------
setInterval(async () => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  for (const user in sessions) {
    const s = sessions[user];

    if (!s.followUp || s.stopFollowUp || !s.followStartTime) continue;

    const diff = now - s.followStartTime;
    const days = diff / oneDay;

    // 1. hatırlatma (1 gün sonra)
    if (s.followStage === 0 && days >= 1) {
      const msg = getFollowUpMessage(s.topic, 1);
      await sendMessage(user, msg);
      s.followStage = 1;
      s.lastMessageTime = now;
      continue;
    }

    // 2. hatırlatma (3 gün sonra)
    if (s.followStage === 1 && days >= 3) {
      const msg = getFollowUpMessage(s.topic, 2);
      await sendMessage(user, msg);
      s.followStage = 2;
      s.lastMessageTime = now;
      continue;
    }

    // Son hatırlatma (7 gün sonra)
    if (s.followStage === 2 && days >= 7) {
      const msg = getFollowUpMessage(s.topic, 3);
      await sendMessage(user, msg);
      s.followStage = 3;
      s.followUp = false; // takip biter
      s.lastMessageTime = now;
      continue;
    }
  }
}, 60 * 60 * 1000); // her saat kontrol
