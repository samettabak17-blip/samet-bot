// worker.js
import cron from "node-cron";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// --------------------------------------
//  WHATSAPP SEND MESSAGE HELPER
// --------------------------------------
async function sendWhatsAppMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body: text }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("Follow-up sent:", to);
  } catch (err) {
    console.log("WhatsApp send error:", err.response?.data || err.message);
  }
}

const FOLLOW_UP_MESSAGES = {
  general: {
    "10m": {
      tr: "Dubai’de yaşamak, çalışmak veya kendi işinizi kurmak… hepsi doğru adımlarla düşündüğünüzden çok daha ulaşılabilir. Dilerseniz paylaştığım bilgilerin ötesine geçip, Dubai’deki yaşamınıza sizi gerçekten yaklaştıracak adımları birlikte netleştirebiliriz. Ne dersiniz, devam edelim mi?",
      en: "Living, working, or starting your own business in Dubai is far more achievable than it may seem when approached with the right steps. If you’d like, we can go beyond the information shared and clarify the actions that will genuinely bring you closer to your Dubai goals. Shall we continue?",
      ar: "العيش أو العمل أو تأسيس عملك الخاص في دبي… كل ذلك أقرب مما تتخيل عند اتخاذ الخطوات الصحيحة. إذا رغبت، يمكننا تجاوز المعلومات التي شاركتها وتحديد الخطوات التي تقرّبك فعليًا من حياتك في دبي. ما رأيك، نتابع؟"
    },
    "3h": {
      tr: "Merhaba. Bir süre iletişim sağlayamadığımızı fark ettim ve sürecinizin yarım kalmasını istemedim. Dubai’de yaşamak, çalışmak veya iş kurmak düşündüğünüzden çok daha ulaşılabilir. Hazırsanız, Dubai’deki planlarınıza sizi gerçekten yaklaştıracak adımları birlikte netleştirebiliriz. Ne dersiniz, devam edelim mi?",
      en: "Hello. I noticed we haven’t been in touch for a while, and I didn’t want your process to remain incomplete. Living, working, or starting a business in Dubai is far more achievable than it seems. If you're ready, we can clarify the steps that will genuinely move you closer to your Dubai goals. Shall we continue?",
      ar: "مرحبًا. لاحظت أننا لم نتواصل منذ فترة ولا أريد أن يتوقف مساركم هنا. العيش أو العمل أو تأسيس عمل في دبي أقرب مما يبدو. إذا كنتم جاهزين، يمكننا تحديد الخطوات التي تقرّبكم فعليًا من أهدافكم في دبي. ما رأيكم، نتابع؟"
    },
    "24h": {
      tr: "Merhaba. Dün paylaştığımız bilgilerle ilgili tekrar iletişimde olmadığımızı fark ettim. Dubai’de yaşam, çalışma ve iş fırsatları doğru planlandığında gerçekten güçlü bir kapı aralıyor. Hazırsanız, Dubai’deki hedeflerinize sizi yaklaştıracak adımları birlikte netleştirebiliriz.",
      en: "Hello. I noticed we haven’t reconnected since the information we discussed yesterday. When planned correctly, Dubai’s living, working, and business opportunities open a truly powerful door. If you're ready, we can clarify the steps that will bring you closer to your goals in Dubai.",
      ar: "مرحبًا. لاحظت أننا لم نتواصل بعد المعلومات التي شاركناها أمس. عند التخطيط الصحيح، تفتح دبي بابًا قويًا للعيش والعمل والفرص التجارية. إذا كنتم جاهزين، يمكننا تحديد الخطوات التي تقرّبكم من أهدافكم في دبي."
    },
    "48h": {
      tr: "Merhaba. Yaklaşık 48 saattir iletişim kuramadığımızı fark ettim ve sürecinizin askıda kalmasını istemedim. Dubai ile ilgili hedeflerinizi netleştirmek isterseniz, sizin için en doğru adımları birlikte belirleyebiliriz.",
      en: "Hello. I noticed we haven’t been in touch for about 48 hours, and I didn’t want your process to remain on hold. If you'd like to clarify your Dubai goals, we can define the right steps together.",
      ar: "مرحبًا. لاحظت أننا لم نتواصل منذ حوالي 48 ساعة ولا أريد أن يتوقف مساركم. إذا رغبتم في توضيح أهدافكم في دبي، يمكننا تحديد الخطوات المناسبة معًا."
    },
    "7d": {
      tr: "Merhaba. Yaklaşık bir haftadır iletişimde olmadığımızı fark ettim. Dubai ile ilgili planlarınız hâlâ geçerliyse, sizin için en doğru stratejiyi birlikte oluşturabiliriz. Hazırsanız kaldığımız yerden devam edebiliriz.",
      en: "Hello. I noticed we haven’t reconnected for about a week. If your Dubai plans are still active, we can build the right strategy together. We can continue whenever you're ready.",
      ar: "مرحبًا. لاحظت أننا لم نتواصل منذ حوالي أسبوع. إذا كانت خططكم في دبي ما زالت قائمة، يمكننا بناء الاستراتيجية المناسبة معًا. أنا جاهز للمتابعة متى شئتم."
    }
  },

  company: {
    "10m": {
      tr: "Dubai’de yaşamak, çalışmak veya kendi işinizi kurmak… hepsi doğru adımlarla düşündüğünüzden çok daha ulaşılabilir. Şirket yapınızı konuştuğumuz noktadan devam etmek isterseniz, sizin için en doğru modeli birlikte netleştirebiliriz.",
      en: "Living, working, or building a business in Dubai is more achievable than it seems. If you'd like to continue from where we left off regarding your company structure, we can define the ideal model together.",
      ar: "العيش أو العمل أو تأسيس شركة في دبي أقرب مما يبدو. إذا رغبت في متابعة ما بدأناه حول هيكل شركتك، يمكننا تحديد النموذج الأنسب معًا."
    },
    "3h": {
      tr: "Merhaba. Bir süre iletişimde olmadığımızı fark ettim. Dubai’de doğru şirket yapısını seçmek uzun vadeli avantaj sağlar. Hazırsanız, sizin için en doğru modeli birlikte netleştirebiliriz.",
      en: "Hello. I noticed we haven’t been in touch. Choosing the right company structure in Dubai provides long‑term advantages. If you're ready, we can define the ideal model together.",
      ar: "مرحبًا. لاحظت أننا لم نتواصل منذ فترة. اختيار الهيكل الصحيح للشركة في دبي يمنحكم مزايا طويلة المدى. إذا كنتم جاهزين، يمكننا تحديد النموذج الأنسب معًا."
    },
    "24h": {
      tr: "Merhaba. Dün şirket yapısıyla ilgili konuşmuştuk. Dubai’de doğru kurulum güçlü bir başlangıç sağlar. Hazırsanız, sizin için en uygun yapıyı birlikte oluşturabiliriz.",
      en: "Hello. Yesterday we discussed your company structure. The right setup in Dubai creates a strong foundation. If you're ready, we can build the ideal structure together.",
      ar: "مرحبًا. تحدثنا أمس عن هيكل شركتكم. الإعداد الصحيح في دبي يمنحكم انطلاقة قوية. إذا كنتم جاهزين، يمكننا بناء الهيكل الأنسب معًا."
    },
    "48h": {
      tr: "Merhaba. Yaklaşık 48 saattir iletişim sağlayamadık. Dubai’de doğru şirket yapısını seçmek uzun vadeli avantaj sağlar. Hazırsanız, sizin için en uygun modeli birlikte netleştirebiliriz.",
      en: "Hello. It’s been about 48 hours since our last contact. Choosing the right company structure in Dubai provides long‑term advantages. If you're ready, we can define the ideal model together.",
      ar: "مرحبًا. مرّ حوالي 48 ساعة دون تواصل. اختيار الهيكل الصحيح للشركة في دبي يمنحكم مزايا طويلة المدى. إذا كنتم جاهزين، يمكننا تحديد النموذج الأنسب معًا."
    },
    "7d": {
      tr: "Merhaba. Yaklaşık bir haftadır iletişimde olmadığımızı fark ettim. Şirket kurma planınız hâlâ geçerliyse, sizin için en doğru yapıyı birlikte oluşturabiliriz.",
      en: "Hello. It’s been nearly a week since we last connected. If your company setup plan is still active, we can build the ideal structure together.",
      ar: "مرحبًا. مرّ ما يقارب أسبوع منذ آخر تواصل بيننا. إذا كانت خطة تأسيس الشركة ما زالت قائمة، يمكننا بناء الهيكل الأنسب معًا."
    }
  },

  residency: {
    "10m": {
      tr: "Dubai’de yaşamak veya oturum almak düşündüğünüzden çok daha ulaşılabilir. Hazırsanız, sizin için en doğru oturum yolunu birlikte netleştirebiliriz.",
      en: "Living in Dubai or obtaining residency is more achievable than it seems. If you're ready, we can define the best residency path together.",
      ar: "العيش في دبي أو الحصول على الإقامة أقرب مما يبدو. إذا كنتم جاهزين، يمكننا تحديد أفضل مسار للإقامة معًا."
    },
    "3h": {
      tr: "Merhaba. Bir süredir iletişimde olmadığımızı fark ettim. Dubai’de oturum süreci doğru planlandığında oldukça hızlı ilerler. Hazırsanız birlikte devam edebiliriz.",
      en: "Hello. I noticed we haven’t been in touch. The residency process in Dubai moves quickly when planned correctly. If you're ready, we can continue together.",
      ar: "مرحبًا. لاحظت أننا لم نتواصل منذ فترة. إجراءات الإقامة في دبي تتقدم بسرعة عند التخطيط الصحيح. إذا كنتم جاهزين، يمكننا المتابعة معًا."
    },
    "24h": {
      tr: "Merhaba. Dün oturum süreciyle ilgili konuşmuştuk. Hazırsanız, Dubai’deki yaşam planınıza en uygun yolu birlikte netleştirebiliriz.",
      en: "Hello. Yesterday we discussed your residency process. If you're ready, we can clarify the best path for your Dubai plans.",
      ar: "مرحبًا. تحدثنا أمس عن إجراءات الإقامة. إذا كنتم جاهزين، يمكننا تحديد المسار الأنسب لخطتكم في دبي."
    },
    "48h": {
      tr: "Merhaba. Yaklaşık 48 saattir iletişimde olmadığımızı fark ettim. Dubai’de oturum süreci doğru planlandığında oldukça hızlı ilerler. Hazırsanız, sizin için en uygun yolu birlikte netleştirebiliriz.",
      en: "Hello. I noticed we haven’t been in touch for about 48 hours. The residency process in Dubai moves quickly when planned correctly. If you're ready, we can clarify the best path together.",
      ar: "مرحبًا. لاحظت أننا لم نتواصل منذ حوالي 48 ساعة. إجراءات الإقامة في دبي تتقدم بسرعة عند التخطيط الصحيح. إذا كنتم جاهزين، يمكننا تحديد المسار الأنسب معًا."
    },
    "7d": {
      tr: "Merhaba. Yaklaşık bir haftadır iletişim kuramadık. Dubai’de oturum planınız hâlâ devam ediyorsa, sizin için en doğru stratejiyi birlikte oluşturabiliriz.",
      en: "Hello. It’s been nearly a week since our last contact. If your residency plan is still active, we can build the right strategy together.",
      ar: "مرحبًا. مرّ ما يقارب أسبوع دون تواصل. إذا كانت خطة الإقامة ما زالت قائمة، يمكننا بناء الاستراتيجية المناسبة معًا."
    }
  },

  cost: {
    "10m": {
      tr: "Dubai’de yaşam ve iş maliyetleri doğru planlandığında düşündüğünüzden çok daha yönetilebilir. Hazırsanız bütçenize en uygun modeli birlikte netleştirebiliriz.",
      en: "Dubai’s living and business costs are far more manageable when planned correctly. If you're ready, we can define the most suitable model together.",
      ar: "تكاليف المعيشة والعمل في دبي يمكن إدارتها بسهولة أكبر عند التخطيط الصحيح. إذا كنتم جاهزين، يمكننا تحديد النموذج الأنسب معًا."
    },
    "3h": {
      tr: "Merhaba. Bir süredir iletişimde olmadığımızı fark ettim. Dubai’de bütçenizi doğru konumlandırmak büyük avantaj sağlar. Hazırsanız birlikte ilerleyebiliriz.",
      en: "Hello. I noticed we haven’t been in touch. Positioning your budget correctly in Dubai provides major advantages. If you're ready, we can continue together.",
      ar: "مرحبًا. لاحظت أننا لم نتواصل منذ فترة. تحديد ميزانيتكم بشكل صحيح في دبي يمنحكم أفضلية كبيرة. إذا كنتم جاهزين، يمكننا المتابعة معًا."
    },
    "24h": {
      tr: "Merhaba. Dün maliyetlerle ilgili konuşmuştuk. Hazırsanız, Dubai’deki bütçe planınızı birlikte optimize edebiliriz.",
      en: "Hello. Yesterday we discussed Dubai costs. If you're ready, we can optimize your budget plan together.",
      ar: "مرحبًا. تحدثنا أمس عن التكاليف. إذا كنتم جاهزين، يمكننا تحسين خطة ميزانيتكم معًا."
    },
    "48h": {
      tr: "Merhaba. Yaklaşık 48 saattir iletişimde olmadığımızı fark ettim. Dubai’de bütçenizi doğru konumlandırmak önemli bir avantaj sağlar. Hazırsanız, sizin için en uygun planı birlikte netleştirebiliriz.",
      en: "Hello. It’s been about 48 hours since we last spoke. Positioning your budget correctly in Dubai provides a strong advantage. If you're ready, we can refine the ideal plan together.",
      ar: "مرحبًا. مرّ حوالي 48 ساعة منذ آخر تواصل. تحديد ميزانيتكم بشكل صحيح في دبي يمنحكم أفضلية قوية. إذا كنتم جاهزين، يمكننا تطوير الخطة الأنسب معًا."
    },
    "7d": {
      tr: "Merhaba. Yaklaşık bir haftadır iletişim sağlayamadık. Dubai’deki maliyet planınız hâlâ geçerliyse, sizin için en uygun modeli birlikte oluşturabiliriz.",
      en: "Hello. It’s been nearly a week since we last connected. If your Dubai cost plan is still active, we can build the most suitable model together.",
      ar: "مرحبًا. مرّ ما يقارب أسبوع دون تواصل. إذا كانت خطة التكاليف ما زالت قائمة، يمكننا بناء النموذج الأنسب معًا."
    }
  },

  AI: {
    "10m": {
      tr: "Dubai’de yaşamak, çalışmak veya kendi işinizi kurmak… hepsi doğru adımlarla düşündüğünüzden çok daha ulaşılabilir. AI projenizi de aynı şekilde net bir yapıya oturtabiliriz. Hazırsanız birlikte ilerleyebiliriz.",
      en: "Living, working, or building a business in Dubai is more achievable than it seems. We can bring the same clarity to your AI project. If you're ready, we can move forward together.",
      ar: "العيش أو العمل أو تأسيس عمل في دبي أقرب مما يبدو. ويمكننا تطبيق نفس الوضوح على مشروع الذكاء الاصطناعي الخاص بكم. إذا كنتم جاهزين، يمكننا المتابعة معًا."
    },
    "3h": {
      tr: "Merhaba. Bir süredir iletişimde olmadığımızı fark ettim. AI projeniz düşündüğünüzden çok daha hızlı ilerleyebilir. Hazırsanız birlikte netleştirebiliriz.",
      en: "Hello. I noticed we haven’t been in touch. Your AI project can progress much faster than expected. If you're ready, we can refine it together.",
      ar: "مرحبًا. لاحظت أننا لم نتواصل منذ فترة. يمكن لمشروع الذكاء الاصطناعي أن يتقدم أسرع مما تتوقعون. إذا كنتم جاهزين، يمكننا تطويره معًا."
    },
    "24h": {
      tr: "Merhaba. Dün paylaştığımız bilgilerle ilgili tekrar iletişimde olmadığımızı fark ettim. AI projeniz doğru planlandığında güçlü bir fırsata dönüşebilir. Hazırsanız birlikte ilerleyebiliriz.",
      en: "Hello. I noticed we haven’t reconnected since yesterday’s discussion. With the right planning, your AI project can become a strong opportunity. If you're ready, we can move forward together.",
      ar: "مرحبًا. لاحظت أننا لم نتواصل بعد مناقشة الأمس. يمكن لمشروع الذكاء الاصطناعي أن يتحول إلى فرصة قوية عند التخطيط الصحيح. إذا كنتم جاهزين، يمكننا المتابعة معًا."
    },
    "48h": {
      tr: "Merhaba. Yaklaşık 48 saattir iletişimde olmadığımızı fark ettim. AI projeniz düşündüğünüzden çok daha hızlı ilerleyebilir. Hazırsanız, adımları birlikte netleştirebiliriz.",
      en: "Hello. It’s been about 48 hours since our last contact. Your AI project can progress much faster than expected. If you're ready, we can clarify the next steps together.",
      ar: "مرحبًا. مرّ حوالي 48 ساعة دون تواصل. يمكن لمشروع الذكاء الاصطناعي أن يتقدم أسرع مما تتوقعون. إذا كنتم جاهزين، يمكننا تحديد الخطوات التالية معًا."
    },
    "7d": {
      tr: "Merhaba. Yaklaşık bir haftadır iletişim kuramadık. AI projeniz hâlâ gündemdeyse, sizin için en doğru çözüm modelini birlikte oluşturabiliriz.",
      en: "Hello. It’s been nearly a week since we last connected. If your AI project is still active, we can build the ideal solution model together.",
      ar: "مرحبًا. مرّ ما يقارب أسبوع دون تواصل. إذا كان مشروع الذكاء الاصطناعي ما زال قائمًا، يمكننا بناء النموذج الأنسب معًا."
    }
  }
};


// --------------------------------------
//  CRON SCHEDULES
// --------------------------------------

// 10 dakika
cron.schedule("*/10 * * * *", () => {
  console.log("10m cron running...");
  // sendWhatsAppMessage("PHONE", FOLLOW_UP_MESSAGES.general["10m"].tr);
});

// 3 saat
cron.schedule("0 */3 * * *", () => {
  console.log("3h cron running...");
});

// 24 saat
cron.schedule("0 0 * * *", () => {
  console.log("24h cron running...");
});

// 48 saat
cron.schedule("0 0 */2 * *", () => {
  console.log("48h cron running...");
});

// 7 gün
cron.schedule("0 0 */7 * *", () => {
  console.log("7d cron running...");
});

console.log("Worker is running...");
