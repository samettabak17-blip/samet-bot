// worker.js
import cron from "node-cron";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// ------------------------------------------------------
// SESSIONS STORE (TEK DOSYADA)
// ------------------------------------------------------
const sessions = {};

// ------------------------------------------------------
// WHATSAPP MESAJ GÖNDERME
// ------------------------------------------------------
async function sendMessage(to, text) {
  try {
    const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: text }
    };

    const headers = {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    };

    const res = await axios.post(url, payload, { headers });

    console.log("[SEND] SENT:", to, res.data?.messages?.[0]?.id || "");
  } catch (err) {
    console.error("[SEND] ERROR:", to, err.response?.data || err.message);
  }
}

// -----------------------------------------------------
// 10 DAKİKA PING MESAJLARI
// -----------------------------------------------------
function getPingMessage(lang, topic) {
  const messages = {
    tr: {
      general:
        "Dubai’de yaşamak, çalışmak veya kendi işinizi kurmak… hepsi doğru adımlarla düşündüğünüzden çok daha ulaşılabilir. Dilerseniz paylaştığım bilgilerin ötesine geçip, Dubai’deki yaşamınıza sizi gerçekten yaklaştıracak adımları birlikte netleştirebiliriz. Ne dersiniz, devam edelim mi?",

      company:
        "Dubai’de doğru şirket yapısını seçmek, hem vergi avantajlarınızı hem de uzun vadeli operasyonel özgürlüğünüzü doğrudan etkiler. Profilinize en uygun modeli birlikte tasarlayabiliriz; doğru yapı gerçekten büyük fark yaratır. Hazırsanız süreci birlikte şekillendirebiliriz, devam edelim mi?",

      residency:
        "Dubai’de oturum almak, burada kuracağınız yaşamın temelini oluşturur. Sizin için en sorunsuz ve en doğru yolu belirlemek isterseniz, süreci çok daha hızlı ve net bir çerçevede ilerletebiliriz. Hazır olduğunuzda bir sonraki adımı birlikte planlayabiliriz; devam edelim mi?",

      cost:
        "Dubai’de bütçenizi doğru konumlandırmak, hem yaşam planınızı hem de iş hedeflerinizi çok daha güçlü bir zemine taşır. Paylaştığım maliyet bilgilerinin ötesinde, sizin için en uygun yapıyı birlikte netleştirebiliriz. İsterseniz bir sonraki adımı belirleyelim, devam edelim mi?",

      AI:
        "Doğru AI ve otomasyon yapısı, işinizi birkaç adım öne taşıyabilir. Projenizi daha verimli ve ölçeklenebilir bir modele dönüştürmek isterseniz, sizin için en uygun yapıyı birlikte planlayabiliriz. Çözüm paketlerimizi incelemek isterseniz bağlantıyı bırakıyorum:\nhttps://aichatbot.samchecompany.com/#pricing\nNe dersiniz, devam edelim mi?",
    },

    en: {
      company:
        "If you'd like to move forward with your company setup, I can help you structure the next steps clearly and efficiently.",
      residency:
        "If you’d like to proceed with the residency and visa options we discussed, I’m here to guide you through the next steps.",
      AI:
        "Based on the AI and automation insights I’ve shared, we can plan the next step to make your project more efficient and scalable.\n\nIf you’d like to explore our AI Chatbot plans, you can visit the link below:\nhttps://aichatbot.samchecompany.com/#pricing",
      cost:
        "If you'd like to continue based on the cost and process details I shared, we can finalize the most suitable plan together.",
      general:
        "Whenever you're ready, we can clarify the next steps based on the information I shared earlier."
    },

    ar: {
      company:
        "إذا كنتم ترغبون بالمتابعة في تأسيس الشركة، يمكنني مساعدتكم في تحديد الخطوات التالية بوضوح.",
      residency:
        "إذا رغبتم بالمتابعة في خيارات الإقامة والتأشيرات، يسعدني توجيهكم للخطوة التالية.",
      AI:
        "استنادًا إلى الاقتراحات والمعلومات التي شاركتها حول حلول الذكاء الاصطناعي والأتمتة، يمكننا التخطيط للخطوة التالية لجعل مشروعك أكثر كفاءة وقابلية للتوسع.\n\nإذا كنت ترغب في الاطلاع على خطط روبوت الدردشة بالذكاء الاصطناعي، يمكنك زيارة الرابط التالي:\nhttps://aichatbot.samchecompany.com/#pricing",
      cost:
        "إذا رغبتم بالمتابعة بناءً على تفاصيل التكاليف، يمكننا تحديد الخطة الأنسب لكم.",
      general:
        "عندما تكونون جاهزين، يمكننا تحديد الخطوات التالية بناءً على المعلومات التي شاركتها."
    }
  };

  const langSet = messages[lang] || messages["en"];
  return langSet[topic] || langSet["general"];
}

