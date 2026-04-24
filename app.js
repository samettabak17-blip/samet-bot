// =====================================================
// V5 PRO PATCH - PART 1
// HARD LANGUAGE LOCK + SMART INTENT OVERRIDE
// APPEND / REPLACE RELATED FUNCTIONS IN V5
// =====================================================
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const http = require("http");
const cron = require("node-cron");

const app = express();
app.use(express.json({ limit: "10mb" }));

const server = http.createServer(app);
// =====================================================
// NORMALIZE PRO
// =====================================================

function normalizeText(text = "") {
  return text
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

// =====================================================
// HARD LANGUAGE LOCK ENGINE
// RULE:
// Turkish user never gets English reply
// =====================================================

function detectLanguage(text, previous = "tr") {
  if (!text) return previous;

  // Arabic direct
  if (/[\u0600-\u06FF]/.test(text)) {
    return "ar";
  }

  const raw = text.toLowerCase();
  const t = normalizeText(text);

  const turkishStrong = [
    "merhaba",
    "nasil",
    "sirket",
    "kurmak",
    "oturum",
    "vize",
    "ucret",
    "fiyat",
    "dubai",
    "calismak",
    "istiyorum",
    "yardim",
    "neden",
    "ne kadar",
    "hangi",
    "sadece"
  ];

  const englishStrong = [
    "hello",
    "hi",
    "how",
    "company",
    "setup",
    "business",
    "residency",
    "visa",
    "cost",
    "price",
    "want",
    "would",
    "like",
    "services",
    "help"
  ];

  let tr = 0;
  let en = 0;

  for (const word of turkishStrong) {
    if (t.includes(word)) tr++;
  }

  for (const word of englishStrong) {
    if (raw.includes(word)) en++;
  }

  // Turkish chars bonus
  if (/[çğıöşü]/i.test(text)) tr += 4;

  // Turkish grammar bonus
  if (
    t.includes(" istiyorum") ||
    t.includes(" nasil") ||
    t.includes(" nedir") ||
    t.includes(" olur mu")
  ) {
    tr += 3;
  }

  // decisive lock
  if (tr >= en) return "tr";
  if (en > tr) return "en";

  return previous || "tr";
}

// =====================================================
// INTENT OVERRIDE ENGINE
// No missing residency requests anymore
// =====================================================

function detectIntent(text) {
  const t = normalizeText(text);

  // -------------------------------------------------
  // RESIDENCY FIRST PRIORITY
  // -------------------------------------------------
  const residencyWords = [
    "oturum",
    "residency",
    "residence",
    "visa",
    "vize",
    "calismak istiyorum",
    "dubai de calismak",
    "dubaide calismak",
    "dubai yasamak",
    "yasamak istiyorum",
    "tasinmak istiyorum",
    "sponsorlu",
    "work permit",
    "job visa",
    "sadece oturum",
    "oturum almak istiyorum",
    "calismak istiyom",
    "calismak istiyorum"
  ];

  for (const w of residencyWords) {
    if (t.includes(w)) {
      return "residency";
    }
  }

  // -------------------------------------------------
  // COMPANY
  // -------------------------------------------------
  const companyWords = [
    "sirket",
    "company",
    "business setup",
    "freezone",
    "free zone",
    "mainland",
    "lisans",
    "trade license",
    "kurulus",
    "kurmak istiyorum"
  ];

  for (const w of companyWords) {
    if (t.includes(w)) {
      return "company";
    }
  }

  // -------------------------------------------------
  // AI
  // -------------------------------------------------
  const aiWords = [
    "chatbot",
    "ai",
    "yapay zeka",
    "otomasyon",
    "crm",
    "whatsapp bot",
    "website bot"
  ];

  for (const w of aiWords) {
    if (t.includes(w)) {
      return "ai";
    }
  }

  // -------------------------------------------------
  // TRUST
  // -------------------------------------------------
  const trustWords = [
    "guven",
    "güven",
    "real mi",
    "gercek mi",
    "dolandirici",
    "safe mi"
  ];

  for (const w of trustWords) {
    if (t.includes(w)) {
      return "trust";
    }
  }

  return "general";
}

// =====================================================
// TOPIC SWITCH PATCH
// If user changes topic, old topic ignored
// =====================================================

function forceTopic(session, intent) {
  session.lastTopic = intent;
  session.lastSubTopic = null;
}

// =====================================================
// LANGUAGE SAFE OUTPUT FILTER
// If GPT returns wrong language => replace
// =====================================================

function outputLooksEnglish(text = "") {
  const t = text.toLowerCase();

  const enWords = [
    "the",
    "your",
    "company",
    "please",
    "would",
    "assist",
    "regarding",
    "hello"
  ];

  let score = 0;

  for (const w of enWords) {
    if (t.includes(w)) score++;
  }

  return score >= 2;
}

function enforceLanguage(session, reply) {
  if (!reply) return reply;

  // Turkish locked user
  if (
    session.language === "tr" &&
    outputLooksEnglish(reply)
  ) {
    return "Size en doğru şekilde yardımcı olabilmem için talebinizi anladım. Dubai’de oturum, şirket kuruluşu, vizeler veya maliyetler konusunda detay paylaşabilirim. Hangi konu ile ilerlemek istersiniz?";
  }

  return reply;
}

// =====================================================
// V5 PRO PATCH - PART 2
// REPLACE buildReply() FUNCTION FULLY
// HARD ROUTING + NO STUPID FALLBACK + DETAIL FLOOR
// =====================================================

async function buildReply(session, userText) {
  // -----------------------------------------------
  // LANGUAGE DETECT + HARD LOCK
  // -----------------------------------------------
  const lang = detectLanguage(
    userText,
    session.language
  );

  session.language = lang;
  session.lastMessageAt = now();

  const clean = normalizeText(userText);

  // -----------------------------------------------
  // FIRST GREETING ONLY
  // -----------------------------------------------
  if (!session.greeted) {
    session.greeted = true;

    const greet = greetingMessage(lang);

    rememberMessage(
      session,
      "assistant",
      greet
    );

    return greet;
  }

  // -----------------------------------------------
  // DUPLICATE SHIELD
  // -----------------------------------------------
  if (isDuplicate(session, clean)) {
    return null;
  }

  rememberMessage(
    session,
    "user",
    userText
  );

  // -----------------------------------------------
  // HOT LEAD PAYMENT ROUTE
  // -----------------------------------------------
  if (
    clean.includes("odeme yapacagim") ||
    clean.includes("payment") ||
    clean.includes("baslayalim") ||
    clean.includes("evrak gonderecegim") ||
    clean.includes("ready to start")
  ) {
    bumpLead(session, 5);

    let payText =
      lang === "en"
        ? `Thank you. Since you are ready to proceed, I’m sharing our payment details below.\n\n${bankInfo()}`
        : lang === "ar"
        ? `شكراً لكم. بما أنكم جاهزون للبدء، أشارك معكم تفاصيل الدفع أدناه.\n\n${bankInfo()}`
        : `Teşekkür ederim. Sürece başlamaya hazır olduğunuz için ödeme bilgilerini aşağıda paylaşıyorum.\n\n${bankInfo()}`;

    rememberMessage(
      session,
      "assistant",
      payText
    );

    return payText;
  }

  // -----------------------------------------------
  // LIVE AGENT REQUEST
  // -----------------------------------------------
  if (
    clean.includes("canli temsilci") ||
    clean.includes("temsilci") ||
    clean.includes("human") ||
    clean.includes("live agent")
  ) {
    session.agentRequests =
      (session.agentRequests || 0) + 1;

    if (session.agentRequests >= 2) {
      const msg =
        liveAgentMessage(lang);

      rememberMessage(
        session,
        "assistant",
        msg
      );

      return msg;
    }
  }

  // -----------------------------------------------
  // INTENT DETECT
  // -----------------------------------------------
  const intent =
    detectIntent(clean);

  forceTopic(
    session,
    intent
  );

  // =================================================
  // RESIDENCY ROUTE (HIGH PRIORITY)
  // =================================================
  if (intent === "residency") {
    bumpLead(session, 2);

    let msg =
      residencyIntro(lang);

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // =================================================
  // COMPANY ROUTE
  // =================================================
  if (intent === "company") {
    bumpLead(session, 2);

    let msg =
      companyReply(session);

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // =================================================
  // AI ROUTE
  // =================================================
  if (intent === "ai") {
    bumpLead(session, 2);

    let msg =
      aiReply(lang);

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // =================================================
  // TRUST ROUTE
  // =================================================
  if (intent === "trust") {
    let msg =
      trustReply(lang);

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;
  }

  // =================================================
  // GENERAL INTELLIGENT ROUTE
  // =================================================

  // If Turkish user asks anything,
  // never ask stupid vague clarification directly

  if (
    lang === "tr" &&
    clean.length >= 4
  ) {
    // Dubai city question
    if (
      clean.includes("dubai nasil") ||
      clean.includes("dubai iyi mi") ||
      clean.includes("dubai nasil bir yer")
    ) {
      const msg =
        `Dubai; güvenli yaşam yapısı, güçlü ekonomi, uluslararası iş ortamı ve modern şehir planlaması ile öne çıkan bir merkezdir. Vergi avantajları, yüksek yaşam standardı ve hızlı iş süreçleri nedeniyle girişimciler ile profesyoneller tarafından sık tercih edilir. Ancak yaşam maliyeti ve hedeflenen yaşam tarzına göre bütçe planlaması önemlidir. Dubai’yi yaşam, iş kurma veya yatırım açısından mı değerlendiriyorsunuz?`;

      rememberMessage(
        session,
        "assistant",
        msg
      );

      return msg;
    }

    // cost question
    if (
      clean.includes("maliyet") ||
      clean.includes("ucret") ||
      clean.includes("fiyat")
    ) {
      const msg =
        `Maliyet konusu; seçilecek yapı, faaliyet alanı, vize ihtiyacı ve emirliğe göre değişmektedir. Bu nedenle tek rakam vermek yerine ihtiyacınıza göre net tablo çıkarmak daha doğru olur. Şirket kuruluşu, oturum veya yapay zekâ hizmetlerinden hangisi için maliyet öğrenmek istiyorsunuz?`;

      rememberMessage(
        session,
        "assistant",
        msg
      );

      return msg;
    }
  }

  // =================================================
  // GPT CONTROLLED FALLBACK
  // =================================================

  try {
    let msg =
      await askGPT(
        session,
        userText
      );

    msg =
      enforceLanguage(
        session,
        msg
      );

    // short answer fix
    if (
      msg &&
      msg.length < 80
    ) {
      msg +=
        " " +
        closingQuestion(
          "general",
          lang
        );
    }

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return msg;

  } catch (error) {
    log(
      "GPT PATCH ERROR:",
      error.message
    );

    const fallback =
      lang === "en"
        ? `I understood your request. Please share a little more detail so I can guide you properly. ${closingQuestion("general", lang)}`
        : lang === "ar"
        ? `تم فهم طلبكم. يرجى توضيح بعض التفاصيل حتى أتمكن من توجيهكم بالشكل المناسب. ${closingQuestion("general", lang)}`
        : `Talebinizi anladım. Size en doğru yönlendirmeyi yapabilmem için biraz daha detay paylaşabilirsiniz. ${closingQuestion("general", lang)}`;

    rememberMessage(
      session,
      "assistant",
      fallback
    );

    return fallback;
  }
}

// =====================================================
// V5 PRO PATCH - PART 3
// HUMAN ALERT MODE + SMART PING UPGRADE + FINAL PATCH
// APPEND UNDER PART 2
// =====================================================

// =====================================================
// ADMIN SETTINGS
// Add ENV:
// ADMIN_NUMBER=971501793880
// =====================================================

const ADMIN_NUMBER =
  process.env.ADMIN_NUMBER || "";

// =====================================================
// HUMAN ALERT CONTROL
// =====================================================

async function sendAdminAlert(message) {
  try {
    if (!ADMIN_NUMBER) return;

    await sendWhatsAppMessage(
      ADMIN_NUMBER,
      message
    );

  } catch (error) {
    log(
      "ADMIN ALERT ERROR:",
      error.message
    );
  }
}

function shouldTriggerHumanAlert(
  session,
  clean
) {
  const hotWords = [
    "odeme",
    "payment",
    "baslayalim",
    "ready",
    "today",
    "numara ver",
    "arayin",
    "call me",
    "evrak",
    "fiyat ver",
    "teklif ver",
    "konusalim",
    "whatsapp"
  ];

  for (const w of hotWords) {
    if (clean.includes(w)) {
      return true;
    }
  }

  if (
    session.leadScore >= 7
  ) {
    return true;
  }

  return false;
}

async function maybeSendHumanAlert(
  session,
  userText
) {
  const clean =
    normalizeText(userText);

  if (
    session.alertSent &&
    now() -
      session.alertSent <
      21600000
  ) {
    return;
  }

  if (
    !shouldTriggerHumanAlert(
      session,
      clean
    )
  ) {
    return;
  }

  session.alertSent =
    now();

  const alert =
`🔥 SAMCHE HOT LEAD

User: ${session.userId}
Language: ${session.language}
Topic: ${session.lastTopic || "general"}
Lead Score: ${session.leadScore}

Last Message:
${userText}`;

  await sendAdminAlert(
    alert
  );
}

// =====================================================
// SMART TOPIC PINGS UPGRADE
// Replace old cron if needed
// =====================================================

cron.schedule("* * * * *", async () => {
  try {
    const current =
      now();

    for (const [id, s] of sessions) {
      const diff =
        current -
        s.lastMessageAt;

      const mins =
        diff / 60000;

      const hrs =
        diff / 3600000;

      let msg = null;

      // ---------------------------------------------
      // 10 MIN
      // ---------------------------------------------
      if (
        mins >= 10 &&
        !s.ping10Sent
      ) {
        s.ping10Sent = true;

        if (
          s.lastTopic ===
          "company"
        ) {
          msg =
            s.language === "en"
              ? "If you share your sector and visa needs, I can guide you toward the most suitable Dubai company structure."
              : s.language === "ar"
              ? "إذا شاركتم القطاع وعدد التأشيرات المطلوبة يمكنني توجيهكم نحو أنسب هيكل شركة في دبي."
              : "Sektörünüzü ve vize ihtiyacınızı paylaşırsanız size en uygun Dubai şirket yapısı konusunda yönlendirme sunabilirim.";
        }

        else if (
          s.lastTopic ===
          "residency"
        ) {
          msg =
            s.language === "en"
              ? "If your Dubai residency plan is still active, I can help clarify the most suitable route based on your budget and timeline."
              : s.language === "ar"
              ? "إذا كانت خطة الإقامة في دبي ما زالت قائمة، يمكنني توضيح الأنسب حسب الميزانية والمدة."
              : "Dubai oturum planınız devam ediyorsa bütçe ve zaman planınıza göre en uygun seçeneği netleştirebilirim.";
        }

        else if (
          s.lastTopic ===
          "ai"
        ) {
          msg =
            s.language === "en"
              ? "If you'd like to automate lead generation or customer replies, I can suggest the most efficient AI solution."
              : s.language === "ar"
              ? "إذا رغبتم بأتمتة العملاء أو الردود يمكنني اقتراح أنسب حل بالذكاء الاصطناعي."
              : "Müşteri kazanımı veya otomatik cevaplama hedefiniz varsa size en verimli yapay zekâ çözümünü önerebilirim.";
        }

        else {
          msg =
            s.language === "en"
              ? "If your plan is still active, feel free to continue whenever you're ready."
              : s.language === "ar"
              ? "إذا كانت خطتكم مستمرة يمكننا المتابعة في أي وقت يناسبكم."
              : "Planınız devam ediyorsa hazır olduğunuzda dilediğiniz zaman devam edebiliriz.";
        }
      }

      // ---------------------------------------------
      // 3 HOUR
      // ---------------------------------------------
      else if (
        hrs >= 3 &&
        !s.ping3hSent
      ) {
        s.ping3hSent = true;

        if (
          s.lastTopic ===
          "company"
        ) {
          msg =
            s.language === "en"
              ? "Choosing the right setup at the beginning can save significant cost and time later. We can continue whenever you'd like."
              : s.language === "ar"
              ? "اختيار الهيكل الصحيح من البداية قد يوفر وقتاً وتكلفة لاحقاً. يمكننا المتابعة متى شئتم."
              : "Başlangıçta doğru şirket yapısını seçmek ileride ciddi zaman ve maliyet avantajı sağlayabilir. Dilerseniz devam edebiliriz.";
        }

        else {
          msg =
            s.language === "en"
              ? "If your Dubai plans are still under evaluation, I’d be happy to continue from where we left off."
              : s.language === "ar"
              ? "إذا كانت خطط دبي ما زالت قيد الدراسة يسعدني المتابعة من حيث توقفنا."
              : "Dubai planınız hâlâ değerlendiriliyorsa kaldığımız yerden devam etmekten memnuniyet duyarım.";
        }
      }

      // ---------------------------------------------
      // 24 HOUR
      // ---------------------------------------------
      else if (
        hrs >= 24 &&
        !s.ping24hSent
      ) {
        s.ping24hSent = true;

        msg =
          s.language === "en"
            ? "Whenever you're ready regarding your Dubai plans, I’ll be here to assist professionally."
            : s.language === "ar"
            ? "متى ما كنتم جاهزين بخصوص خططكم في دبي سأكون هنا للمساعدة بكل احترافية."
            : "Dubai planınızla ilgili hazır olduğunuzda profesyonel şekilde yardımcı olmak için burada olacağım.";
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
      "SMART PING ERROR:",
      error.message
    );
  }
});

// =====================================================
// PATCH buildReply HOOK
// Add this single line inside buildReply()
// right after rememberMessage(user)
// =====================================================

// await maybeSendHumanAlert(session, userText);

// =====================================================
// FINAL NOTE
// Delete old ping cron if duplicated.
// Keep only latest cron block.
// =====================================================

// =====================================================
// V5 PRO PATCH - PART 4
// QUALITY CONTROL + MEMORY UPGRADE + HUMAN MODE
// APPEND UNDER PART 3
// =====================================================

// =====================================================
// HUMAN MODE SWITCH
// If admin manually talks, bot pauses
// =====================================================

function isBotPaused(session) {
  if (!session.pauseUntil) return false;
  return now() < session.pauseUntil;
}

function pauseBot(session, hours = 6) {
  session.pauseUntil =
    now() + hours * 3600000;
}

// =====================================================
// If user requests real human strongly
// =====================================================

function wantsHuman(clean) {
  const words = [
    "canli temsilci",
    "temsilci",
    "human",
    "real person",
    "manager",
    "yetkili",
    "biri arasın",
    "beni arayin",
    "arayin"
  ];

  return words.some(w =>
    clean.includes(w)
  );
}

// =====================================================
// RESPONSE QUALITY FLOOR
// Never weak replies
// =====================================================

function enhanceWeakReply(
  session,
  text
) {
  if (!text) return text;

  let msg = text.trim();

  // too short
  if (msg.length < 120) {
    msg +=
      " " +
      closingQuestion(
        session.lastTopic ||
          "general",
        session.language
      );
  }

  // one line fix
  if (
    msg.split(" ").length <
    12
  ) {
    msg +=
      " Size en doğru yönlendirmeyi yapabilmem için birkaç detay paylaşabilirsiniz.";
  }

  return msg;
}

// =====================================================
// SMART MEMORY EXTRACTION
// =====================================================

function extractBusinessData(
  session,
  clean
) {
  // visa count
  const visaMatch =
    clean.match(
      /(\d+)\s*(visa|vize)/
    );

  if (visaMatch) {
    session.visaNeed =
      visaMatch[1];
  }

  // sectors
  const sectors = [
    "emlak",
    "restaurant",
    "restoran",
    "cafe",
    "danismanlik",
    "consulting",
    "software",
    "yazilim",
    "trading",
    "ticaret",
    "beauty",
    "guzellik"
  ];

  for (const s of sectors) {
    if (
      clean.includes(s)
    ) {
      session.sector =
        s;
      break;
    }
  }

  // budget
  const budget =
    clean.match(
      /(\d+)\s*(aed|usd|tl)/
    );

  if (budget) {
    session.budget =
      budget[0];
  }
}

// =====================================================
// DYNAMIC DETAIL FLOOR
// =====================================================

function makeDetailedIfNeeded(
  session,
  text
) {
  if (!text) return text;

  if (
    text.length > 220
  ) {
    return text;
  }

  if (
    session.lastTopic ===
    "company"
  ) {
    return (
      text +
      " Şirket kuruluşunda doğru yapı seçimi; vergi planlaması, banka hesabı süreci, vize kapasitesi ve ilerideki operasyonel esneklik açısından önem taşır."
    );
  }

  if (
    session.lastTopic ===
    "residency"
  ) {
    return (
      text +
      " Oturum süreçlerinde doğru yolun seçilmesi; maliyet, hız ve uzun vadeli uygunluk açısından önemli fark yaratabilir."
    );
  }

  return text;
}

// =====================================================
// ADMIN MANUAL MODE
// If admin writes #pause + usernumber
// future expandable
// =====================================================

function parseAdminCommand(
  from,
  text
) {
  if (
    !ADMIN_NUMBER ||
    from !==
      ADMIN_NUMBER
  ) {
    return null;
  }

  const clean =
    normalizeText(text);

  if (
    clean.startsWith(
      "pause "
    )
  ) {
    const parts =
      clean.split(" ");

    return {
      type: "pause",
      target:
        parts[1]
    };
  }

  return null;
}

// =====================================================
// PATCH buildReply INTEGRATION NOTES
// Add inside buildReply():
//
// const clean = normalizeText(userText);
// extractBusinessData(session, clean);
//
// if (isBotPaused(session)) return null;
//
// if (wantsHuman(clean)) {
//   pauseBot(session, 6);
//   return liveAgentMessage(session.language);
// }
//
// before every final return:
// msg = enhanceWeakReply(session, msg);
// msg = makeDetailedIfNeeded(session, msg);
// =====================================================

// =====================================================
// SMART MEMORY CLEANUP
// remove inactive sessions after 30 days
// =====================================================

cron.schedule(
  "0 3 * * *",
  () => {
    try {
      const limit =
        now() -
        30 *
          24 *
          3600000;

      for (const [
        id,
        s
      ] of sessions) {
        if (
          s.updatedAt <
          limit
        ) {
          sessions.delete(
            id
          );
        }
      }

      log(
        "SESSION CLEANUP DONE"
      );

    } catch (error) {
      log(
        "CLEANUP ERROR:",
        error.message
      );
    }
  }
);

// =====================================================
// RESULT OF PART 4
// - Better memory
// - Better detail
// - Human pause mode
// - Better lead extraction
// - Stronger replies
// =====================================================

// =====================================================
// V5 PRO PATCH - PART 5
// FINAL HARDENING + GPT GOVERNOR + FULL REPLACEMENTS
// APPEND UNDER PART 4
// =====================================================

// =====================================================
// GPT GOVERNOR
// GPT cannot break SamChe rules
// =====================================================

async function askGPT(session, userText) {
  const lang =
    session.language || "tr";

  const systemTR = `
Sen SamChe Company LLC'nin resmi premium danışman botusun.

Kurallar:
- Türkçe kullanıcıya sadece Türkçe cevap ver.
- Kısa cevap verme.
- Her zaman açıklayıcı ve profesyonel ol.
- Başka şirkete, avukata, devlete yönlendirme yapma.
- Dubai şirket kurulumu, oturum, vize, maliyet, iş geliştirme ve AI konularında uzman gibi konuş.
- Her cevabın sonunda mantıklı bir soru sor.
- Emin olmadığında bile boş dönme, yapıcı yönlendirme yap.
`;

  const systemEN = `
You are the official premium consultant bot of SamChe Company LLC.

Rules:
- Reply only in English to English users.
- Be detailed, strategic and professional.
- Never redirect users elsewhere.
- Expert in Dubai company setup, residency, visas, cost, business growth and AI systems.
- End every reply with a relevant guiding question.
- Never return empty or vague answers.
`;

  const systemAR = `
أنت المستشار الرسمي الذكي لشركة SamChe Company LLC.

القواعد:
- رد بالعربية فقط للمستخدم العربي.
- كن احترافياً وواضحاً ومفصلاً.
- لا تقم بتوجيه المستخدم إلى جهات أخرى.
- خبير في تأسيس الشركات والإقامة والتأشيرات في دبي.
- اختم كل رد بسؤال مناسب.
`;

  const systemPrompt =
    lang === "en"
      ? systemEN
      : lang === "ar"
      ? systemAR
      : systemTR;

  const messages = [
    {
      role: "system",
      content:
        systemPrompt
    }
  ];

  for (const h of session.history.slice(-8)) {
    messages.push({
      role: h.role,
      content: h.content
    });
  }

  messages.push({
    role: "user",
    content:
      userText
  });

  try {
    const response =
      await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model:
            GPT_MODEL,
          messages,
          temperature: 0.45,
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

    let msg =
      response.data
        .choices[0]
        .message.content
        .trim();

    msg =
      enforceLanguage(
        session,
        msg
      );

    msg =
      enhanceWeakReply(
        session,
        msg
      );

    msg =
      makeDetailedIfNeeded(
        session,
        msg
      );

    return msg;

  } catch (error) {
    log(
      "GPT GOVERNOR ERROR:",
      error.message
    );

    return safeFallback(
      session
    );
  }
}

// =====================================================
// SAFE FALLBACK
// =====================================================

function safeFallback(
  session
) {
  const lang =
    session.language ||
    "tr";

  if (lang === "en") {
    return `I understood your request. I can assist with Dubai company setup, residency options, visas, costs, and business growth solutions. Which area would you like to focus on?`;
  }

  if (lang === "ar") {
    return `تم فهم طلبكم. يمكنني مساعدتكم في تأسيس الشركات في دبي، خيارات الإقامة، التأشيرات، التكاليف، وتطوير الأعمال. ما المجال الذي ترغبون بالتركيز عليه؟`;
  }

  return `Talebinizi anladım. Dubai’de şirket kuruluşu, oturum seçenekleri, vizeler, maliyetler ve iş geliştirme konularında yardımcı olabilirim. Hangi alana odaklanmak istersiniz?`;
}

// =====================================================
// MESSAGE SANITY FILTER
// removes bad outputs
// =====================================================

function sanitizeReply(
  session,
  text
) {
  if (!text) {
    return safeFallback(
      session
    );
  }

  let msg =
    text.trim();

  // nonsense repeats
  if (
    msg.length < 10
  ) {
    return safeFallback(
      session
    );
  }

  // forbidden redirects
  const banned = [
    "consult a lawyer",
    "contact government",
    "ask another company",
    "freezone authority",
    "seek legal advice"
  ];

  for (const b of banned) {
    if (
      msg
        .toLowerCase()
        .includes(b)
    ) {
      return safeFallback(
        session
      );
    }
  }

  return msg;
}

// =====================================================
// FULL RESPONSE FINALIZER
// Use before sendWhatsAppMessage
// =====================================================

function finalizeReply(
  session,
  text
) {
  let msg =
    sanitizeReply(
      session,
      text
    );

  msg =
    enforceLanguage(
      session,
      msg
    );

  msg =
    enhanceWeakReply(
      session,
      msg
    );

  msg =
    makeDetailedIfNeeded(
      session,
      msg
    );

  return msg;
}

// =====================================================
// PATCH WEBHOOK NOTE
// Replace:
//
// await sendWhatsAppMessage(from, reply);
//
// With:
//
// const finalMsg = finalizeReply(session, reply);
// await sendWhatsAppMessage(from, finalMsg);
// =====================================================

// =====================================================
// FINAL RESULT OF PART 5
// - GPT disciplined
// - no wrong language
// - no weak answers
// - no empty replies
// - no rule breaks
// - stronger premium consultant behavior
// =====================================================

// =====================================================
// V5 PRO PATCH - PART 6
// FULL buildReply() FINAL ELITE VERSION
// REPLACE ENTIRE buildReply FUNCTION
// =====================================================

async function buildReply(session, userText) {
  // -------------------------------------------------
  // PREP
  // -------------------------------------------------
  const clean =
    normalizeText(userText);

  session.language =
    detectLanguage(
      userText,
      session.language
    );

  session.lastMessageAt =
    now();
  session.updatedAt =
    now();

  extractBusinessData(
    session,
    clean
  );

  // -------------------------------------------------
  // ADMIN / HUMAN MODE
  // -------------------------------------------------
  if (
    isBotPaused(session)
  ) {
    return null;
  }

  if (
    wantsHuman(clean)
  ) {
    pauseBot(
      session,
      6
    );

    const msg =
      liveAgentMessage(
        session.language
      );

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return finalizeReply(
      session,
      msg
    );
  }

  // -------------------------------------------------
  // FIRST GREETING
  // -------------------------------------------------
  if (
    !session.greeted
  ) {
    session.greeted =
      true;

    const greet =
      greetingMessage(
        session.language
      );

    rememberMessage(
      session,
      "assistant",
      greet
    );

    return finalizeReply(
      session,
      greet
    );
  }

  // -------------------------------------------------
  // DUPLICATE
  // -------------------------------------------------
  if (
    isDuplicate(
      session,
      clean
    )
  ) {
    return null;
  }

  rememberMessage(
    session,
    "user",
    userText
  );

  // -------------------------------------------------
  // HUMAN ALERT HOT LEAD
  // -------------------------------------------------
  await maybeSendHumanAlert(
    session,
    userText
  );

  // -------------------------------------------------
  // PAYMENT / READY ROUTE
  // -------------------------------------------------
  if (
    clean.includes(
      "odeme"
    ) ||
    clean.includes(
      "payment"
    ) ||
    clean.includes(
      "baslayalim"
    ) ||
    clean.includes(
      "ready"
    ) ||
    clean.includes(
      "evrak"
    )
  ) {
    bumpLead(
      session,
      5
    );

    let msg =
      session.language ===
      "en"
        ? `Thank you. Since you are ready to proceed, I’m sharing our payment details below.\n\n${bankInfo()}`
        : session.language ===
          "ar"
        ? `شكراً لكم. بما أنكم جاهزون للبدء، أشارك معكم تفاصيل الدفع أدناه.\n\n${bankInfo()}`
        : `Teşekkür ederim. Sürece başlamaya hazır olduğunuz için ödeme bilgilerini aşağıda paylaşıyorum.\n\n${bankInfo()}`;

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return finalizeReply(
      session,
      msg
    );
  }

  // -------------------------------------------------
  // INTENT DETECT
  // -------------------------------------------------
  const intent =
    detectIntent(
      clean
    );

  forceTopic(
    session,
    intent
  );

  // =================================================
  // RESIDENCY (TOP PRIORITY)
  // =================================================
  if (
    intent ===
    "residency"
  ) {
    bumpLead(
      session,
      3
    );

    const msg =
      residencyIntro(
        session.language
      );

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return finalizeReply(
      session,
      msg
    );
  }

  // =================================================
  // COMPANY
  // =================================================
  if (
    intent ===
    "company"
  ) {
    bumpLead(
      session,
      3
    );

    const msg =
      companyReply(
        session
      );

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return finalizeReply(
      session,
      msg
    );
  }

  // =================================================
  // AI
  // =================================================
  if (
    intent ===
    "ai"
  ) {
    bumpLead(
      session,
      2
    );

    const msg =
      aiReply(
        session.language
      );

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return finalizeReply(
      session,
      msg
    );
  }

  // =================================================
  // TRUST
  // =================================================
  if (
    intent ===
    "trust"
  ) {
    const msg =
      trustReply(
        session.language
      );

    rememberMessage(
      session,
      "assistant",
      msg
    );

    return finalizeReply(
      session,
      msg
    );
  }

  // =================================================
  // SPECIAL TURKISH SMART ROUTES
  // =================================================
  if (
    session.language ===
    "tr"
  ) {
    // Dubai question
    if (
      clean.includes(
        "dubai nasil"
      ) ||
      clean.includes(
        "dubai iyi mi"
      ) ||
      clean.includes(
        "dubai nasil bir yer"
      )
    ) {
      const msg =
        `Dubai; güvenli yaşam yapısı, uluslararası iş ortamı, güçlü ekonomi ve modern şehir düzeni ile öne çıkan bir merkezdir. Vergi avantajları ve hızlı iş süreçleri nedeniyle girişimciler tarafından sık tercih edilir. Yaşam maliyeti ise yaşam tarzına göre değişebilir. Dubai’yi yaşamak, yatırım yapmak veya şirket kurmak açısından mı değerlendiriyorsunuz?`;

      rememberMessage(
        session,
        "assistant",
        msg
      );

      return finalizeReply(
        session,
        msg
      );
    }

    // Cost question
    if (
      clean.includes(
        "maliyet"
      ) ||
      clean.includes(
        "ucret"
      ) ||
      clean.includes(
        "fiyat"
      ) ||
      clean.includes(
        "ne kadar"
      )
    ) {
      const msg =
        `Maliyet konusu; seçilecek yapı, faaliyet alanı, vize ihtiyacı ve hedefe göre değişmektedir. Bu nedenle tek rakam vermek yerine ihtiyacınıza göre daha doğru tablo çıkarmak gerekir. Şirket kuruluşu, oturum veya yapay zekâ hizmetlerinden hangisi için maliyet öğrenmek istiyorsunuz?`;

      rememberMessage(
        session,
        "assistant",
        msg
      );

      return finalizeReply(
        session,
        msg
      );
    }
  }

  // =================================================
  // GPT GOVERNED FINAL ROUTE
  // =================================================
  const msg =
    await askGPT(
      session,
      userText
    );

  rememberMessage(
    session,
    "assistant",
    msg
  );

  return finalizeReply(
    session,
    msg
  );
}

// =====================================================
// V5 PRO PATCH - PART 7
// FINAL WEBHOOK + ADMIN COMMANDS + DUPLICATE CLEANUP
// REPLACE / UPGRADE WEBHOOK SECTION
// =====================================================

// =====================================================
// WEBHOOK VERIFY
// =====================================================

app.get("/webhook", (req, res) => {
  const mode =
    req.query["hub.mode"];

  const token =
    req.query["hub.verify_token"];

  const challenge =
    req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === VERIFY_TOKEN
  ) {
    return res
      .status(200)
      .send(challenge);
  }

  return res.sendStatus(403);
});

// =====================================================
// ADMIN COMMAND ENGINE
// ADMIN_NUMBER can send:
// pause USERNUMBER
// resume USERNUMBER
// status USERNUMBER
// =====================================================

function adminCommandAllowed(from) {
  if (!ADMIN_NUMBER) return false;

  const a =
    String(
      ADMIN_NUMBER
    ).replace(/\D/g, "");

  const b =
    String(from).replace(
      /\D/g,
      ""
    );

  return a === b;
}

function parseAdminCommand(text = "") {
  const clean =
    normalizeText(text);

  const parts =
    clean.split(" ");

  const cmd =
    parts[0];

  const target =
    parts[1];

  if (
    ["pause", "resume", "status"]
      .includes(cmd) &&
    target
  ) {
    return {
      cmd,
      target
    };
  }

  return null;
}

async function runAdminCommand(
  from,
  command
) {
  const target =
    command.target;

  const session =
    getSession(
      target
    );

  if (
    command.cmd ===
    "pause"
  ) {
    pauseBot(
      session,
      24
    );

    await sendWhatsAppMessage(
      from,
      `✅ Bot paused for ${target} (24h).`
    );

    return true;
  }

  if (
    command.cmd ===
    "resume"
  ) {
    session.pauseUntil =
      null;

    await sendWhatsAppMessage(
      from,
      `✅ Bot resumed for ${target}.`
    );

    return true;
  }

  if (
    command.cmd ===
    "status"
  ) {
    const status =
      isBotPaused(
        session
      )
        ? "PAUSED"
        : "ACTIVE";

    await sendWhatsAppMessage(
      from,
      `📊 ${target}
Status: ${status}
Topic: ${session.lastTopic || "general"}
Lead Score: ${session.leadScore}
Language: ${session.language}`
    );

    return true;
  }

  return false;
}

// =====================================================
// MAIN WEBHOOK RECEIVE
// =====================================================

app.post("/webhook", async (req, res) => {
  try {
    res.sendStatus(200);

    const value =
      req.body?.entry?.[0]
        ?.changes?.[0]
        ?.value;

    const msg =
      value?.messages?.[0];

    if (!msg) return;

    if (
      msg.type !==
      "text"
    ) return;

    const from =
      msg.from;

    const text =
      msg.text?.body ||
      "";

    if (
      !from ||
      !text
    ) return;

    log(
      "TEXT IN:",
      from,
      text
    );

    // -----------------------------------------
    // ADMIN COMMANDS
    // -----------------------------------------
    if (
      adminCommandAllowed(
        from
      )
    ) {
      const cmd =
        parseAdminCommand(
          text
        );

      if (cmd) {
        await runAdminCommand(
          from,
          cmd
        );

        return;
      }
    }

    // -----------------------------------------
    // NORMAL USER FLOW
    // -----------------------------------------
    const session =
      getSession(
        from
      );

    const reply =
      await buildReply(
        session,
        text
      );

    if (!reply) return;

    const finalMsg =
      finalizeReply(
        session,
        reply
      );

    await sendWhatsAppMessage(
      from,
      finalMsg
    );

  } catch (error) {
    log(
      "WEBHOOK FINAL ERROR:",
      error.message
    );
  }
});

// =====================================================
// ROOT
// =====================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    bot: "SAMCHE V5 PRO ELITE",
    status: "online",
    sessions:
      sessions.size,
    memory: "active",
    pings: "active",
    alerts: ADMIN_NUMBER
      ? "active"
      : "off"
  });
});

// =====================================================
// START
// =====================================================

server.listen(PORT, () => {
  log(
    `SAMCHE V5 PRO ELITE STARTED ON PORT ${PORT}`
  );
});

// =====================================================
// FINAL RESULT OF PART 7
// -----------------------------------------------------
// ✅ Strong webhook
// ✅ Admin commands
// ✅ Pause / resume users
// ✅ Human takeover mode
// ✅ Status checks
// ✅ Finalized replies
// ✅ Production grade behavior
// =====================================================