// -----------------------------------------------------
// FOLLOW-UP MESAJLARI (3h – 24h – 72h – 7d)
// -----------------------------------------------------
function getFollowUpMessage(lang, topic, stage) {
  const messages = {

    // -------------------------
    // 3 SAAT
    // -------------------------
    "3h": {
      general: {
        tr: "Merhaba. Bir süre iletişim sağlayamadığımızı fark ettim ve sürecinizin yarım kalmasını istemedim. Dubai’de yaşamak, çalışmak veya iş kurmak düşündüğünüzden çok daha ulaşılabilir. Hazırsanız, Dubai’deki planlarınıza sizi gerçekten yaklaştıracak adımları birlikte netleştirebiliriz. Ne dersiniz, devam edelim mi?",
        en: "Hello. I noticed we haven’t been in touch for a while and didn’t want your process to remain incomplete. Living, working or building a business in Dubai is far more achievable with the right steps. If you're ready, we can clarify the next actions that bring you closer to your plans in Dubai. Shall we continue?",
        ar: "مرحبًا. لاحظت أننا لم نتواصل منذ فترة ولم أرغب أن تتوقف خطتكم في منتصف الطريق. العيش أو العمل أو تأسيس عمل في دبي يصبح أسهل بكثير عند اتخاذ الخطوات الصحيحة. إذا كنتم جاهزين، يمكننا تحديد الخطوات التي تقرّبكم من خططكم في دبي. ما رأيكم، هل نتابع؟"
      },

      company: {
        tr: "Merhaba. Bir süredir iletişimde olmadığımızı fark ettim ve şirket kuruluşu planlarınızın askıda kalmasını istemedim. Dubai’de doğru şirket yapısını seçmek uzun vadede ciddi avantaj sağlar. Profilinize en uygun modeli birlikte şekillendirebiliriz. Hazırsanız süreci netleştirelim, devam edelim mi?",
        en: "Hello. I noticed we haven’t been in touch and didn’t want your company formation plans to remain on hold. Choosing the right company structure in Dubai provides significant long-term advantages. We can shape the most suitable model for your profile. If you're ready, shall we continue?",
        ar: "مرحبًا. لاحظت أننا لم نتواصل منذ فترة ولم أرغب أن تتوقف خطتكم لتأسيس الشركة. اختيار الهيكل الصحيح للشركة في دبي يمنحكم مزايا كبيرة على المدى الطويل. يمكننا تحديد النموذج الأنسب لملفكم. إذا كنتم جاهزين، هل نتابع؟"
      },

      residency: {
        tr: "Merhaba. Bir süre iletişim sağlayamadığımızı fark ettim ve oturum sürecinizin gecikmesini istemedim. Dubai’de oturum almak, burada kuracağınız yaşamın temel adımıdır. Sizin için en sorunsuz yolu belirlemeye devam edebiliriz. Hazır olduğunuzda ilerleyebiliriz, devam edelim mi?",
        en: "Hello. I noticed we haven’t been in touch and didn’t want your residency process to be delayed. Obtaining residency in Dubai is the foundation of building your life here. We can continue identifying the smoothest path for you. If you're ready, shall we proceed?",
        ar: "مرحبًا. لاحظت أننا لم نتواصل منذ فترة ولم أرغب أن يتأخر مسار الإقامة الخاص بكم. الحصول على الإقامة في دبي هو الخطوة الأساسية لبناء حياتكم هنا. يمكننا متابعة تحديد المسار الأنسب لكم. إذا كنتم جاهزين، هل نتابع؟"
      },

      cost: {
        tr: "Merhaba. Bir süredir iletişim kuramadığımızı fark ettim ve bütçe planlamanızın havada kalmasını istemedim. Dubai’de maliyetleri doğru konumlandırmak, yaşam ve iş hedeflerinizi çok daha güçlü bir zemine taşır. Sizin için en uygun yapıyı netleştirebiliriz. Ne dersiniz, devam edelim mi?",
        en: "Hello. I noticed we haven’t been in touch and didn’t want your budgeting process to remain unclear. Positioning your costs correctly in Dubai strengthens both your lifestyle and business goals. We can clarify the most suitable structure for you. Shall we continue?",
        ar: "مرحبًا. لاحظت أننا لم نتواصل منذ فترة ولم أرغب أن تبقى خطتكم المالية غير واضحة. تحديد التكاليف بشكل صحيح في دبي يعزز أهدافكم المعيشية والعملية. يمكننا تحديد الهيكل الأنسب لكم. ما رأيكم، هل نتابع؟"
      },

      AI: {
        tr: "Merhaba. Bir süre iletişim sağlayamadığımızı fark ettim ve projenizin beklemede kalmasını istemedim. Doğru AI yapısı işinizi birkaç adım öne taşıyabilir. Projenizi daha verimli ve ölçeklenebilir bir modele dönüştürmek isterseniz birlikte planlayabiliriz. Hazırsanız devam edelim mi?",
        en: "Hello. I noticed we haven’t been in touch and didn’t want your project to remain on hold. The right AI structure can move your business several steps ahead. If you'd like to transform your project into a more efficient and scalable model, we can plan it together. Shall we continue?",
        ar: "مرحبًا. لاحظت أننا لم نتواصل منذ فترة ولم أرغب أن يبقى مشروعكم متوقفًا. الهيكل الصحيح للذكاء الاصطناعي يمكن أن يدفع عملكم عدة خطوات إلى الأمام. إذا رغبتم في تحويل مشروعكم إلى نموذج أكثر كفاءة وقابلية للتوسع، يمكننا التخطيط له معًا. هل نتابع؟"
      }
    },

    // -------------------------
    // 24 SAAT
    // -------------------------
    "24h": {
      general: {
        tr: "Merhaba. Dün paylaştığımız bilgilerle ilgili tekrar iletişimde olmadığımızı fark ettim. Dubai’de yaşam, çalışma ve iş fırsatları doğru planlandığında gerçekten güçlü bir kapı aralıyor. Hazırsanız, Dubai’deki hedeflerinize sizi yaklaştıracak adımları birlikte netleştirebiliriz.",
        en: "Hello. I noticed we haven’t reconnected since yesterday. Living, working or building a business in Dubai opens strong opportunities when planned correctly. If you're ready, we can clarify the next steps that bring you closer to your goals in Dubai.",
        ar: "مرحبًا. لاحظت أننا لم نتواصل منذ الأمس. العيش أو العمل أو تأسيس عمل في دبي يفتح فرصًا قوية عند التخطيط الصحيح. إذا كنتم جاهزين، يمكننا تحديد الخطوات التي تقرّبكم من أهدافكم في دبي."
      },

      company: {
        tr: "Merhaba. Şirket kuruluşu sürecinizle ilgili dün konuştuğumuzdan beri iletişimde olmadığımızı fark ettim. Dubai’de doğru şirket yapısını seçmek uzun vadeli avantaj sağlar. Hazırsanız, sizin için en uygun modeli birlikte netleştirebiliriz.",
        en: "Hello. I noticed we haven’t reconnected regarding your company setup. Choosing the right structure in Dubai creates long-term advantages. If you're ready, we can finalize the model that best fits your profile.",
        ar: "مرحبًا. لاحظت أننا لم نتابع بخصوص تأسيس الشركة. اختيار الهيكل الصحيح في دبي يمنحكم مزايا طويلة المدى. إذا كنتم جاهزين، يمكننا تحديد النموذج الأنسب لملفكم."
      },

      residency: {
        tr: "Merhaba. Oturum sürecinizle ilgili dün konuştuğumuzdan beri iletişimde olmadığımızı fark ettim. Dubai’de oturum almak düşündüğünüzden daha hızlı ilerleyebilir. Hazırsanız, sizin için en sorunsuz yolu birlikte belirleyebiliriz.",
        en: "Hello. I noticed we haven’t followed up on your residency process. Obtaining residency in Dubai can move faster than expected. If you're ready, we can identify the smoothest path for you.",
        ar: "مرحبًا. لاحظت أننا لم نتابع بخصوص الإقامة. الحصول على الإقامة في دبي قد يكون أسرع مما تتوقعون. إذا كنتم جاهزين، يمكننا تحديد المسار الأنسب لكم."
      },

      cost: {
        tr: "Merhaba. Dün maliyetlerle ilgili konuşmamızdan sonra iletişimde olmadığımızı fark ettim. Dubai’de bütçenizi doğru konumlandırmak hem yaşam hem iş planınızı güçlendirir. Hazırsanız, sizin için en uygun yapıyı netleştirebiliriz.",
        en: "Hello. I noticed we haven’t reconnected regarding the cost details. Positioning your budget correctly in Dubai strengthens both your lifestyle and business plans. If you're ready, we can clarify the best structure for you.",
        ar: "مرحبًا. لاحظت أننا لم نتابع بخصوص التكاليف. تحديد ميزانيتكم بشكل صحيح في دبي يعزز خططكم المعيشية والعملية. إذا كنتم جاهزين، يمكننا تحديد الهيكل الأنسب لكم."
      },

      AI: {
        tr: "Merhaba. Dün AI projenizle ilgili konuştuğumuzdan beri iletişimde olmadığımızı fark ettim. Doğru otomasyon yapısı işinizi birkaç adım öne taşıyabilir. Hazırsanız, projenizi ölçeklenebilir bir modele dönüştürecek adımları planlayabiliriz.",
        en: "Hello. I noticed we haven’t followed up on your AI project. The right automation structure can move your business several steps ahead. If you're ready, we can plan the steps to make your project scalable.",
        ar: "مرحبًا. لاحظت أننا لم نتابع بخصوص مشروع الذكاء الاصطناعي. الهيكل الصحيح للأتمتة يمكن أن يدفع عملكم عدة خطوات إلى الأمام. إذا كنتم جاهزين، يمكننا التخطيط للخطوات التي تجعل مشروعكم قابلًا للتوسع."
      }
    },
    // -----------------------------------------------------
    // 72 SAAT
    // -----------------------------------------------------
    "72h": {
      general: {
        tr: "Merhaba. Birkaç gündür iletişimde olmadığımızı fark ettim. Dubai’deki planlarınızın askıda kalmasını istemem. Hazırsanız, sizin için en doğru yolu birlikte netleştirebiliriz.",
        en: "Hello. I noticed we haven’t been in touch for a few days. I don’t want your Dubai plans to remain on hold. If you're ready, we can clarify the best path forward.",
        ar: "مرحبًا. لاحظت أننا لم نتواصل منذ عدة أيام. لا أرغب أن تبقى خططكم في دبي معلّقة. إذا كنتم جاهزين، يمكننا تحديد المسار الأنسب لكم."
      },

      company: {
        tr: "Merhaba. Şirket kuruluşu planlarınızın birkaç gündür ilerlemediğini fark ettim. Dubai’de doğru yapı büyük fark yaratır. Hazırsanız, süreci birlikte hızlandırabiliriz.",
        en: "Hello. I noticed your company setup process hasn’t progressed in the last few days. The right structure in Dubai makes a major difference. If you're ready, we can move forward together.",
        ar: "مرحبًا. لاحظت أن عملية تأسيس الشركة لم تتقدم منذ عدة أيام. الهيكل الصحيح في دبي يحدث فرقًا كبيرًا. إذا كنتم جاهزين، يمكننا المتابعة معًا."
      },

      residency: {
        tr: "Merhaba. Oturum sürecinizin birkaç gündür ilerlemediğini fark ettim. Dubai’de oturum almak düşündüğünüzden daha hızlı tamamlanabilir. Hazırsanız, süreci netleştirebiliriz.",
        en: "Hello. I noticed your residency process hasn’t progressed for a few days. Residency in Dubai can be completed faster than expected. If you're ready, we can clarify the next steps.",
        ar: "مرحبًا. لاحظت أن عملية الإقامة لم تتقدم منذ عدة أيام. يمكن إنهاء الإقامة في دبي أسرع مما تتوقعون. إذا كنتم جاهزين، يمكننا تحديد الخطوات التالية."
      },

      cost: {
        tr: "Merhaba. Bütçe planlamanızın birkaç gündür askıda kaldığını fark ettim. Dubai’de maliyetleri doğru yönetmek önemli avantaj sağlar. Hazırsanız, sizin için en uygun yapıyı belirleyebiliriz.",
        en: "Hello. I noticed your budgeting process has been on hold for a few days. Managing costs correctly in Dubai provides major advantages. If you're ready, we can define the best structure for you.",
        ar: "مرحبًا. لاحظت أن خطتكم المالية معلّقة منذ عدة أيام. إدارة التكاليف بشكل صحيح في دبي يمنحكم مزايا كبيرة. إذا كنتم جاهزين، يمكننا تحديد الهيكل الأنسب لكم."
      },

      AI: {
        tr: "Merhaba. AI projenizin birkaç gündür ilerlemediğini fark ettim. Doğru otomasyon yapısı işinizi hızla ileri taşır. Hazırsanız, projenizi birlikte netleştirebiliriz.",
        en: "Hello. I noticed your AI project hasn’t progressed for a few days. The right automation structure accelerates your business significantly. If you're ready, we can refine your project together.",
        ar: "مرحبًا. لاحظت أن مشروع الذكاء الاصطناعي لم يتقدم منذ عدة أيام. الهيكل الصحيح للأتمتة يدفع عملكم بسرعة إلى الأمام. إذا كنتم جاهزين، يمكننا تطوير المشروع معًا."
      }
    },

    // -----------------------------------------------------
    // 7 GÜN
    // -----------------------------------------------------
    "7d": {
      general: {
        tr: "Merhaba. Bir haftadır iletişimde olmadığımızı fark ettim. Dubai ile ilgili planlarınız hâlâ geçerliyse, sizin için en doğru yolu birlikte belirleyebiliriz. Hazır olduğunuzda buradayım.",
        en: "Hello. I noticed we haven’t been in touch for a week. If your Dubai plans are still active, we can define the best path together. I’m here whenever you're ready.",
        ar: "مرحبًا. لاحظت أننا لم نتواصل منذ أسبوع. إذا كانت خططكم في دبي ما زالت قائمة، يمكننا تحديد المسار الأنسب لكم. أنا هنا متى ما كنتم جاهزين."
      },

      company: {
        tr: "Merhaba. Şirket kuruluşu planlarınızla ilgili bir haftadır iletişimde olmadığımızı fark ettim. Dubai’de doğru yapı uzun vadeli avantaj sağlar. Hazır olduğunuzda süreci birlikte ilerletebiliriz.",
        en: "Hello. I noticed we haven’t followed up on your company setup for a week. The right structure in Dubai provides long-term advantages. Whenever you're ready, we can move forward.",
        ar: "مرحبًا. لاحظت أننا لم نتابع بخصوص تأسيس الشركة منذ أسبوع. الهيكل الصحيح في دبي يمنحكم مزايا طويلة المدى. أنا هنا متى ما كنتم جاهزين."
      },

      residency: {
        tr: "Merhaba. Oturum sürecinizle ilgili bir haftadır iletişimde olmadığımızı fark ettim. Dubai’de oturum almak düşündüğünüzden daha hızlı ilerleyebilir. Hazır olduğunuzda devam edebiliriz.",
        en: "Hello. I noticed we haven’t followed up on your residency process for a week. Residency in Dubai can progress faster than expected. We can continue whenever you're ready.",
        ar: "مرحبًا. لاحظت أننا لم نتابع بخصوص الإقامة منذ أسبوع. يمكن أن تتقدم الإقامة في دبي أسرع مما تتوقعون. أنا هنا متى ما كنتم جاهزين."
      },

      cost: {
        tr: "Merhaba. Bütçe planlamanızla ilgili bir haftadır iletişimde olmadığımızı fark ettim. Dubai’de maliyetleri doğru yönetmek önemli avantaj sağlar. Hazır olduğunuzda sizin için en uygun yapıyı belirleyebiliriz.",
        en: "Hello. I noticed we haven’t discussed your budgeting for a week. Managing costs correctly in Dubai provides major advantages. We can define the best structure whenever you're ready.",
        ar: "مرحبًا. لاحظت أننا لم نناقش خطتكم المالية منذ أسبوع. إدارة التكاليف بشكل صحيح في دبي يمنحكم مزايا كبيرة. أنا هنا متى ما كنتم جاهزين."
      },

      AI: {
        tr: "Merhaba. AI projenizle ilgili bir haftadır iletişimde olmadığımızı fark ettim. Doğru otomasyon yapısı işinizi hızla ileri taşır. Hazır olduğunuzda projenizi birlikte netleştirebiliriz.",
        en: "Hello. I noticed we haven’t followed up on your AI project for a week. The right automation structure can rapidly move your business forward. Whenever you're ready, we can refine your project.",
        ar: "مرحبًا. لاحظت أننا لم نتابع بخصوص مشروع الذكاء الاصطناعي منذ أسبوع. الهيكل الصحيح للأتمتة يمكن أن يدفع عملكم بسرعة إلى الأمام. أنا هنا متى ما كنتم جاهزين."
      }
    }
  };

  return (
    messages[stage]?.[topic]?.[lang] ||
    messages[stage]?.["general"]?.[lang] ||
    messages[stage]?.["general"]?.["tr"]
  );
}

// ------------------------------------------------------
// CRON — HER 10 DAKİKADA BİR
// ------------------------------------------------------
cron.schedule("*/10 * * * *", async () => {
  console.log("[CRON] Hatırlatma kontrolü tetiklendi:", new Date().toLocaleString());

  try {
    const now = Date.now();

    if (!sessions || typeof sessions !== "object") return;
    const users = Object.keys(sessions);
    if (!users.length) return;

    for (const user of users) {
      try {
        const s = sessions[user];
        if (!s || typeof s !== "object") continue;

        // firstMessageTime yoksa oluştur
        if (!s.firstMessageTime || isNaN(Number(s.firstMessageTime))) {
          s.firstMessageTime = s.lastMessageTime || now;
        }

        // 10 dakika için lastMessageTime zorunlu
        if (!s.lastMessageTime || isNaN(Number(s.lastMessageTime))) continue;

        const diffMinutesLast = (now - s.lastMessageTime) / (1000 * 60);
        if (!isFinite(diffMinutesLast) || diffMinutesLast < 0) continue;

        const diffMinutes = (now - s.firstMessageTime) / (1000 * 60);
        const diffHours = diffMinutes / 60;

        const topics = Array.isArray(s.topics) ? s.topics : [];
        const lastTopic = topics.length ? topics[topics.length - 1] : "general";
        const lang = typeof s.lang === "string" ? s.lang : "en";

        if (typeof s.followUpStage !== "number") {
          s.followUpStage = 0;
        }

        // 10 DAKİKA PING — SADECE 1 KERE
        if (diffMinutesLast >= 10 && !s.pingSentOnce) {
          const pingMessage = getPingMessage(lang, lastTopic);

          if (pingMessage) {
            try {
              await sendMessage(user, pingMessage);
              console.log("[CRON] 10m ping sent to:", user);
            } catch (e) {
              console.error("[CRON] sendMessage 10min error:", e);
            }
            s.pingSentOnce = true;
          }

          continue;
        }

        if (diffMinutesLast < 10 && s.pingSentOnce) {
          s.pingSentOnce = false;
        }

        // 3 SAAT FOLLOW-UP
        if (s.followUpStage === 0 && diffHours >= 3) {
          const msg = getFollowUpMessage(lang, lastTopic, "3h");

          if (msg) {
            try {
              await sendMessage(user, msg);
              console.log("[CRON] 3h follow-up sent to:", user);
            } catch (e) {
              console.error("[CRON] sendMessage 3h error:", e);
            }
            s.followUpStage = 1;
          }

          continue;
        }

        // 24 SAAT FOLLOW-UP
        if (s.followUpStage === 1 && diffHours >= 24) {
          const msg = getFollowUpMessage(lang, lastTopic, "24h");

          if (msg) {
            try {
              await sendMessage(user, msg);
              console.log("[CRON] 24h follow-up sent to:", user);
            } catch (e) {
              console.error("[CRON] sendMessage 24h error:", e);
            }
            s.followUpStage = 2;
          }

          continue;
        }

        // 48 SAAT FOLLOW-UP
        if (s.followUpStage === 2 && diffHours >= 48) {
          const msg = getFollowUpMessage(lang, lastTopic, "48h");

          if (msg) {
            try {
              await sendMessage(user, msg);
              console.log("[CRON] 48h follow-up sent to:", user);
            } catch (e) {
              console.error("[CRON] sendMessage 48h error:", e);
            }
            s.followUpStage = 3;
          }

          continue;
        }

        // 72 SAAT FOLLOW-UP
        if (s.followUpStage === 3 && diffHours >= 72) {
          const msg = getFollowUpMessage(lang, lastTopic, "72h");

          if (msg) {
            try {
              await sendMessage(user, msg);
              console.log("[CRON] 72h follow-up sent to:", user);
            } catch (e) {
              console.error("[CRON] sendMessage 72h error:", e);
            }
            s.followUpStage = 4;
          }

          continue;
        }

        // 7 GÜN FOLLOW-UP
        if (s.followUpStage === 4 && diffHours >= 168) {
          const msg = getFollowUpMessage(lang, lastTopic, "7d");

          if (msg) {
            try {
              await sendMessage(user, msg);
              console.log("[CRON] 7d follow-up sent to:", user);
            } catch (e) {
              console.error("[CRON] sendMessage 7d error:", e);
            }
            s.followUpStage = 5;
          }

          continue;
        }

      } catch (err) {
        console.error("[CRON] User loop error:", err);
        continue;
      }
    }
  } catch (err) {
    console.error("[CRON] Genel hata:", err);
  }
});

console.log("Worker is running...");
